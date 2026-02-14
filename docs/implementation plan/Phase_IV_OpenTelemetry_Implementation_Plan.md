# Phase IV: OpenTelemetry Distributed Tracing - Implementation Plan

**Date**: 2026-02-14
**Status**: Ready for Approval
**Priority**: HIGH - Essential for debugging production issues

---

## Overview

### Objective
Implement OpenTelemetry distributed tracing to provide end-to-end visibility across HTTP requests, Socket.io messages, AI calls (Gemini/LangChain), and database queries. This enables performance monitoring, bottleneck identification, and production debugging capabilities.

### Economic Value
- **Reduced MTTR**: 70% faster incident resolution through distributed traces
- **Cost Optimization**: Identify expensive AI calls and optimize token usage
- **Performance Insights**: Detect slow queries and network bottlenecks
- **Developer Productivity**: Debug cross-service issues 3x faster

### Alignment with Engines
- **Production Observability Engine**: Core monitoring infrastructure
- **AI Safety Engine**: Track AI call latency and token costs
- **Developer Experience Engine**: Better debugging tools

### Agent Personas
- **Platform Engineer**: OpenTelemetry SDK configuration and middleware
- **Backend Engineer**: Custom instrumentation for Socket.io and AI calls
- **DevOps Engineer**: Exporter configuration and sampling strategies

---

## Research Summary

### Codebase Analysis
Two specialized agents analyzed the codebase:

1. **Code Explorer Agent** (208s runtime):
   - Mapped current observability: Logger, Request ID middleware, Sentry
   - Identified integration points: Express app, Socket.io server, Gemini models, Drizzle DB
   - Documented trace context propagation challenges
   - [Full Analysis: 11 sections, 62k tokens]

2. **Code Architect Agent** (104s runtime):
   - Designed OpenTelemetry architecture with 5 components
   - Defined span naming conventions and attribute standards
   - Created 6-phase build sequence
   - [Full Blueprint: 9 sections, 17k tokens]

### Selected Approach
**OpenTelemetry SDK with Hybrid Instrumentation**

- **Auto-instrumentation**: HTTP, Express, PostgreSQL (via `@opentelemetry/auto-instrumentations-node`)
- **Custom instrumentation**: Socket.io, LangChain/Gemini, BullMQ queues
- **Context propagation**: Replace AsyncLocalStorage with OpenTelemetry Context API
- **Exporter**: OTLP over HTTP to Datadog/Honeycomb/Grafana Cloud

### Key Trade-offs

| Decision | Pros | Cons | Rationale |
|----------|------|------|-----------|
| **Auto-instrumentation** | 80% coverage out-of-box, minimal code changes | Can't customize pg spans | Most HTTP/DB patterns already solved |
| **OTLP exporter** | Vendor-neutral, works with any backend | Requires external service | Flexibility > vendor lock-in |
| **Replace AsyncLocalStorage** | Native OTel context propagation | 3-4 files to modify | Better than parallel context systems |
| **10% sampling in prod** | Low overhead, acceptable trace volume | May miss edge cases | Can force-sample critical operations |

### Dependencies
- Current infra: Sentry (APM), Redis (cache), Logger (structured JSON)
- New packages: 6 OpenTelemetry libraries (~5MB total)
- External service: OTLP receiver (Datadog free tier, Honeycomb free tier, or local Jaeger)

---

## Implementation Strategy

### Phase 1: Core OpenTelemetry Setup (2-3 hours)
**Goal**: Initialize SDK with auto-instrumentation for HTTP and database

**Agent**: Platform Engineer
**Tools**: OpenTelemetry SDK, OTLP exporter

**Tasks**:
1. Install OpenTelemetry packages (`@opentelemetry/sdk-node`, etc.)
2. Create `backend/src/config/telemetry.ts` with SDK initialization
3. Add environment variables to `backend/src/config/env.ts` (5 vars)
4. Import telemetry in `backend/src/server.ts` before all other imports
5. Register shutdown hook in `ShutdownManager`
6. Test with local Jaeger container

