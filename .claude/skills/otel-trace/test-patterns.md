# OTel Test Patterns

How to mock the OpenTelemetry API and test custom instrumentation in Vitest.

## 6 Test Files (112 OTel-Specific Tests)

| File | Tests | What It Covers |
|---|---|---|
| `telemetry.test.ts` | ~41 | `RenovationSampler` conditions, constructor, ratio sampling |
| `telemetry-http-db.test.ts` | | `requestHook`, `extractTableName`, header sanitization |
| `telemetry-production.test.ts` | ~17 | BatchSpanProcessor config, exporter timeouts, force-sample |
| `socketio-tracing.middleware.test.ts` | ~21 | `traceSocketEvent`, `traceConnection`, `addMessageAttributes`, etc. |
| `ai-tracing.test.ts` | ~27 | `traceAICall`, `startAIStreamSpan`, `estimateCost`, `recordTokenUsage` |
| `logger-trace-correlation.test.ts` | ~6 | `getTraceContext` injects trace_id/span_id into logs |

## Mock Pattern 1: Mock Tracer + Span (AI Tracing)

For testing code that creates spans via `trace.getTracer()`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpanStatusCode } from '@opentelemetry/api';

/** Properly typed mock span */
interface MockSpan {
  setAttribute: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  recordException: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

// vi.hoisted ensures mocks are available when vi.mock is hoisted
const { mockSpan, mockTracer } = vi.hoisted(() => {
  const span: MockSpan = {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };

  const tracer = {
    startActiveSpan: vi.fn((_name: string, fn: (s: MockSpan) => unknown) => fn(span)),
    startSpan: vi.fn(() => span),
  };

  return { mockSpan: span, mockTracer: tracer };
});

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return {
    ...actual,
    trace: {
      getTracer: vi.fn(() => mockTracer),
    },
  };
});

// Now import the module under test AFTER mocking
import { traceAICall } from '../../../src/utils/ai-tracing.js';

describe('traceAICall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a span and set attributes', async () => {
    await traceAICall('ai.test', { 'ai.system': 'gemini' }, async () => 'ok');

    expect(mockTracer.startActiveSpan).toHaveBeenCalledWith('ai.test', expect.any(Function));
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.system', 'gemini');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('should record exception on error', async () => {
    const error = new Error('AI failed');
    await expect(
      traceAICall('ai.test', {}, async () => { throw error; }),
    ).rejects.toThrow('AI failed');

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'AI failed',
    });
    expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    expect(mockSpan.end).toHaveBeenCalled();
  });
});
```

## Mock Pattern 2: Mock Active Span (Socket.io Attribute Helpers)

For testing code that enriches the current active span:

```typescript
const mockActiveSpan = {
  setAttribute: vi.fn(),
};

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual('@opentelemetry/api');
  return {
    ...actual,
    trace: {
      getTracer: () => ({
        startSpan: () => mockSpan,
        startActiveSpan: (_: unknown, fn: (span: typeof mockSpan) => void) => fn(mockSpan),
      }),
      getActiveSpan: () => mockActiveSpan,  // <-- for add*Attributes helpers
    },
  };
});

// Test
it('should set session.id on active span', () => {
  addJoinAttributes('session-abc');
  expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('session.id', 'session-abc');
});
```

## Mock Pattern 3: Mock Socket (Socket.io Tracing)

```typescript
function createMockSocket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-socket-id',
    conn: {
      transport: { name: 'websocket' },
    },
    rooms: new Set(['test-socket-id']),
    user: undefined,
    ...overrides,
  };
}

// Use with `as never` cast
traceConnection(createMockSocket() as never);
```

## Mock Pattern 4: Sampler Tests

The sampler is a plain class — no mocking needed:

```typescript
import { SpanKind } from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { RenovationSampler } from '../../../src/config/telemetry.js';

// Mock logger to prevent console output
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  })),
}));

const sampler = new RenovationSampler(0.1);
const ROOT_CONTEXT = {} as never;
const NO_LINKS: never[] = [];

