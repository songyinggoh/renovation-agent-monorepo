# Sampler Patterns

How to extend the `RenovationSampler` to handle new span categories.

## Current Sampler Logic

The `RenovationSampler` in `telemetry.ts` implements a priority-based sampling strategy:

```
Request arrives
  │
  ├─ x-force-sample: true header → ALWAYS SAMPLE
  │
  ├─ HTTP 5xx error → ALWAYS SAMPLE
  │
  ├─ AI operation (ai.*, gemini, langgraph) → ALWAYS SAMPLE
  │
  ├─ Security event (prompt_injection=true) → ALWAYS SAMPLE
  │
  ├─ Chat message (socket.io chat:user_message) → ALWAYS SAMPLE
  │
  ├─ Health check (/health*) → 1% SAMPLE
  │
  └─ Everything else → BASELINE RATIO (default 10%)
```

**Configuration**: The baseline ratio is controlled by `OTEL_TRACES_SAMPLER_ARG` env var (default `0.1` = 10%).

## Adding a New Always-Sample Category

To ensure a new operation type is always sampled, add a condition to `shouldSample()`:

```typescript
// In telemetry.ts → RenovationSampler.shouldSample()

shouldSample(
  _parentContext: Context,
  traceId: string,
  spanName: string,
  _spanKind: SpanKind,
  attributes: Attributes,
  _links: Link[],
): SamplingResult {
  // ... existing conditions ...

  // NEW: Always sample payment operations (critical business path)
  if (spanName.includes('payment') || attributes['http.route']?.toString().includes('/payment')) {
    return { decision: SamplingDecision.RECORD_AND_SAMPLED };
  }

  // ... rest of method ...
}
```

**Condition types you can check**:
- `spanName` — the span name (e.g., `"GET /api/sessions"`, `"socket.io chat:user_message"`, `"ai.chat.invoke"`)
- `attributes` — span attributes set at creation time (e.g., `http.route`, `http.status_code`)
- `traceId` — for deterministic ratio-based sampling

**Order matters**: Conditions are checked top-to-bottom. Put more specific conditions before more general ones.

## Adding a Low-Sample Category

For high-volume, low-value operations:

```typescript
// Sample static assets at 0.1% (extremely high volume)
const httpRoute = attributes['http.route'] as string | undefined;
if (httpRoute?.startsWith('/static')) {
  return this.ratioSample(traceId, 0.001);
}
```

## Deterministic Ratio Sampling

The `ratioSample()` method uses the last 8 hex characters of the trace ID for consistent sampling:

```typescript
private ratioSample(traceId: string, ratio: number): SamplingResult {
  if (ratio >= 1) return { decision: SamplingDecision.RECORD_AND_SAMPLED };
  if (ratio <= 0) return { decision: SamplingDecision.NOT_RECORD };

  const traceIdSuffix = traceId.slice(-8);
  const threshold = Math.floor(ratio * 0xffffffff);
  const traceValue = parseInt(traceIdSuffix, 16);

  return {
    decision: traceValue < threshold
      ? SamplingDecision.RECORD_AND_SAMPLED
      : SamplingDecision.NOT_RECORD,
  };
}
```

**Why deterministic**: The same trace ID always produces the same sampling decision. This means a request sampled at the entry point will also be sampled at downstream services that use the same trace ID.

## Force-Sample Header

The `x-force-sample: true` HTTP header forces any request to be sampled at 100%. This is useful for:
- Debugging specific requests
- Payment operations (set by the payment service)
- Admin operations
- Load test traces

The header is propagated from `requestHook` to span attributes, where the sampler reads it:

```
Client → x-force-sample: true header
  → requestHook sets span attribute http.request.header.x_force_sample = "true"
  → sampler checks this attribute and returns RECORD_AND_SAMPLED
```

## Testing the Sampler

Every sampler condition needs tests. Pattern from `telemetry.test.ts`:

```typescript
import { SpanKind } from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { RenovationSampler } from '../../../src/config/telemetry.js';

describe('RenovationSampler', () => {
  let sampler: RenovationSampler;
  const ROOT_CONTEXT = {} as never;
  const NO_LINKS: never[] = [];

  beforeEach(() => {
    sampler = new RenovationSampler(0.1);
  });

  it('should always sample payment operations', () => {
    const result = sampler.shouldSample(
      ROOT_CONTEXT,
      'aaaabbbbccccdddd1111222233334444',
      'POST /api/payments',
      SpanKind.SERVER,
      { 'http.route': '/api/payments' },
      NO_LINKS,
    );
    expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it('should sample health checks at 1%', () => {
    // Use a trace ID that produces a value > 1% threshold
    // 0xffffffff * 0.01 = 42949672 → trace suffix must be >= 0x028F5C28
    const result = sampler.shouldSample(
      ROOT_CONTEXT,
      'aaaabbbbccccddddeeeeffffaaaaffff', // last 8: aaaaffff = ~2.86B > threshold
      'GET /health',
      SpanKind.SERVER,
      { 'http.route': '/health' },
      NO_LINKS,
    );
    expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
  });
});
```

## Env Vars

| Variable | Default | Description |
|---|---|---|
| `OTEL_ENABLED` | `true` (unless `"false"`) | Master kill switch for all OTel |
| `OTEL_SERVICE_NAME` | `"renovation-agent-backend"` | Service name in resource |
| `OTEL_TRACES_SAMPLER_ARG` | `0.1` | Baseline sampling ratio (0.0-1.0) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `localhost:4318` | OTLP collector endpoint |
| `OTEL_EXPORTER_OTLP_HEADERS` | (none) | `key=value,key=value` auth headers |
| `OTEL_LOG_LEVEL` | `info` (production: `error`) | OTel diagnostic log level |
| `NODE_ENV` | `development` | Affects: sampler, enhanced DB reporting, diag level |

## BatchSpanProcessor Config

Explicit configuration in `telemetry.ts` (Phase 6):

| Setting | Value | Description |
|---|---|---|
| `scheduledDelayMillis` | 5000 | Export every 5 seconds |
| `maxExportBatchSize` | 512 | Max spans per batch export |
| `maxQueueSize` | 2048 | Buffer limit (drops spans when full) |
| `exportTimeoutMillis` | 30000 | 30s export timeout |

OTLP exporter: 10s per-attempt timeout, 3 retry attempts with exponential backoff (built into `@opentelemetry/otlp-exporter-base`).
