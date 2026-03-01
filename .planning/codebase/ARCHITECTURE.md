# Architecture

**Analysis Date:** 2026-03-01

## Pattern Overview

**Overall:** Monorepo with layered backend (Express + Socket.io) and Next.js App Router frontend, connected by a shared-types contract package. The AI layer uses a LangGraph ReAct agent with tool calling.

**Key Characteristics:**
- pnpm workspace monorepo with 3 packages: backend, frontend, packages/shared-types
- Backend follows Controller -> Service -> Database layered architecture
- Real-time communication via Socket.io (not REST) for the chat flow
- AI agent uses LangGraph StateGraph with tool binding (ReAct loop)
- Phase-based workflow: sessions progress through 7 phases (INTAKE -> COMPLETE -> ITERATE)
- Feature flags control optional integrations (auth, payments, storage, email, tracing)
- BullMQ workers handle async jobs (image processing, renders, email, PDFs)
- Graceful degradation when Redis or optional services are unavailable

## Layers

**HTTP API Layer (Express):**
- Purpose: REST endpoints for CRUD operations on sessions, rooms, messages, assets, styles, products, renders
- Location: `backend/src/routes/*.routes.ts` (route definitions) + `backend/src/controllers/*.controller.ts` (handlers)
- Contains: Route mounting, request validation (Zod via `backend/src/middleware/validate.ts`), auth gating
- Depends on: Controllers, middleware, validators
- Used by: Frontend via `frontend/lib/api.ts` (`fetchWithAuth()`)

**Controller Layer:**
- Purpose: Request/response handling, input parsing, error throwing
- Location: `backend/src/controllers/*.controller.ts`
- Contains: 7 controllers (session, message, room, asset, style, product, render)
- Depends on: Services, database, validators
- Pattern: Uses `asyncHandler` wrapper from `backend/src/utils/async.ts` for error propagation

**Service Layer:**
- Purpose: Business logic, database queries, external API calls
- Location: `backend/src/services/*.service.ts`
- Contains: 11 services (chat, message, room, asset, product, style, style-image, render, image-generation, cache, email, checkpointer)
- Depends on: Database (Drizzle ORM), external SDKs, config
- Key service: `ChatService` (`backend/src/services/chat.service.ts`) - orchestrates the ReAct agent

**Database Layer:**
- Purpose: Schema definitions, connection management, JSONB validation
- Location: `backend/src/db/` (connection), `backend/src/db/schema/*.ts` (12 schema files)
- Contains: Drizzle table definitions, relations, barrel exports
- Connection: `backend/src/db/index.ts` (pg pool with Drizzle wrapper)
- Validation: `backend/src/db/jsonb-schemas.ts` (Zod), `backend/src/db/jsonb-validators.ts`

**AI Agent Layer:**
- Purpose: LangGraph ReAct agent with Gemini model and renovation-specific tools
- Location: `backend/src/services/chat.service.ts` (agent graph), `backend/src/tools/*.ts` (7 tools), `backend/src/config/gemini.ts` (model factories), `backend/src/config/prompts.ts` (phase-aware system prompts)
- Contains: StateGraph definition, tool node, streaming logic, message history conversion
- Pattern: `START -> call_model -> shouldContinue? -> tools -> call_model (loop) | END`
- Guard: `backend/src/utils/agent-guards.ts` (tool whitelist + iteration logging, recursionLimit)

**Worker Layer:**
- Purpose: Async job processing via BullMQ
- Location: `backend/src/workers/*.worker.ts` (4 workers)
- Contains: Job processors for image optimization, email sending, PDF generation, render generation
- Depends on: Services (RenderService, EmailService), queue config, socket-emitter
- Pattern: Validate job data with Zod, process, emit Socket.io events for progress/completion

**Real-Time Layer (Socket.io):**
- Purpose: Bidirectional real-time communication for chat and job progress
- Location: `backend/src/server.ts` (server-side handlers), `frontend/hooks/useChat.ts` (client hook)
- Contains: Connection auth, room management, message handling, streaming token relay
- Type contract: `packages/shared-types/src/socket-events.ts` (ClientToServerEvents, ServerToClientEvents)
- Tracing: `backend/src/middleware/socketio-tracing.middleware.ts`

