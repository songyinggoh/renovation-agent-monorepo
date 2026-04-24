# Architecture

**Analysis Date:** 2026-04-17

## Pattern Overview

**Overall:** Layered monolith backend with event-driven async workers, real-time WebSocket streaming, and a React SPA frontend

**Key Characteristics:**
- Backend is a single Express process that also runs BullMQ workers in-process
- AI agent is a LangGraph ReAct loop (model → tool calls → model) driven synchronously per Socket.io message
- Real-time AI token streaming goes directly over Socket.io — no HTTP polling
- Phase-gated session state machine drives what the AI agent does and what UI is shown
- Optional feature flags (auth, payments, storage, email) are toggled by env var presence at startup

## Layers

**Routes Layer:**
- Purpose: HTTP routing, middleware chains, request/response shaping
- Location: `backend/src/routes/`
- Contains: Express Router files — one per domain (session, message, room, asset, render, document, payment, style, product, health)
- Depends on: controllers, middleware
- Used by: `backend/src/app.ts` (all mounted under `/api/`)

**Controllers Layer:**
- Purpose: Request validation, orchestration, HTTP response formatting
- Location: `backend/src/controllers/`
- Contains: `session.controller.ts`, `message.controller.ts`, `room.controller.ts`, `asset.controller.ts`, `render.controller.ts`, `document.controller.ts`, `payment.controller.ts`, `product.controller.ts`, `style.controller.ts`
- Depends on: services, validators, middleware helpers
- Used by: routes

**Services Layer:**
- Purpose: Business logic, domain operations, external service calls
- Location: `backend/src/services/`
- Contains: `chat.service.ts` (ReAct agent), `render.service.ts` (AI image orchestration), `document.service.ts` (PDF generation), `payment.service.ts` (Stripe), `asset.service.ts` (file uploads), `message.service.ts`, `room.service.ts`, `product.service.ts`, `style.service.ts`, `style-image.service.ts`, `email.service.ts`, `cache.service.ts`, `checkpointer.service.ts`
- Depends on: db, config (AI models, Stripe, Supabase), utils
- Used by: controllers, workers, Socket.io handler in `server.ts`

**Database Layer:**
- Purpose: Type-safe PostgreSQL access
- Location: `backend/src/db/`
- Contains: `index.ts` (pool + Drizzle instance), `schema/` (12 table definitions), `jsonb-schemas.ts` (Zod schemas for JSONB columns), `jsonb-validators.ts`
- Depends on: `pg`, `drizzle-orm`
- Used by: services, Socket.io session ownership checks in `server.ts`

**Workers Layer:**
- Purpose: Async background job processing via BullMQ
- Location: `backend/src/workers/`
- Contains: `image.worker.ts` (Sharp image optimization), `render.worker.ts` (Gemini image generation), `doc.worker.ts` (Puppeteer PDF), `email.worker.ts` (Resend)
- Depends on: services, config/queue, Socket.io global `io` instance for progress events
- Used by: started during server startup in `backend/src/server.ts`

**Tools Layer (LangGraph):**
- Purpose: AI agent tool implementations — callable by the ReAct agent during conversation
- Location: `backend/src/tools/`
- Contains: `save-intake-state.tool.ts`, `save-checklist-state.tool.ts`, `save-plan-state.tool.ts`, `save-renders-state.tool.ts`, `save-product-recommendation.tool.ts`, `generate-render.tool.ts`, `generate-document.tool.ts`, `get-style-examples.tool.ts`, `search-products.tool.ts`
- Depends on: services, db
- Used by: `ChatService.createReActAgent()` — all tools bound to the model via `model.bindTools(renovationTools)`

**Validators Layer:**
- Purpose: Zod schema validation for HTTP bodies and Socket.io payloads
- Location: `backend/src/validators/`
- Contains: `socket.validators.ts` (chat events + prompt injection detection), `session.validators.ts`, `room.validators.ts`, `render.validators.ts`, `product.validators.ts`, `style.validators.ts`, `checklist.validators.ts`, `job.validators.ts`
- Depends on: zod
- Used by: controllers (via `validate` middleware), `server.ts` Socket.io handlers

**Middleware Layer:**
- Purpose: Cross-cutting request concerns
- Location: `backend/src/middleware/`
- Contains: `auth.middleware.ts` (Supabase JWT), `ownership.middleware.ts` (session ownership gate), `rate-limit.middleware.ts` (PostgreSQL-backed limiters), `request-id.middleware.ts` (AsyncLocalStorage request ID), `socketio-tracing.middleware.ts` (OTel spans), `errorHandler.ts`, `validate.ts`

**Config Layer:**
- Purpose: External service clients and validated environment
- Location: `backend/src/config/`
- Contains: `env.ts` (Zod-validated singleton), `gemini.ts` (model factories), `stripe.ts` (lazy Stripe client), `supabase.ts` (admin client), `redis.ts` (ioredis singleton), `queue.ts` (BullMQ queues + worker factory), `sentry.ts`, `telemetry.ts`, `email.ts`, `claude.ts`, `dead-letter.ts`, `prompts.ts`

