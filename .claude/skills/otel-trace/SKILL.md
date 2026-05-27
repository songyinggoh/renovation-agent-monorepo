---
name: otel-trace
description: >
  Adds custom OpenTelemetry tracing instrumentation to backend code: creating traced wrappers
  for new operations (HTTP handlers, Socket.io events, AI calls, background workers), adding
  custom span attributes, updating the sampler, and writing matching Vitest tests. Use when
  adding tracing to any new backend feature.
user-invocable: true
---

# /otel-trace

Custom OpenTelemetry instrumentation skill for the renovation agent monorepo. Covers creating spans, adding attributes, extending the sampler, and writing OTel-aware tests — using the exact patterns established across the 6-phase OTel implementation.

## When to Use

- Adding tracing to a new backend feature (new route, Socket.io event, AI tool, worker)
- Adding custom span attributes to an existing operation
- Updating the `RenovationSampler` to handle a new span category
- Wrapping an external API call or AI invocation with OTel spans
- Adding trace correlation to a new logging context
- Writing tests for custom tracing code

## Invocation

```
/otel-trace <description of what to instrument>
```

**Examples**:
```
/otel-trace add tracing to the new generate-checklist AI tool call
/otel-trace instrument the file upload endpoint with asset metadata attributes
/otel-trace add Socket.io tracing for the new render:progress event
/otel-trace update the sampler to always sample payment operations
/otel-trace wrap the Stripe webhook handler in an OTel span
```

## Architecture Overview

The OTel stack has 4 instrumentation layers, each with its own file and patterns:

| Layer | File | Tracer Name | Pattern |
|---|---|---|---|
| **HTTP + DB** | `config/telemetry.ts` | Auto-instrumentation (NodeSDK) | `requestHook` injects custom attributes into Express spans |
| **Socket.io** | `middleware/socketio-tracing.middleware.ts` | `renovation-agent-socketio` | `traceSocketEvent()` wraps handlers, `add*Attributes()` enriches active span |
| **AI Pipeline** | `utils/ai-tracing.ts` | `renovation-agent-ai` | `traceAICall()` for async, `startAIStreamSpan()` for streaming |
| **Logger** | `utils/logger.ts` | N/A (reads active span) | `getTraceContext()` injects `trace_id`/`span_id` into log output |

**Important**: `telemetry.ts` MUST be imported first in `server.ts` to ensure auto-instrumentation patches are applied before other modules load.

## Files Touched Per Task

| Task | Files |
|---|---|
| New HTTP endpoint tracing | `telemetry.ts` (requestHook), test file |
| New Socket.io event tracing | `server.ts` (wrap handler), maybe `socketio-tracing.middleware.ts` (new attribute helper) |
| New AI call tracing | Call site uses `traceAICall()` or `startAIStreamSpan()` from `ai-tracing.ts` |
| New custom span (standalone) | Create span in your feature code using the tracer pattern |
| Sampler update | `telemetry.ts` (`RenovationSampler.shouldSample`), `telemetry.test.ts` |
| New span attributes | Depends on layer — see patterns below |

## Workflow

### Step 1: Identify the Layer

Determine which instrumentation layer applies:

| If you're instrumenting... | Layer | Primary file |
|---|---|---|
| Express route handler | HTTP | `telemetry.ts` (requestHook) |
| Socket.io event handler | Socket.io | `socketio-tracing.middleware.ts` |
| Gemini/LangChain AI call | AI Pipeline | `ai-tracing.ts` |
| BullMQ worker operation | Custom span | Your worker file |
| Any new service/utility | Custom span | Your service file |

### Step 2: Apply the Pattern

See the companion reference files for exact code patterns:

- [span-patterns.md](./span-patterns.md) — How to create spans in each layer
- [attribute-catalog.md](./attribute-catalog.md) — All custom attributes by layer
- [sampler-patterns.md](./sampler-patterns.md) — How to update the custom sampler
- [test-patterns.md](./test-patterns.md) — How to mock OTel API and test spans

### Step 3: Add Attributes

Follow the attribute naming conventions:

| Prefix | Domain | Example |
|---|---|---|
| `ai.*` | AI pipeline | `ai.model`, `ai.usage.total_tokens`, `ai.cost.estimated_usd` |
| `session.*` | Renovation session | `session.id` |
| `room.*` | Room within session | `room.id` |
| `user.*` | Authenticated user | `user.id` |
| `socket.*` | Socket.io transport | `socket.id`, `socket.event`, `socket.transport` |
| `security.*` | Security events | `security.prompt_injection` |
| `rate_limit.*` | Rate limiting | `rate_limit.exceeded` |
| `renovation.*` | Business domain | `renovation.phase` |
| `request.*` | HTTP request | `request.id` |

### Step 4: Update Sampler (if needed)

If the new operation should always be sampled (or have special sampling):

1. Add a condition to `RenovationSampler.shouldSample()` in `telemetry.ts`
2. Add test cases in `telemetry.test.ts`

Currently always-sampled categories:
- Errors (HTTP 5xx)
- AI operations (`ai.*`, `gemini`, `langgraph`)
- Security events (`security.prompt_injection`)
- Chat messages (`socket.io chat:user_message`)
- Force-sampled requests (`x-force-sample: true` header)

### Step 5: Write Tests

Every tracing addition needs tests. See [test-patterns.md](./test-patterns.md) for:
- Mocking `@opentelemetry/api` (tracer, spans, active span)
- Asserting `setAttribute` calls
- Testing error recording
- Testing the sampler

### Step 6: Verify

```bash
cd backend && npm run prep         # lint + build
cd backend && npm run test:unit    # all tests pass
```

## Privacy Rules (NON-NEGOTIABLE)

From the IA doc Section 7:

1. **NEVER** include message content in span attributes — only `content_length`
2. **NEVER** include PII (email, name, phone) in span attributes
3. **NEVER** include API keys, tokens, or secrets in attributes
4. **NEVER** enable `enhancedDatabaseReporting` in production (leaks query parameters)
5. **DO** include: IDs (session, user, room, request), counts, lengths, timings, error messages
6. **DO** use user-facing error messages in Socket.io events, not internal errors

## Key References

- [span-patterns.md](./span-patterns.md) — Creating spans in each layer
- [attribute-catalog.md](./attribute-catalog.md) — Complete attribute inventory
- [sampler-patterns.md](./sampler-patterns.md) — Custom sampler extension
- [test-patterns.md](./test-patterns.md) — OTel mock patterns for Vitest