**Frontend App Layer:**
- Purpose: Next.js App Router pages and React components
- Location: `frontend/app/` (pages), `frontend/components/` (UI components), `frontend/hooks/` (custom hooks)
- Contains: Landing page, dashboard, session/chat view, design system components
- State: TanStack Query for server state, React useState for local state, Socket.io for real-time
- Auth: Supabase SSR client with optional anonymous mode

**Dev-Agents Layer (experimental):**
- Purpose: LangChain-based coding agent framework for automated development tasks
- Location: `backend/src/dev-agents/` (6 specialist agents + supervisor)
- Contains: research, scaffold, implement, test, review, migration agents with tool access
- Middleware: `backend/src/dev-agents/middleware.ts` (tool call limits, model call limits, cost tracking, fallback)
- Feature flag: `isDevAgentEnabled()` in `backend/src/config/env.ts`

## Data Flow

**Chat Message Flow:**

1. User types message in `frontend/components/chat/chat-input.tsx`
2. `useChat` hook (`frontend/hooks/useChat.ts`) optimistically adds message to state
3. Socket.io emits `chat:user_message` with `{ sessionId, content, attachments? }`
4. Server validates payload via Zod (`backend/src/validators/socket.validators.ts`)
5. Server checks prompt injection severity (3-tier: low/medium/high)
6. Server checks rate limit (10 tokens/60s per socket)
7. Server emits `chat:message_ack` back to client
8. `ChatService.processMessage()` loads history, builds phase-aware system prompt
9. LangGraph ReAct agent streams response: model calls -> tool calls -> model calls -> END
10. Each token streamed via `chat:assistant_token` Socket.io event
11. Tool calls/results emitted via `chat:tool_call` / `chat:tool_result` events
12. Final response saved to database via `MessageService.saveMessage()`
13. `chat:assistant_token` with `done: true` signals completion

**Render Generation Flow:**

1. AI agent calls `generate-render` tool during chat
2. Tool creates pending asset record + enqueues BullMQ job (`render:generate`)
3. `render.worker.ts` picks up job, emits `render:started` via Socket.io
4. Worker calls image generation adapter (Gemini or Stability AI)
5. Progress events emitted at stages: generating (0%) -> uploading (70%) -> finalizing (95%)
6. `RenderService.completeRender()` persists image to storage + updates DB
7. `render:complete` event emitted with asset metadata
8. Frontend `useRenderState` hook (`frontend/hooks/useRenderState.ts`) tracks in-flight renders
9. `useSocketQuerySync` hook bridges Socket.io events to TanStack Query cache invalidation

**Session CRUD Flow:**

1. Frontend calls `fetchWithAuth('/api/sessions')` from `frontend/lib/api.ts`
2. Express route hits `optionalAuthMiddleware` -> controller -> direct Drizzle query
3. Response returns `{ sessions: [...] }` (wrapped, not bare array)

**State Management:**
- Server state: TanStack Query (`@tanstack/react-query`) with `QueryProvider` in `frontend/components/providers/query-provider.tsx`
- Real-time state: Socket.io events update React state in `useChat`, `useRenderState`, `useAssetProcessingState` hooks
- Bridge pattern: `useSocketQuerySync` listens to Socket.io events and invalidates TanStack Query cache
- Local UI state: React `useState` for form inputs, typing indicators, error display
- Theme: `next-themes` with `ThemeProvider` in `frontend/components/providers/theme-provider.tsx`

## Key Abstractions

**AppError Hierarchy:**
- Purpose: Typed HTTP errors with status codes
- Location: `backend/src/utils/errors.ts`
- Classes: `AppError` (base, any status), `NotFoundError` (404), `BadRequestError` (400), `ConflictError` (409)
- Pattern: Throw in controllers/services, caught by `errorHandler` middleware

**Logger:**
- Purpose: Structured JSON logging with trace correlation
- Location: `backend/src/utils/logger.ts` (backend), `frontend/lib/logger.ts` (frontend)
- Pattern: `new Logger({ serviceName: 'X' })` then `logger.info()`, `logger.warn()`, `logger.error()`
- Auto-includes: timestamp, level, service, requestId (AsyncLocalStorage), trace_id, span_id (OTel)

**TracedModel:**
- Purpose: LangChain model with attached OTel trace attributes
- Location: `backend/src/config/gemini.ts`
- Type: `ChatGoogleGenerativeAI & { traceAttributes: AISpanAttributes }`
- Factory functions: `createChatModel()`, `createVisionModel()`, `createStructuredModel()`, `createStreamingModel()`