**Frontend Layers:**
- `frontend/app/` — Next.js App Router pages (server components by default)
- `frontend/components/` — React components organized by domain
- `frontend/hooks/` — custom React hooks (data fetching, Socket.io, state)
- `frontend/lib/` — utilities, API client, design tokens, font config

## Data Flow

**Chat Message Flow (primary):**

1. User types message in `frontend/components/chat/chat-input.tsx`
2. `useChat` hook (`frontend/hooks/useChat.ts`) emits `chat:user_message` via Socket.io
3. `server.ts` Socket.io handler validates payload with Zod, checks rate limit, verifies session room membership
4. Prompt injection check via `sanitizeContent()` in `backend/src/validators/socket.validators.ts`
5. `ChatService.processMessage()` invoked (`backend/src/services/chat.service.ts`)
6. LangGraph `StateGraph` runs: loads message history from DB → calls Gemini 2.5 Flash with tools bound → streams tokens back
7. Each token emitted to Socket.io room via `onToken` callback → `chat:assistant_token` event
8. If agent calls a tool (e.g. `generate-render`), `onToolCall` / `onToolResult` events emitted
9. On completion, `MessageService` persists both user and assistant messages to `chat_messages` table
10. Frontend `useChat` hook assembles streaming tokens into final message, updates React state

**AI Render Flow:**

1. Agent calls `generate-render` tool during chat conversation
2. Tool calls `RenderService.requestRender()` — creates pending `room_assets` record, enqueues `render:generate` BullMQ job
3. `render.worker.ts` picks up job: calls `ImageGenerationService` → `GeminiImageAdapter.generate()` → Gemini `gemini-2.5-flash-image`
4. On success: stores image buffer to Supabase Storage, updates asset record to `ready`, emits `render:complete` Socket.io event to session room
5. Frontend `useRenderState` hook (`frontend/hooks/useRenderState.ts`) tracks in-flight renders via Socket.io events
6. `useSocketQuerySync` hook (`frontend/hooks/useSocketQuerySync.ts`) invalidates TanStack Query cache on `render:complete` (500ms delay to avoid race with DB write)
7. `RenderGallery` component re-fetches and displays the completed render

**Document Generation Flow:**

1. Agent calls `generate-document` tool
2. Tool enqueues `doc:generate-plan` BullMQ job
3. `doc.worker.ts` calls `DocumentService.generateDocument()`: loads session data, renders Handlebars template to HTML, converts to PDF via Puppeteer/Chromium
4. PDF uploaded to Supabase Storage `renovation-documents` bucket
5. `document_artifacts` record created, `doc:generated` Socket.io event emitted
6. Frontend `useSocketQuerySync` invalidates documents query cache

**Payment Flow:**

1. Frontend `PaymentPanel` component calls `POST /api/payments/checkout/:sessionId`
2. `checkoutLimiter` rate limit applied (5/10min), then `optionalAuthMiddleware` + `verifySessionOwnership`
3. `PaymentController` gates on session phase (must be PAYMENT phase) and `isPaymentsEnabled()`
4. `PaymentService.createCheckoutSession()` creates Stripe Checkout Session, returns redirect URL
5. Frontend redirects user to Stripe hosted checkout page
6. On payment completion, Stripe sends `checkout.session.completed` webhook to `POST /api/webhooks/stripe`
7. `handleStripeWebhook` verifies HMAC signature, calls `PaymentService.fulfillPayment()`: sets `isPaid=true`, advances session to COMPLETE phase, emits `payment:completed` Socket.io event

**State Management (Frontend):**
- Server state: TanStack Query v5 (sessions, rooms, renders, documents, products)
- Real-time updates: Socket.io events → `useSocketQuerySync` → TanStack Query `invalidateQueries()`
- Local UI state: React `useState` in components
- No global client state store (no Redux/Zustand)

## Key Abstractions

**Renovation Session (Phase State Machine):**
- Purpose: Tracks overall project progress and gates AI behavior
- Location: `backend/src/db/schema/sessions.schema.ts`
- Phases (in order): `INTAKE → CHECKLIST → PLAN → RENDER → PAYMENT → COMPLETE → ITERATE`
- Phase transitions: driven by AI agent tool calls (e.g. `saveChecklistState` moves INTAKE→CHECKLIST)
- Frontend reads phase to show/hide panels: `PHASE_INDEX` in `frontend/lib/design-tokens.ts`

**ReAct Agent (ChatService):**
- Purpose: Conversational AI with tool-calling capability
- Location: `backend/src/services/chat.service.ts`
- Pattern: LangGraph `StateGraph` — `START → call_model → shouldContinue? → tools → call_model (loop) → END`
- Tools registered: 9 tools covering all phase transitions and content generation
- Iteration guard: `createSafeShouldContinue()` in `backend/src/utils/agent-guards.ts` caps recursion
- Checkpointing: `@langchain/langgraph-checkpoint-postgres` for durable multi-turn conversation state

