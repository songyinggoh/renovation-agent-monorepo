# Span Creation Patterns

How to create OpenTelemetry spans in each instrumentation layer.

## Layer 1: HTTP Endpoints (Auto-Instrumented)

HTTP spans are created automatically by `@opentelemetry/instrumentation-express`. Custom attributes are injected via `requestHook` in `telemetry.ts`.

**You do NOT create spans manually for Express routes.** Instead, add attributes in the `requestHook`:

```typescript
// In telemetry.ts → createExpressRequestHook()
function createExpressRequestHook(): ExpressInstrumentationConfig['requestHook'] {
  return (span, info): void => {
    try {
      // Extract from request
      const req = info.request as RequestWithExtras;

      if (req.params?.myNewParam) {
        span.setAttribute('my_domain.my_param', req.params.myNewParam);
      }
    } catch (error) {
      // requestHook should NEVER throw
      logger.warn('Failed to inject span attributes', undefined, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}
```

**Rules**:
- The `requestHook` runs for every HTTP request — keep it fast
- Wrap in try/catch — a failing hook must never break request processing
- Available data: `info.request` (Express Request), `span` (OTel Span)

## Layer 2: Socket.io Events

Socket.io has two patterns: **wrapping handlers** and **enriching the active span**.

### Pattern A: Wrap a Handler with `traceSocketEvent()`

Used in `server.ts` when registering Socket.io event handlers:

```typescript
import {
  traceSocketEvent,
  traceConnection,
  traceDisconnect,
  addMessageAttributes,
} from './middleware/socketio-tracing.middleware.js';

// Connection-level tracing
io.on('connection', (socket) => {
  traceConnection(socket);

  socket.on('disconnect', (reason) => {
    traceDisconnect(socket, reason);
  });

  // Event handler tracing — wraps the handler in a span
  socket.on('my:event', traceSocketEvent(socket, 'my:event', async (data: unknown) => {
    // Your handler code here
    // The active span is automatically set by traceSocketEvent
  }));
});
```

`traceSocketEvent()` automatically:
- Creates a span named `socket.io my:event`
- Sets `messaging.system`, `socket.id`, `socket.event`, `socket.transport`, `messaging.operation`
- Sets OK status on success, ERROR + recordException on failure
- Handles both sync and async handlers
- Ends the span when the handler completes

### Pattern B: Enrich the Active Span

Used inside a traced handler to add domain-specific attributes:

```typescript
socket.on('my:event', traceSocketEvent(socket, 'my:event', async (data: unknown) => {
  // ... validate data ...

  // Enrich the span created by traceSocketEvent
  addMessageAttributes(sessionId, content.length, {
    'my_domain.custom_key': customValue,
  });

  // Or use specific helpers:
  addJoinAttributes(sessionId);
  addSecurityAttributes(isSuspicious, validationPassed);
  addRateLimitAttributes(exceeded, tokensRemaining);
}));
```

### Pattern C: Add a New Attribute Helper

If you need a reusable helper for a new domain, add it to `socketio-tracing.middleware.ts`:

```typescript
/**
 * Add {domain} attributes to the current active span.
 */
export function add{Domain}Attributes(
  field1: string,
  field2: number,
): void {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return;

  activeSpan.setAttribute('{domain}.field1', field1);
  activeSpan.setAttribute('{domain}.field2', field2);
}
```

**Pattern**: Always guard with `if (!activeSpan) return;` — the helper may be called outside a trace context.

## Layer 3: AI Pipeline

Two patterns for AI calls: async (request-response) and streaming.

### Pattern A: Async AI Call with `traceAICall()`

```typescript
import { traceAICall, recordTokenUsage, extractTokenUsage } from '../utils/ai-tracing.js';

const result = await traceAICall(
  'ai.chat.invoke',                    // Span name
  {
    'ai.system': 'gemini',             // AI provider
    'ai.model': 'gemini-2.5-flash',    // Model name
    'ai.temperature': 0.7,             // Temperature
    'ai.prompt.phase': 'INTAKE',       // Renovation phase
    'ai.prompt.history_size': 5,       // Chat history messages
  },
  async (span) => {
    // Call the AI model
    const response = await model.invoke(messages);

    // Record token usage
    const usage = extractTokenUsage(response.response_metadata);
    if (usage) {
      recordTokenUsage(span, usage, 'gemini-2.5-flash');
    }

    // Add post-call attributes
    span.setAttribute('ai.tool.calls_count', toolCalls.length);

    return response;
  },
);
```