**WorkerProfile:**
- Purpose: Operational configuration per job queue (concurrency, timeouts, retry policy)
- Location: `backend/src/config/queue.ts`
- Pattern: `WORKER_PROFILES` record maps job name to profile with concurrency, lockDuration, timeoutMs, stalledInterval, limiter, defaultJobOptions

## Entry Points

**Backend Server:**
- Location: `backend/src/server.ts`
- Triggers: `tsx watch src/server.ts` (dev) or `node dist/server.js` (prod)
- Startup sequence: Sentry -> Redis -> Workers (email, image, doc, render) -> DB validation -> LangGraph checkpointer -> Express app -> HTTP server -> Socket.io -> Graceful shutdown setup
- Guard: `if (!process.env.VITEST)` prevents server start during unit tests

**Backend Express App:**
- Location: `backend/src/app.ts`
- Creates: Express app with middleware stack (Sentry, Helmet, requestId, CORS, body parsing, rate limiting, routes, error handler)
- Exported as: `createApp()` factory function (testable)

**Frontend Root Layout:**
- Location: `frontend/app/layout.tsx`
- Contains: ThemeProvider -> QueryProvider -> Header + Main + Footer + Toaster
- Server component with client provider wrappers

**Frontend Pages:**
- Landing: `frontend/app/page.tsx`
- Dashboard: `frontend/app/app/page.tsx`
- Session/Chat: `frontend/app/app/session/[sessionId]/page.tsx` -> `frontend/components/session/session-page-client.tsx`

## Error Handling

**Strategy:** Layered error handling with typed errors, global catch, and Sentry integration

**Patterns:**
- Controllers use `asyncHandler` wrapper to propagate async errors to Express error middleware
- Services throw `AppError` subclasses (NotFoundError, BadRequestError, ConflictError)
- Global error handler (`backend/src/middleware/errorHandler.ts`): catches all unhandled errors, generates errorId, logs structured error, reports to Sentry, returns JSON `{ success: false, error, errorId }`
- Special handling for DB connection errors in development (helpful error message with fix instructions)
- Socket.io errors emitted as `chat:error` events (never crash the connection)
- BullMQ workers distinguish permanent errors (`UnrecoverableError`) from retriable ones
- Frontend: `fetchWithAuth` throws on non-OK responses, error boundaries in `frontend/app/error.tsx` and `frontend/app/app/error.tsx`
- AI agent: `GraphRecursionError` caught and converted to user-friendly fallback message

## Cross-Cutting Concerns

**Logging:** Custom structured JSON logger (`backend/src/utils/logger.ts`) with trace correlation. Use `new Logger({ serviceName })` pattern. Never use `console.log`.

**Validation:** Zod schemas throughout:
- Environment: `backend/src/config/env.ts`
- Socket.io payloads: `backend/src/validators/socket.validators.ts`
- HTTP request bodies: `backend/src/validators/*.validators.ts` via `validate` middleware
- Job data: `backend/src/validators/job.validators.ts`
- JSONB columns: `backend/src/db/jsonb-schemas.ts`

**Authentication:** Optional Supabase JWT verification. `optionalAuthMiddleware` for HTTP, `isAuthEnabled()` guard for Socket.io. Anonymous mode when Supabase env vars not set.

**Rate Limiting:**
- HTTP: `rate-limiter-flexible` in `backend/src/middleware/rate-limit.middleware.ts` (apiLimiter, chatLimiter)
- Socket.io: In-memory token bucket in `backend/src/server.ts` (10 tokens/60s per socket)

**Security:**
- Helmet for HTTP headers (`backend/src/app.ts`)
- CORS restricted to `FRONTEND_URL`
- Prompt injection detection with 3-tier severity (`backend/src/validators/socket.validators.ts`)
- UUID validation on all IDs
- Request ID propagation via AsyncLocalStorage (`backend/src/middleware/request-id.middleware.ts`)

**Observability:**
- OpenTelemetry: auto-instrumentation for HTTP/DB, manual spans for Socket.io and AI calls
- Sentry: error capture in error handler middleware
- Structured logging with requestId and OTel trace correlation

---

*Architecture analysis: 2026-03-01*
