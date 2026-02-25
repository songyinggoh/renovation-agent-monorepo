# Attribute Catalog

Complete inventory of custom span attributes used in the renovation agent OTel implementation, organized by layer and domain.

## HTTP Layer (Auto-Instrumented + requestHook)

Set by `createExpressRequestHook()` in `telemetry.ts`:

| Attribute | Type | Source | Description |
|---|---|---|---|
| `request.id` | string | `X-Request-ID` header | Unique request ID from `request-id.middleware.ts` |
| `session.id` | string | Route param `:sessionId` | Renovation session UUID |
| `room.id` | string | Route param `:roomId` | Room UUID within session |
| `user.id` | string | `req.user.id` (auth middleware) | Authenticated user UUID |
| `renovation.phase` | string | `req.session.phase` | Current renovation phase |
| `service.name` | string | `OTEL_SERVICE_NAME` env | Service identifier |
| `deployment.environment` | string | `NODE_ENV` env | Environment name |
| `http.request.header.x_force_sample` | string | `x-force-sample` header | Force sampling flag |

Set automatically by OTel auto-instrumentation:

| Attribute | Type | Description |
|---|---|---|
| `http.method` | string | HTTP method (GET, POST, etc.) |
| `http.route` | string | Express route pattern |
| `http.status_code` | number | Response status code |
| `http.target` | string | Request path |
| `http.request.header.content_type` | string | Content-Type header |
| `http.request.header.user_agent` | string | User-Agent header |

## Socket.io Layer

Set by `setSocketAttributes()` in `socketio-tracing.middleware.ts`:

| Attribute | Type | Set By | Description |
|---|---|---|---|
| `messaging.system` | string | `setSocketAttributes` | Always `"socket.io"` |
| `messaging.operation` | string | Various | `"receive"`, `"connection"`, `"disconnect"` |
| `socket.id` | string | `setSocketAttributes` | Socket.io connection ID |
| `socket.event` | string | `setSocketAttributes` | Event name (e.g., `"chat:user_message"`) |
| `socket.transport` | string | `setSocketAttributes` | `"websocket"` or `"polling"` |
| `socket.room` | string | `addMessageAttributes` / `addJoinAttributes` | Session room (e.g., `"session:uuid"`) |
| `socket.content_length` | number | `addMessageAttributes` | Message content length (NOT content!) |
| `socket.disconnect_reason` | string | `traceDisconnect` | Disconnect reason string |
| `user.id` | string | `setSocketAttributes` | From `AuthenticatedSocket.user.id` |
| `session.id` | string | `addMessageAttributes` / `addJoinAttributes` | Renovation session UUID |

## Security Layer

Set by `addSecurityAttributes()`:

| Attribute | Type | Description |
|---|---|---|
| `security.prompt_injection` | boolean | Whether prompt injection was detected |
| `validation.passed` | boolean | Whether input validation passed |

## Rate Limiting Layer

Set by `addRateLimitAttributes()`:

| Attribute | Type | Description |
|---|---|---|
| `rate_limit.exceeded` | boolean | Whether rate limit was exceeded |
| `rate_limit.tokens_remaining` | number | Remaining tokens in bucket |

## AI Pipeline Layer

Set by `traceAICall()` / `startAIStreamSpan()` in `ai-tracing.ts`:

| Attribute | Type | Description |
|---|---|---|
| `ai.system` | string | AI provider (always `"gemini"`) |
| `ai.model` | string | Model name (e.g., `"gemini-2.5-flash"`) |
| `ai.temperature` | number | Sampling temperature |
| `ai.prompt.phase` | string | Renovation phase context |
| `ai.prompt.history_size` | number | Number of chat history messages |
| `ai.tool.name` | string | Name of tool being called |
| `ai.tool.calls_count` | number | Number of tool calls in response |
| `ai.react_loop.iterations` | number | ReAct loop iteration count |
| `ai.usage.prompt_tokens` | number | Input tokens consumed |
| `ai.usage.completion_tokens` | number | Output tokens generated |
| `ai.usage.total_tokens` | number | Total tokens (prompt + completion) |
| `ai.cost.estimated_usd` | number | Estimated cost in USD |
| `ai.stream.first_token_ms` | number | Time to first token (streaming) |
| `ai.stream.total_ms` | number | Total stream duration (streaming) |

## Database Layer (Auto-Instrumented)

Set automatically by `@opentelemetry/instrumentation-pg`:

| Attribute | Type | Description |
|---|---|---|
| `db.system` | string | Always `"postgresql"` |
| `db.statement` | string | SQL statement (DEV only, disabled in production) |
| `db.name` | string | Database name |

Helper in `telemetry.ts`:

| Function | Output | Description |
|---|---|---|
| `extractTableName(sql)` | string | Parses table name from SQL (FROM/INTO/UPDATE) |

## Resource Attributes

Set on the OTel Resource (global to all spans):

| Attribute | Type | Source |
|---|---|---|
| `service.name` | string | `OTEL_SERVICE_NAME` env or `"renovation-agent-backend"` |
| `service.version` | string | `npm_package_version` or `"1.0.0"` |
| `deployment.environment` | string | `NODE_ENV` or `"development"` |

## Naming Conventions

When adding new attributes, follow these rules:

1. **Use dot-separated namespaces**: `domain.field` (e.g., `ai.model`, `session.id`)
2. **Use lowercase**: `socket.event`, not `Socket.Event`
3. **Use underscores within words**: `content_length`, not `contentLength`
4. **Prefer OTel semantic conventions** when they exist (e.g., `messaging.system`, `http.method`)
5. **Prefix with domain**: `renovation.phase`, `ai.usage.total_tokens`
6. **Boolean attributes**: use `true`/`false`, name should imply the positive case (`rate_limit.exceeded`, `security.prompt_injection`)
7. **ID attributes**: suffix with `.id` (`session.id`, `user.id`, `request.id`)

## Adding a New Attribute

1. Choose the correct layer and namespace
2. Add the `span.setAttribute()` call in the appropriate file
3. Document it in this catalog
4. Add a test asserting the attribute is set
5. Consider: does this attribute contain PII? If yes, DO NOT add it.
