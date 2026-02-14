# Phase IV: OpenTelemetry Information Architecture

**Date**: 2026-02-14
**Purpose**: Define what to trace, what attributes to capture, and how traces will be consumed — before writing any instrumentation code.

---

## 1. Trace Attribute Taxonomy

### 1.1 Universal Context (attached to every span)

| Attribute | Type | Source | Example |
|-----------|------|--------|---------|
| `request.id` | string | `X-Request-ID` header / AsyncLocalStorage | `a1b2c3d4` |
| `session.id` | UUID | Route param / Socket payload | `550e8400-...` |
| `user.id` | UUID \| null | Auth middleware (`req.user.id`) | `550e8400-...` |
| `renovation.phase` | enum | Session DB lookup | `CHECKLIST` |
| `service.name` | string | Env config | `renovation-agent-backend` |
| `deployment.environment` | string | `NODE_ENV` | `production` |

### 1.2 HTTP Layer

| Attribute | Type | Auto/Custom | Notes |
|-----------|------|-------------|-------|
| `http.method` | string | Auto | GET, POST, etc. |
| `http.route` | string | Auto | `/api/sessions/:sessionId` |
| `http.status_code` | number | Auto | 200, 404, 500 |
| `http.request.body_size` | number | Custom | For POST/PATCH |
| `http.response.body_size` | number | Custom | Response payload size |

### 1.3 Socket.io Layer

| Attribute | Type | Notes |
|-----------|------|-------|
| `messaging.system` | string | Always `socket.io` |
| `messaging.operation` | string | `connection`, `disconnect`, `receive` |
| `socket.id` | string | Socket.io socket ID |
| `socket.event` | string | `chat:user_message`, `chat:join_session` |
| `socket.transport` | string | `websocket` or `polling` |
| `socket.room` | string | `session:${sessionId}` |
| `socket.content_length` | number | Message char count |
| `socket.rate_limit.remaining` | number | Tokens left in bucket |

### 1.4 AI Pipeline Layer

| Attribute | Type | Notes |
|-----------|------|-------|
| `ai.system` | string | `gemini` |
| `ai.model` | string | `gemini-2.5-flash` |
| `ai.temperature` | number | 0.3, 0.5, or 0.7 |
| `ai.prompt.phase` | string | Phase-specific prompt used |
| `ai.prompt.history_size` | number | Messages loaded as context |
| `ai.usage.prompt_tokens` | number | Input tokens |
| `ai.usage.completion_tokens` | number | Output tokens |
| `ai.usage.total_tokens` | number | Sum |
| `ai.cost.estimated_usd` | number | Per-call cost estimate |
| `ai.stream.first_token_ms` | number | Time to first streamed token |
| `ai.stream.total_ms` | number | Total streaming duration |
| `ai.tool.name` | string | `get_style_examples`, `search_products`, etc. |
| `ai.tool.calls_count` | number | ReAct loop iterations |
| `ai.react_loop.iterations` | number | call_model → tools cycles |

### 1.5 Database Layer

| Attribute | Type | Auto/Custom | Notes |
|-----------|------|-------------|-------|
| `db.system` | string | Auto | `postgresql` |
| `db.statement` | string | Auto | SQL query (sanitized) |
| `db.operation` | string | Auto | SELECT, INSERT, UPDATE |
| `db.sql.table` | string | Custom | `renovation_sessions` |
| `db.query.duration_ms` | number | Auto | Query execution time |

### 1.6 Background Jobs (BullMQ)

| Attribute | Type | Notes |
|-----------|------|-------|
| `job.queue` | string | `image:optimize`, `ai:process-message`, etc. |
| `job.id` | string | BullMQ job ID |
| `job.attempt` | number | Current attempt (1-based) |
| `job.status` | string | `completed`, `failed` |
| `job.duration_ms` | number | Processing time |
| `job.payload.asset_id` | string | For image jobs |
| `job.payload.session_id` | string | For AI/doc jobs |

### 1.7 Security & Validation