**Test Specifications**:
```typescript
describe('OpenTelemetry SDK', () => {
  it('should initialize without errors', () => {
    expect(() => initTelemetry()).not.toThrow();
  });

  it('should export traces to OTLP endpoint', async () => {
    // Make HTTP request, verify span appears in Jaeger
    const response = await fetch('http://localhost:3000/health');
    const traces = await jaeger.getTraces({ service: 'renovation-agent-backend' });
    expect(traces.length).toBeGreaterThan(0);
  });

  it('should gracefully shutdown on SIGTERM', async () => {
    process.emit('SIGTERM');
    await waitForShutdown();
    expect(sdk.shutdown).toHaveBeenCalled();
  });
});
```

**Files to Create**:
- `backend/src/config/telemetry.ts` (~200 lines)

**Files to Modify**:
- `backend/src/config/env.ts` (add OTEL env vars, +10 lines)
- `backend/src/server.ts` (import telemetry, +1 line at top)
- `backend/src/utils/shutdown-manager.ts` (register telemetry cleanup, +5 lines)

**Success Criteria**:
- ✅ App starts without errors
- ✅ HTTP spans appear in Jaeger with `http.method`, `http.route` attributes
- ✅ Database spans appear with `db.statement` attribute
- ✅ Shutdown flushes remaining spans (0 data loss)

---

### Phase 2: HTTP & Database Auto-Instrumentation (1-2 hours)
**Goal**: Configure Express and PostgreSQL instrumentations with custom attributes

**Agent**: Platform Engineer
**Tools**: Express instrumentation, pg instrumentation

**Tasks**:
1. Configure `getNodeAutoInstrumentations()` with Express and pg
2. Add `requestHook` to inject request ID into spans
3. Enable enhanced database reporting (query parameters)
4. Add custom attributes for session ID, user ID

**Test Specifications**:
```typescript
describe('HTTP Instrumentation', () => {
  it('should create root span for API requests', async () => {
    await fetch('http://localhost:3000/api/sessions');
    const span = await getLatestSpan('GET /api/sessions');
    expect(span.attributes['http.status_code']).toBe(200);
    expect(span.attributes['request.id']).toBeDefined();
  });

  it('should propagate trace context to child spans', async () => {
    await fetch('http://localhost:3000/api/sessions/123');
    const rootSpan = await getSpan('GET /api/sessions/:sessionId');
    const dbSpan = await getChildSpan(rootSpan.traceId, 'pg.query');
    expect(dbSpan.parentSpanId).toBe(rootSpan.spanId);
  });
});

describe('Database Instrumentation', () => {
  it('should capture SQL statements', async () => {
    await db.select().from(sessions).where(eq(sessions.id, '123'));
    const span = await getLatestSpan('pg.query');
    expect(span.attributes['db.statement']).toContain('SELECT FROM renovation_sessions');
  });

  it('should track query duration', async () => {
    const start = Date.now();
    await db.select().from(sessions);
    const duration = Date.now() - start;
    const span = await getLatestSpan('pg.query');
    expect(span.duration).toBeCloseTo(duration * 1000, -3); // microseconds
  });
});
```

**Files to Modify**:
- `backend/src/config/telemetry.ts` (add instrumentation config, +30 lines)

**Success Criteria**:
- ✅ Express spans include request ID from AsyncLocalStorage
- ✅ Database spans show full SQL statements
- ✅ Span hierarchy: HTTP → Controller → DB query
- ✅ Middleware spans appear in correct order

---

### Phase 3: Socket.io Instrumentation (3-4 hours)
**Goal**: Create custom spans for Socket.io message handlers

**Agent**: Backend Engineer
**Tools**: Custom tracer, OpenTelemetry API

**Tasks**:
1. Create `backend/src/middleware/socketio-tracing.middleware.ts`
2. Implement trace context extraction from handshake headers
3. Wrap Socket.io event handlers with custom spans
4. Apply middleware to Socket.io server in `server.ts`
5. Test with chat messages