it('should always sample AI operations', () => {
  const result = sampler.shouldSample(
    ROOT_CONTEXT,
    'aaaabbbbccccdddd1111222233334444',
    'ai.chat.invoke',
    SpanKind.INTERNAL,
    {},
    NO_LINKS,
  );
  expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
});
```

## Mock Pattern 5: Logger Trace Correlation

For testing that logs include trace context:

```typescript
import { trace, isSpanContextValid } from '@opentelemetry/api';

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual('@opentelemetry/api');
  return {
    ...actual,
    trace: {
      getActiveSpan: vi.fn(),
    },
    isSpanContextValid: vi.fn(),
  };
});

it('should inject trace_id and span_id when active span exists', () => {
  const mockSpanContext = {
    traceId: 'abc123def456',
    spanId: '789ghi012',
    traceFlags: 1,
  };

  (trace.getActiveSpan as ReturnType<typeof vi.fn>).mockReturnValue({
    spanContext: () => mockSpanContext,
  });
  (isSpanContextValid as ReturnType<typeof vi.fn>).mockReturnValue(true);

  // Capture console.info output
  const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

  logger.info('test message');

  const logOutput = JSON.parse(consoleSpy.mock.calls[0][0]);
  expect(logOutput.trace_id).toBe('abc123def456');
  expect(logOutput.span_id).toBe('789ghi012');
});
```

## Mock Pattern 6: Performance.now (Streaming Spans)

For testing time-based attributes:

```typescript
let currentTime: number;
let perfNowSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  currentTime = 1000;
  perfNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
});

afterEach(() => {
  perfNowSpy.mockRestore();
});

it('should track first token timing', () => {
  const { onFirstToken } = startAIStreamSpan('ai.stream', {});

  currentTime = 1250;  // 250ms after start
  onFirstToken();

  expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.stream.first_token_ms', 250);
});
```

## Assertion Helpers

### Filter setAttribute calls by attribute name

```typescript
function getAttrCalls(spy: ReturnType<typeof vi.fn>, attrName: string): unknown[][] {
  return spy.mock.calls.filter((call: unknown[]) => call[0] === attrName);
}

// Usage:
expect(getAttrCalls(mockSpan.setAttribute, 'ai.model')).toHaveLength(1);
expect(getAttrCalls(mockSpan.setAttribute, 'ai.model')[0][1]).toBe('gemini-2.5-flash');
```

### Assert attribute was NOT set

```typescript
it('should not include user.id when unauthenticated', () => {
  traceConnection(createMockSocket() as never);

  const userIdCalls = mockSpan.setAttribute.mock.calls.filter(
    (call: [string, unknown]) => call[0] === 'user.id',
  );
  expect(userIdCalls).toHaveLength(0);
});
```

### Assert no content leakage (privacy test)

```typescript
it('should never include message content in attributes', () => {
  addMessageAttributes('session-abc', 500);

  const calls = mockActiveSpan.setAttribute.mock.calls;
  const values = calls.map((call: [string, unknown]) => call[1]);
  values.forEach((value: unknown) => {
    if (typeof value === 'string') {
      expect(value.length).toBeLessThan(100);  // Content would be longer
    }
  });
});
```

## Test Organization

Follow the existing pattern — one test file per source file:

| Source File | Test File |
|---|---|
| `config/telemetry.ts` | `tests/unit/config/telemetry.test.ts` |
| `config/telemetry.ts` (HTTP/DB) | `tests/unit/config/telemetry-http-db.test.ts` |
| `config/telemetry.ts` (production) | `tests/unit/config/telemetry-production.test.ts` |
| `middleware/socketio-tracing.middleware.ts` | `tests/unit/middleware/socketio-tracing.middleware.test.ts` |
| `utils/ai-tracing.ts` | `tests/unit/utils/ai-tracing.test.ts` |
| `utils/logger.ts` (trace correlation) | `tests/unit/utils/logger-trace-correlation.test.ts` |

When adding new tracing, put the tests in the matching file. If you create a new tracing utility, create a matching test file.

## Common Gotchas

1. **Import order**: Import the module under test AFTER `vi.mock('@opentelemetry/api')`. The mock must be hoisted first.
2. **`vi.hoisted`**: Use for mock objects that `vi.mock` factory functions reference — ensures they exist when the mock factory runs.
3. **`as never` casts**: Use for mock socket objects passed to functions expecting `Socket` type.
4. **`vi.importActual`**: Always spread the actual module in the mock to preserve `SpanStatusCode` and other constants.
5. **clearAllMocks in beforeEach**: Always clear to prevent cross-test contamination of `setAttribute.mock.calls`.