| Attribute | Type | Notes |
|-----------|------|-------|
| `security.prompt_injection` | boolean | Detected by `detectPromptInjection()` |
| `security.content_sanitized` | boolean | Content was modified |
| `validation.passed` | boolean | Zod validation result |
| `validation.error_count` | number | Number of validation issues |
| `rate_limit.exceeded` | boolean | Rate limit hit |
| `rate_limit.tokens_remaining` | number | Bucket tokens left |

### 1.8 Cache Layer

| Attribute | Type | Notes |
|-----------|------|-------|
| `cache.hit` | boolean | Redis cache hit/miss |
| `cache.key` | string | Cache key pattern (not full key) |
| `cache.ttl_seconds` | number | TTL applied |

---

## 2. Span Hierarchy (Trace Structure)

### 2.1 HTTP Request Trace

```
[root] GET /api/sessions/:sessionId                    (auto)
  ├─ [middleware] auth.verifyToken                      (custom)
  ├─ [middleware] requestId.assign                      (existing)
  ├─ [controller] sessionController.getSession          (custom)
  │   ├─ [db] SELECT FROM renovation_sessions           (auto)
  │   └─ [db] SELECT FROM renovation_rooms              (auto)
  └─ [serialize] response                               (custom, optional)
```

### 2.2 Socket.io Chat Message Trace

```
[root] socket.io chat:user_message                      (custom)
  ├─ [validate] zod.chatUserMessageSchema               (custom)
  ├─ [security] sanitizeContent                         (custom)
  ├─ [security] detectPromptInjection                   (custom)
  ├─ [rate-limit] tokenBucket.check                     (custom)
  ├─ [db] INSERT INTO chat_messages (user msg)          (auto)
  ├─ [ai] chatService.processMessage                    (custom)
  │   ├─ [db] SELECT session phase                      (auto)
  │   ├─ [db] SELECT recent messages (limit 20)         (auto)
  │   ├─ [ai] buildSystemPrompt                         (custom)
  │   ├─ [ai] langgraph.stream                          (custom)
  │   │   ├─ [ai] gemini.invoke (iteration 1)           (custom)
  │   │   │   └─ [http] POST googleapis.com             (auto)
  │   │   ├─ [ai] tool.get_style_examples               (custom)
  │   │   │   └─ [db] SELECT FROM style_catalog         (auto)
  │   │   ├─ [ai] gemini.invoke (iteration 2)           (custom)
  │   │   │   └─ [http] POST googleapis.com             (auto)
  │   │   └─ ... (ReAct loop continues)
  │   └─ [db] INSERT INTO chat_messages (assistant msg)  (auto)
  └─ [stream] emit chat:assistant_token (N chunks)       (custom, events)
```

### 2.3 Background Job Trace

```
[root] bullmq.process image:optimize                    (custom)
  ├─ [db] SELECT FROM room_assets                       (auto)
  ├─ [storage] download original                        (custom)
  ├─ [process] sharp.resize                             (custom)
  ├─ [storage] upload variant                           (custom)
  └─ [db] INSERT INTO asset_variants                    (auto)
```

---

## 3. Access Patterns & Consumers

### 3.1 Primary Consumer: Developer (Debugging)

**Use Case**: "Why did this chat message take 8 seconds?"

**Filtering Needs**:
- Filter by `session.id` — see all traces for one renovation session
- Filter by `renovation.phase` — compare latency across phases
- Filter by `ai.model` — identify slow model calls
- Sort by duration — find slowest traces
- Filter by error status — see only failed requests

**Key Views**:
1. Trace waterfall (span hierarchy with timing)
2. AI token usage per session
3. Error rate by endpoint/event

### 3.2 Secondary Consumer: Product Owner (Cost & Usage)

**Use Case**: "How much are we spending on AI per session?"

**Filtering Needs**:
- Aggregate `ai.cost.estimated_usd` by `session.id`
- Aggregate `ai.usage.total_tokens` by `renovation.phase`
- Count traces by `socket.event` — user engagement proxy

**Key Views**:
1. Daily AI cost trend
2. Average tokens per phase
3. Sessions per day with AI activity

### 3.3 Tertiary Consumer: On-Call Engineer (Incident Response)

**Use Case**: "Why are 5xx errors spiking?"

**Filtering Needs**:
- Filter by `http.status_code >= 500`
- Filter by `error.type` — categorize failures
- Filter by time range — narrow to incident window
- Group by `http.route` — identify affected endpoints