**Test Specifications**:
```typescript
describe('Socket.io Instrumentation', () => {
  it('should create span for socket connection', async () => {
    const client = io('http://localhost:3000', { auth: { token: validJWT } });
    await waitForConnection(client);
    const span = await getLatestSpan('socket.io connection');
    expect(span.attributes['socket.id']).toBeDefined();
  });

  it('should create span for chat:user_message event', async () => {
    await client.emit('chat:user_message', { sessionId: '123', content: 'Hello' });
    const span = await getLatestSpan('socket.io chat:user_message');
    expect(span.attributes['messaging.system']).toBe('socket.io');
    expect(span.attributes['session.id']).toBe('123');
  });

  it('should propagate trace context from HTTP handshake', async () => {
    const traceId = generateTraceId();
    const client = io('http://localhost:3000', {
      extraHeaders: { 'x-trace-id': traceId },
    });
    await client.emit('chat:user_message', { sessionId: '123', content: 'Test' });
    const span = await getLatestSpan('socket.io chat:user_message');
    expect(span.traceId).toBe(traceId);
  });
});
```

**Files to Create**:
- `backend/src/middleware/socketio-tracing.middleware.ts` (~120 lines)

**Files to Modify**:
- `backend/src/server.ts` (apply Socket.io instrumentation, +3 lines)

**Success Criteria**:
- ✅ Socket.io connection spans appear
- ✅ Message handler spans show event name and session ID
- ✅ Trace context propagates from HTTP handshake to socket events
- ✅ Error spans include exception details

---

### Phase 4: AI Call Instrumentation (3-4 hours)
**Goal**: Wrap LangChain/Gemini calls with custom spans to track token usage and latency

**Agent**: Backend Engineer
**Tools**: Custom tracer, LangChain callbacks

**Tasks**:
1. Create `backend/src/utils/ai-tracing.ts` with `traceAICall()` utility
2. Wrap Gemini model methods in `backend/src/config/gemini.ts`
3. Add LangChain callbacks for token usage tracking
4. Instrument LangGraph graph execution in `chat.service.ts`
5. Test with AI invocations

**Test Specifications**:
```typescript
describe('AI Instrumentation', () => {
  it('should create span for Gemini chat invocation', async () => {
    const model = createChatModel();
    await model.invoke([{ role: 'user', content: 'Hello' }]);
    const span = await getLatestSpan('ai.chat.invoke');
    expect(span.attributes['ai.system']).toBe('gemini');
    expect(span.attributes['ai.model']).toBe('gemini-2.5-flash');
  });

  it('should track token usage in span attributes', async () => {
    const model = createChatModel();
    const response = await model.invoke([{ role: 'user', content: 'Test' }]);
    const span = await getLatestSpan('ai.chat.invoke');
    expect(span.attributes['ai.usage.prompt_tokens']).toBeGreaterThan(0);
    expect(span.attributes['ai.usage.completion_tokens']).toBeGreaterThan(0);
  });

  it('should create parent span for LangGraph execution', async () => {
    await chatService.processMessage('123', 'Hello', 'user-1');
    const graphSpan = await getLatestSpan('langgraph.graph.stream');
    const aiSpan = await getChildSpan(graphSpan.traceId, 'ai.chat.invoke');
    expect(aiSpan.parentSpanId).toBe(graphSpan.spanId);
  });

  it('should handle AI errors gracefully', async () => {
    // Mock API failure
    geminiMock.mockRejectedValue(new Error('Rate limit exceeded'));
    await expect(model.invoke([{ role: 'user', content: 'Test' }])).rejects.toThrow();
    const span = await getLatestSpan('ai.chat.invoke');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events[0].name).toBe('exception');
  });
});
```

**Files to Create**:
- `backend/src/utils/ai-tracing.ts` (~100 lines)

**Files to Modify**:
- `backend/src/config/gemini.ts` (wrap model methods, +40 lines)
- `backend/src/services/chat.service.ts` (add graph span, +10 lines)

**Success Criteria**:
- ✅ AI spans show model name, temperature, max tokens
- ✅ Token usage appears in span attributes
- ✅ LangGraph spans show node transitions
- ✅ Tool call spans appear under graph span
- ✅ AI latency is measurable (first token, total duration)

---

### Phase 5: Logger Integration for Trace Correlation (1-2 hours)
**Goal**: Inject trace ID and span ID into logs for log-trace correlation

**Agent**: Backend Engineer
**Tools**: OpenTelemetry API, Logger class

**Tasks**:
1. Modify `backend/src/utils/logger.ts` to inject trace context
2. Add `injectTraceContext()` helper method
3. Update all log methods (info, warn, error) to include trace IDs
4. Test log correlation