**BullMQ Workers:**
- Purpose: Long-running async jobs (image gen 90s, PDF 120s, email)
- Location: `backend/src/workers/`
- Pattern: `createWorker(jobName, processor, profile)` factory in `backend/src/config/queue.ts`
- Worker profiles: typed `WorkerProfile` configs (concurrency, lock duration, timeout, rate limiter)
- Dead letter queue: final failures copied to DLQ via `backend/src/config/dead-letter.ts`
- Error pattern: `throw new UnrecoverableError(msg)` for permanent failures (no retry), `throw new Error(msg)` for retriable

**Shared Types Package:**
- Purpose: Type-safe contract between frontend and backend for Socket.io events and domain constants
- Location: `packages/shared-types/src/`
- Key exports: `ClientToServerEvents`, `ServerToClientEvents` (Socket.io event types), `RenovationPhase`, asset/message/product constants
- Consumed by: `backend/src/server.ts` (`SocketIOServer<ClientToServerEvents, ServerToClientEvents>`), `frontend/hooks/useChat.ts`

**Dev-Agent Framework:**
- Purpose: AI-powered developer tooling (separate from product)
- Location: `backend/src/dev-agents/`
- Pattern: LangGraph supervisor routing to 6 specialist agents (scaffold, migration, test, review, research, implement)
- Entry: `backend/src/dev-agents/cli.ts` (CLI), `backend/src/dev-agents/cli-workflow.ts` (workflow)
- Requires: `ANTHROPIC_API_KEY` (Claude), not used in end-user product

## Entry Points

**Backend HTTP Server:**
- Location: `backend/src/server.ts`
- Startup order: OTel init → Sentry init → Redis → workers (email, image, doc, render) → DB connection → LangGraph checkpointer → Express app → HTTP server → Socket.io → graceful shutdown setup
- Exports: `startServer`, `httpServer`, `io`

**Backend Express App:**
- Location: `backend/src/app.ts`
- Responsibilities: middleware stack (Sentry → Helmet → request ID → CORS → raw body for Stripe → JSON → logging → rate limiting), route mounting, Bull Board (dev only), dev-only bypass routes, error handler

**Frontend Root:**
- Location: `frontend/app/layout.tsx`
- Wraps all pages with: `ThemeProvider`, `QueryProvider` (TanStack Query), global header/footer, `Toaster`

**Frontend App Shell:**
- Location: `frontend/app/app/layout.tsx` — app section layout
- Key pages: `frontend/app/app/page.tsx` (dashboard), `frontend/app/app/session/[sessionId]/page.tsx` (session chat)

## Error Handling

**Strategy:** Typed error classes propagated through layers, centralized HTTP handler, structured logging everywhere

**Patterns:**
- Domain errors extend `AppError` with HTTP status codes: `NotFoundError (404)`, `BadRequestError (400)`, `ConflictError (409)` — all in `backend/src/utils/errors.ts`
- Express errors caught by `errorHandler` middleware (`backend/src/middleware/errorHandler.ts`) — maps `AppError` to JSON response, forwards to Sentry if configured
- BullMQ workers: `UnrecoverableError` for permanent failures (Stripe fraud, invalid data), plain `Error` for retriable failures
- Socket.io errors: emitted back to client as `chat:error` event with `{ error: string }` payload
- Rate limit errors: 429 with `RateLimit-*` headers and `Retry-After`
- Frontend: TanStack Query error states in hooks, `react-hot-toast` for user-visible errors

## Cross-Cutting Concerns

**Logging:** Structured JSON via `Logger` class (`backend/src/utils/logger.ts`) — never `console.log`. Automatically injects `requestId` (from AsyncLocalStorage), `trace_id`, `span_id`. Level controlled by `LOG_LEVEL` env var.

**Validation:** Zod schemas for all boundaries — env config, HTTP request bodies (via `validate` middleware), Socket.io payloads, JSONB column shapes, BullMQ job payloads

**Request Tracing:** Every HTTP request gets a UUID from `requestIdMiddleware` (`backend/src/middleware/request-id.middleware.ts`) stored in `AsyncLocalStorage`. Propagated in logs and `X-Request-ID` response header.

**Authentication:** `optionalAuthMiddleware` on all API routes — passes through anonymously when Supabase not configured. `verifySessionOwnership` middleware (`backend/src/middleware/ownership.middleware.ts`) gates session-scoped mutations. Socket.io auth in `server.ts` io.use() middleware.

**Rate Limiting:** PostgreSQL-backed distributed limits via `rate-limiter-flexible` with in-memory insurance fallback. Four limiters: `apiLimiter` (100/15min), `chatLimiter` (20/15min), `authLimiter` (10/15min), `checkoutLimiter` (5/10min). Socket.io has an additional in-memory token bucket (10 tokens/60s per socket).

---

*Architecture analysis: 2026-04-17*