**Key Views**:
1. Error rate dashboard (5xx, AI failures, DB timeouts)
2. Latency P50/P95/P99 by endpoint
3. Active alerts

---

## 4. Sampling Strategy

| Condition | Sample Rate | Rationale |
|-----------|-------------|-----------|
| Default (production) | 10% | Balance cost vs visibility |
| `http.status_code >= 500` | 100% | Always trace errors |
| `socket.event = chat:user_message` | 100% | Core user journey |
| `ai.*` spans present | 100% | AI calls are high-value |
| `security.prompt_injection = true` | 100% | Security events |
| `rate_limit.exceeded = true` | 100% | Abuse detection |
| Health check endpoints | 1% | Low value, high volume |
| Development environment | 100% | Full visibility |

---

## 5. Dashboard Prioritization

| Priority | Dashboard | Value | Effort | Decision |
|----------|-----------|-------|--------|----------|
| **P0** | Trace Explorer (Jaeger/Datadog built-in) | High | Zero | Use vendor UI |
| **P1** | AI Cost & Token Usage | High | Medium | Custom query/dashboard |
| **P2** | Error Rate & Latency | High | Low | Vendor alerting |
| **P3** | Session Debugging | Medium | Medium | Custom after P1 |
| **P4** | Security Events | Medium | Low | Log-based alerting |
| **P5** | Capacity Planning | Low | High | Defer to Phase V |

**Recommendation**: No custom frontend dashboard for Phase IV. Use the vendor's built-in trace explorer (Jaeger locally, Datadog/Honeycomb in production). Build custom queries for AI cost tracking only.

---

## 6. Integration Decision

### Recommendation: No Separate Admin Portal

**Rationale**:
- Phase IV is backend instrumentation only — traces are consumed via vendor tools
- Building a custom observability UI is a Phase V concern (if needed at all)
- Jaeger (local) and Datadog/Honeycomb/Grafana Cloud (production) have excellent built-in UIs
- Custom dashboards only needed for AI cost aggregation — achievable with vendor query language

**If a custom dashboard is needed later**:
- Embed as `/admin/observability` routes in the existing Next.js app
- Protect with admin-only auth middleware
- Use TanStack Query to fetch from vendor APIs

---

## 7. Data Retention & Privacy

| Data | Retention | Notes |
|------|-----------|-------|
| Trace spans | 14 days (free tier) | Sufficient for debugging |
| AI cost metrics | 90 days | For billing analysis |
| Security events | 30 days | Log-based, not trace-based |
| `db.statement` | Sanitized | Strip parameter values in prod |
| `user.id` | Included | Needed for per-user debugging |
| Message content | **Never in traces** | Privacy — only in DB + logs |

**Critical**: Never attach user message content (`content` field) to trace attributes. Use `socket.content_length` instead. Message content stays in the database and structured logs only.

---

## 8. Attribute Naming Conventions

Follow [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/) where applicable:

- **HTTP**: `http.method`, `http.route`, `http.status_code` (standard)
- **DB**: `db.system`, `db.statement`, `db.operation` (standard)
- **Messaging**: `messaging.system`, `messaging.operation` (standard)
- **Custom (renovation domain)**: `renovation.phase`, `session.id`, `room.id`
- **Custom (AI)**: `ai.system`, `ai.model`, `ai.usage.*`, `ai.cost.*`
- **Custom (security)**: `security.prompt_injection`, `security.content_sanitized`
- **Custom (jobs)**: `job.queue`, `job.id`, `job.attempt`

Use dot notation. Lowercase. No abbreviations.

---

## Summary

This IA document ensures Phase IV instrumentation collects the right attributes from the start. Key decisions:

1. **39 custom attributes** across 8 layers (HTTP, Socket.io, AI, DB, Jobs, Security, Cache, Context)
2. **Smart sampling**: 100% for errors, AI calls, security events; 10% baseline
3. **No custom dashboard** — use vendor tools for Phase IV
4. **No message content in traces** — privacy by design
5. **3 consumer personas** with distinct filtering needs
6. **Embed admin routes** in existing app if custom UI needed later