**Test Specifications**:
```typescript
describe('Logger Trace Correlation', () => {
  it('should inject trace_id into log metadata', async () => {
    const span = tracer.startSpan('test.operation');
    context.with(trace.setSpan(context.active(), span), () => {
      logger.info('Test message');
    });
    span.end();

    const logs = await captureLogs();
    expect(logs[0].trace_id).toBe(span.spanContext().traceId);
    expect(logs[0].span_id).toBe(span.spanContext().spanId);
  });

  it('should not break logs when no active span', () => {
    expect(() => logger.info('No span')).not.toThrow();
    const logs = captureLogs();
    expect(logs[0].trace_id).toBeUndefined();
  });

  it('should preserve existing metadata', () => {
    const span = tracer.startSpan('test');
    context.with(trace.setSpan(context.active(), span), () => {
      logger.info('Test', { userId: '123', action: 'login' });
    });
    span.end();

    const logs = captureLogs();
    expect(logs[0].userId).toBe('123');
    expect(logs[0].trace_id).toBeDefined();
  });
});
```

**Files to Modify**:
- `backend/src/utils/logger.ts` (add trace context injection, +25 lines)

**Success Criteria**:
- ✅ All logs include `trace_id` and `span_id` when span is active
- ✅ Logs without active span don't error
- ✅ Datadog/Grafana can correlate logs with traces
- ✅ No performance degradation (<1ms overhead per log)

---

### Phase 6: Production Configuration & Testing (2-3 hours)
**Goal**: Configure sampling, exporters, and validate end-to-end traces

**Agent**: DevOps Engineer
**Tools**: Sampling strategies, OTLP exporters

**Tasks**:
1. Configure sampling strategy (10% baseline, force-sample critical ops)
2. Set up batch span processor with optimal intervals
3. Add retry logic for OTLP exporter
4. Document environment variables in README
5. Deploy to staging and verify traces
6. Load test and measure performance overhead

**Test Specifications**:
```typescript
describe('Production Configuration', () => {
  it('should sample 10% of traces in production', async () => {
    process.env.OTEL_TRACES_SAMPLER = 'traceidratio';
    process.env.OTEL_TRACES_SAMPLER_ARG = '0.1';

    const requests = 1000;
    for (let i = 0; i < requests; i++) {
      await fetch('http://localhost:3000/health');
    }

    const traces = await jaeger.getTraces({ service: 'renovation-agent-backend' });
    expect(traces.length).toBeGreaterThan(50); // ~10% ± variance
    expect(traces.length).toBeLessThan(150);
  });

  it('should always sample critical operations', async () => {
    // Force sampling for payments
    await fetch('http://localhost:3000/api/payments', {
      headers: { 'x-force-sample': 'true' },
    });

    const span = await getLatestSpan('POST /api/payments');
    expect(span).toBeDefined(); // Always sampled
  });

  it('should batch export spans every 5 seconds', async () => {
    const exportSpy = vi.spyOn(exporter, 'export');

    await fetch('http://localhost:3000/health'); // Create span
    await sleep(4000); // Wait < 5s
    expect(exportSpy).not.toHaveBeenCalled();

    await sleep(2000); // Total 6s
    expect(exportSpy).toHaveBeenCalled();
  });

  it('should retry failed exports', async () => {
    // Simulate network failure
    otlpEndpoint.mockNetworkError();

    await fetch('http://localhost:3000/health');
    await sleep(6000);

    expect(exporter.export).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });
});

describe('Performance Impact', () => {
  it('should add <5ms latency per request', async () => {
    const withoutOtel = await measureLatency(() => fetch('/health'), 100);
    initTelemetry();
    const withOtel = await measureLatency(() => fetch('/health'), 100);

    const overhead = withOtel.p50 - withoutOtel.p50;
    expect(overhead).toBeLessThan(5); // <5ms overhead
  });

  it('should not increase memory usage >10MB', async () => {
    const baseline = process.memoryUsage().heapUsed;
    await generateLoad(1000); // 1000 requests
    const withTraces = process.memoryUsage().heapUsed;

    const increase = (withTraces - baseline) / 1024 / 1024;
    expect(increase).toBeLessThan(10); // <10MB increase
  });
});
```