`traceAICall()` automatically:
- Creates an active span with the given name
- Sets all provided attributes
- Sets OK status on success, ERROR + recordException on failure
- Ends the span when the callback completes (or throws)

### Pattern B: Streaming AI Call with `startAIStreamSpan()`

```typescript
import { startAIStreamSpan, recordTokenUsage } from '../utils/ai-tracing.js';

const { span, onFirstToken, endStream } = startAIStreamSpan(
  'ai.stream',
  {
    'ai.system': 'gemini',
    'ai.model': 'gemini-2.5-flash',
    'ai.temperature': 0.7,
  },
);

try {
  for await (const chunk of model.stream(messages)) {
    onFirstToken();  // Records ai.stream.first_token_ms (only first call counts)
    emit(chunk);
  }
  endStream();       // Records ai.stream.total_ms, sets OK status, ends span
} catch (error) {
  endStream(error);  // Records timing, sets ERROR status, records exception, ends span
}
```

### Pattern C: Using Model traceAttributes

Gemini model factories in `gemini.ts` attach `traceAttributes` to the model instance:

```typescript
import { createChatModel, type TracedModel } from '../config/gemini.js';

const model: TracedModel = createChatModel({ temperature: 0.7 });

// Use model.traceAttributes as base attributes for traceAICall
const result = await traceAICall('ai.chat.invoke', model.traceAttributes, async (span) => {
  // ... invoke model ...
});
```

## Layer 4: Custom Spans (Workers, Services)

For operations that don't fit the above layers, create spans manually:

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('renovation-agent-{domain}', '1.0.0');

// Pattern A: startActiveSpan (sets span as active for child spans)
async function myOperation(): Promise<void> {
  return tracer.startActiveSpan('my.operation', async (span) => {
    try {
      span.setAttribute('my.attr', value);

      // ... do work ...
      // Any child spans created here will be linked to this parent

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      span.recordException(err);
      throw error;
    } finally {
      span.end();
    }
  });
}

// Pattern B: startSpan (standalone span, no parent context propagation)
function quickEvent(): void {
  const span = tracer.startSpan('my.event');
  span.setAttribute('my.attr', value);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}
```

**When to use which**:
- `startActiveSpan` — when the operation creates child operations that should be nested
- `startSpan` — for fire-and-forget events (connection, disconnect, quick events)

## Logger Trace Correlation

The `Logger` class automatically injects `trace_id` and `span_id` from the active span into every log line. No manual wiring needed.

```typescript
// Anywhere inside a traced context:
logger.info('Processing request', { sessionId });
// Output includes: { trace_id: "abc...", span_id: "def...", ... }
```

**How it works** (`logger.ts`):
```typescript
function getTraceContext(): { trace_id?: string; span_id?: string } {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return {};

  const spanContext = activeSpan.spanContext();
  if (!isSpanContextValid(spanContext)) return {};

  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
  };
}
```

## Import Checklist

```typescript
// For custom spans
import { trace, SpanStatusCode } from '@opentelemetry/api';

// For AI call tracing
import { traceAICall, startAIStreamSpan, recordTokenUsage, extractTokenUsage } from '../utils/ai-tracing.js';
import type { AISpanAttributes } from '../utils/ai-tracing.js';

// For Socket.io tracing
import {
  traceSocketEvent,
  traceConnection,
  traceDisconnect,
  addMessageAttributes,
  addJoinAttributes,
  addSecurityAttributes,
  addRateLimitAttributes,
} from '../middleware/socketio-tracing.middleware.js';

// For checking telemetry status
import { isTelemetryActive } from '../config/telemetry.js';
```