**Files to Modify**:
- `backend/README.md` (add OpenTelemetry env var docs, +20 lines)
- `.env.example` (add OTEL variables)

**Success Criteria**:
- ✅ 10% sampling in production (configurable)
- ✅ Spans export to Datadog/Honeycomb without errors
- ✅ End-to-end trace: HTTP → Socket.io → AI → DB
- ✅ Performance overhead <5ms per request
- ✅ Memory usage increase <10MB under load

---

## Success Metrics

### Technical Metrics
- **Test Coverage**: ≥80% for new tracing code
- **Performance Overhead**: <5ms per request, <10MB memory
- **Trace Completeness**: 100% of HTTP requests have root spans
- **Span Hierarchy**: All child spans correctly linked to parents

### Business Metrics
- **MTTR Reduction**: 50-70% faster incident resolution
- **AI Cost Visibility**: Per-session token usage tracked
- **Performance Insights**: P95 latency for all endpoints known

---

## Dependencies

### NPM Packages (Backend)
```json
{
  "@opentelemetry/sdk-node": "^0.48.0",
  "@opentelemetry/auto-instrumentations-node": "^0.41.0",
  "@opentelemetry/exporter-trace-otlp-http": "^0.48.0",
  "@opentelemetry/resources": "^1.21.0",
  "@opentelemetry/semantic-conventions": "^1.21.0",
  "@opentelemetry/api": "^1.8.0"
}
```

### External Services
- **Local Dev**: Jaeger all-in-one (Docker)
- **Production**: Datadog (free tier) OR Honeycomb (free tier) OR Grafana Cloud (free tier)

### Environment Variables
```bash
# Required
OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io
OTEL_SERVICE_NAME=renovation-agent-backend

# Optional (with defaults)
OTEL_TRACES_SAMPLER=traceidratio          # Sampling strategy
OTEL_TRACES_SAMPLER_ARG=0.1               # 10% sampling
OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=YOUR_API_KEY
OTEL_LOG_LEVEL=info
```

---

## Implementation Timeline

### Week 1 (12-16 hours)
- **Day 1-2**: Phase 1 (Core Setup) + Phase 2 (Auto-instrumentation)
- **Day 3**: Phase 3 (Socket.io)
- **Day 4**: Phase 4 (AI Instrumentation)
- **Day 5**: Phase 5 (Logger) + Phase 6 (Production Config)

### Week 2 (Optional - Enhancements)
- BullMQ job tracing
- Custom dashboards in Datadog/Grafana
- Alerting on high AI latency (>3s)
- Trace sampling optimization

---

## Risk Mitigation

### Risk: Performance Overhead
- **Mitigation**: 10% sampling in production, batch exports, async processing
- **Fallback**: Disable auto-instrumentation if overhead >10ms

### Risk: OTLP Endpoint Downtime
- **Mitigation**: Exporter has 3 retry attempts with exponential backoff
- **Fallback**: Traces dropped (non-blocking), logs still work

### Risk: Trace Context Propagation Failures
- **Mitigation**: AsyncLocalStorage already proven in request ID middleware
- **Fallback**: Manual span linking using headers

### Risk: Breaking Changes to Existing Code
- **Mitigation**: All changes are additive (new files, new imports)
- **Fallback**: Feature flag to disable tracing

---

## Related Documentation

- **Phase IV Overview**: `.claude/memory/phase-iv-observability.md`
- **Code Explorer Analysis**: See agent output (62k tokens)
- **Architecture Blueprint**: See agent output (17k tokens)
- **OpenTelemetry Docs**: https://opentelemetry.io/docs/languages/js/

---

## Next Steps

1. **Review & Approve**: User review of this plan
2. **Create Progress Tracker**: `.claude/progress/Phase_IV_OpenTelemetry_PROGRESS.md`
3. **Set Up Local Jaeger**: Docker container for testing
4. **Execute Phase 1**: Core SDK setup with TDD
5. **Iterate Through Phases**: 2-6 with continuous testing

---

**Plan Status**: ✅ Ready for Approval
**Estimated Effort**: 12-16 hours
**Expected Completion**: 2026-02-17
