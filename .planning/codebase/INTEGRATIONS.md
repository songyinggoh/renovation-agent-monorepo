# External Integrations

**Analysis Date:** 2026-03-01

## APIs & External Services

**AI / LLM:**
- Google Gemini 2.5 Flash - Primary AI model for chat, vision, structured output, streaming
  - SDK/Client: `@langchain/google-genai` (via LangChain abstraction)
  - Direct SDK: `@google/genai` (image generation only)
  - Auth: `GOOGLE_API_KEY` env var
  - Config: `backend/src/config/gemini.ts` (4 factory functions: chat, vision, structured, streaming)
  - All models use `gemini-2.5-flash` with varying temperature (0.3-0.7)

- Anthropic Claude (dev-agents only) - AI coding assistants
  - SDK/Client: `@langchain/anthropic`
  - Model: `claude-sonnet-4-20250514` (used as fallback via `modelFallbackMiddleware`)
  - Auth: `ANTHROPIC_API_KEY` env var (optional, dev-agent feature)
  - Config: `backend/src/dev-agents/middleware.ts`

**Image Generation:**
- Gemini Image Generation - AI render generation for room visualizations
  - Adapter pattern: `backend/src/services/image-generation.service.ts`
  - Factory: `createImageGenerationAdapter()` returns `GeminiImageAdapter` or `StabilityAIAdapter`
  - Fallback provider: Stability AI SD3 (via REST API, `STABILITY_API_KEY`)
  - Worker: `backend/src/workers/render.worker.ts` (BullMQ, concurrency: 1, timeout: 90s)

## Data Storage

**Primary Database:**
- PostgreSQL 15 (Supabase-hosted or self-managed)
  - Connection: `DATABASE_URL` env var
  - Client: Drizzle ORM (`backend/src/db/index.ts`)
  - Schema: 12 tables across `backend/src/db/schema/*.ts`
  - Tables: profiles, renovation_sessions, renovation_rooms, product_recommendations, contractor_recommendations, chat_messages, styles, style_images, assets, asset_variants, document_artifacts, products_catalog
  - Migrations: `backend/drizzle/` (managed by drizzle-kit, journal-based)
  - JSONB validation: `backend/src/db/jsonb-schemas.ts` (5 Zod schemas)

**Conversation Memory:**
- LangGraph PostgreSQL Checkpointer
  - Package: `@langchain/langgraph-checkpoint-postgres`
  - Config: `backend/src/services/checkpointer.service.ts`
  - Purpose: Persists ReAct agent state per session (thread_id = sessionId)

**Caching:**
- Redis 7 (via ioredis)
  - Connection: `REDIS_URL` env var (default: `redis://localhost:6379`)
  - Client: `backend/src/config/redis.ts` (lazy connect, graceful degradation)
  - Service: `backend/src/services/cache.service.ts` (get/set/invalidate with TTL)
  - Graceful fallback: App works without Redis (in-memory Socket.io adapter, no caching)

**File Storage:**
- Supabase Storage (when configured)
  - Used for: room photo uploads, render output images
  - Service: `backend/src/services/asset.service.ts` (signed URLs, upload/download)
  - Auth: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` env vars

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (optional, Phases 1-7 run without it)
  - Backend client: `backend/src/config/supabase.ts` (admin client with service role key)
  - Frontend client: `frontend/lib/supabase/client.ts` (browser), `frontend/lib/supabase/server.ts` (SSR)
  - Middleware: `frontend/lib/supabase/middleware.ts` (Next.js middleware for session refresh)
  - Backend middleware: `backend/src/middleware/auth.middleware.ts`
    - `authMiddleware` - Always requires valid Bearer token
    - `optionalAuthMiddleware` - Skips auth when Supabase not configured
    - `verifyToken()` - Validates JWT via `supabaseAdmin.auth.getUser()`
  - Feature flag: `isAuthEnabled()` checks if `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set
  - Auth callback: `frontend/app/auth/callback/route.ts`
  - Socket.io auth: Token passed in `socket.handshake.auth.token`, validated in `backend/src/server.ts`

## Real-Time Communication

**WebSocket:**
- Socket.io 4.8.1
  - Server: `backend/src/server.ts` (initialized after HTTP server)
  - Client: `frontend/hooks/useChat.ts` (React hook)
  - Redis adapter: `@socket.io/redis-adapter` for multi-instance pub/sub
  - Events defined in: `packages/shared-types/src/socket-events.ts`
  - Client events: `chat:join_session`, `chat:user_message`
  - Server events: `chat:session_joined`, `chat:message_ack`, `chat:assistant_token`, `chat:tool_call`, `chat:tool_result`, `chat:error`, `chat:warning`, `render:started`, `render:progress`, `render:complete`, `render:failed`
  - Validation: Zod schemas in `backend/src/validators/socket.validators.ts`
  - Security: Prompt injection detection (3-tier severity), 10KB max payload, rate limiting (10 msg/60s)
  - Global accessor: `backend/src/utils/socket-emitter.ts` (`emitToSession()` via `(global).io`)

## Job Processing

**Queue System:**
- BullMQ 5.69.1 (Redis-backed)
  - Config: `backend/src/config/queue.ts`
  - Dead letter queue: `backend/src/config/dead-letter.ts`
  - Admin UI: Bull Board at `/admin/queues` (dev/staging only, see `backend/src/app.ts`)

**Queue Types:**
| Queue | Worker File | Purpose | Concurrency | Timeout |
|-------|-------------|---------|-------------|---------|
| `image:optimize` | `backend/src/workers/image.worker.ts` | Thumbnail/WebP/AVIF generation | 2 | 30s |
| `email:send-notification` | `backend/src/workers/email.worker.ts` | Transactional email via Resend | 5 | 10s |
| `doc:generate-plan` | `backend/src/workers/doc.worker.ts` | PDF generation via Puppeteer | 1 | 60s |
| `render:generate` | `backend/src/workers/render.worker.ts` | AI image generation | 1 | 90s |

**Worker Patterns:**
- `UnrecoverableError` for permanent failures (content policy, invalid data)
- Regular `Error` for retriable failures (network, timeout)
- Exponential backoff on retry
- Dead letter queue for exhausted retries

## Email

**Provider:**
- Resend (`resend` 6.9.2)
  - Auth: `RESEND_API_KEY` env var
  - Config: `backend/src/config/email.ts`
  - Service: `backend/src/services/email.service.ts`
  - Templates: `backend/src/emails/templates.ts` (Handlebars)
  - Feature flag: `isEmailEnabled()` checks `RESEND_API_KEY`

## Payments

**Provider:**
- Stripe (Phase 9, not yet active)
  - SDK: `stripe` 18.5.0 (installed but not wired)
  - Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` env vars
  - Feature flag: `isPaymentsEnabled()` checks Stripe keys

## Monitoring & Observability

**Error Tracking:**
- Sentry
  - Backend: `@sentry/node` 10.38.0, config in `backend/src/config/sentry.ts`
  - Frontend: `@sentry/nextjs` 10.38.0, config in `frontend/sentry.*.config.ts` (client, server, edge)
  - Error handler integration: `backend/src/middleware/errorHandler.ts` calls `Sentry.captureException()`
  - Auth: `SENTRY_DSN` env var (optional)

**Distributed Tracing:**
- OpenTelemetry
  - SDK: `@opentelemetry/sdk-node` 0.212.0
  - Config: `backend/src/config/telemetry.ts` (BatchSpanProcessor, OTLP exporter)
  - HTTP/DB auto-instrumentation
  - Socket.io tracing: `backend/src/middleware/socketio-tracing.middleware.ts`
  - AI call tracing: `backend/src/utils/ai-tracing.ts` (IA doc 1.4 attributes)
  - Logger correlation: `backend/src/utils/logger.ts` injects `trace_id`, `span_id`
  - Force-sample header: `x-force-sample` for debugging

**Logs:**
- Custom structured JSON logger: `backend/src/utils/logger.ts`
  - Includes: timestamp, level, service, message, requestId, trace_id, span_id
  - Frontend mirror: `frontend/lib/logger.ts`

## CI/CD & Deployment

**CI Pipeline (GitHub Actions):**
| Workflow | File | Trigger |
|----------|------|---------|
| Quality Gates | `.github/workflows/quality-gates.yml` | PR to main |
| Integration Tests | `.github/workflows/integration-tests.yml` | PR/push to main (backend changes) |
| Backend Deploy | `.github/workflows/backend-deploy.yml` | Push to main (backend changes) |
| Frontend Deploy | `.github/workflows/frontend-deploy.yml` | Push to main (frontend changes) |
| AI Regression | `.github/workflows/ai-regression.yml` | Manual/scheduled |
| Migration Safety | Part of `quality-gates.yml` | PRs touching `backend/drizzle/` |
| CodeQL | `.github/workflows/codeql.yml` | Security scanning |
| Semgrep | `.github/workflows/semgrep.yml` | SAST scanning |
| Dependency Audit | `.github/workflows/dependency-audit.yml` | Dependency vulnerability checks |
| Docker Scan | `.github/workflows/docker-scan.yml` | Container image scanning |
| Lighthouse | `.github/workflows/lighthouse.yml` | Frontend performance |
| DB Health | `.github/workflows/db-health.yml` | Database monitoring |
| Release | `.github/workflows/release.yml` | Release automation |

**Hosting:**
- Backend: Docker on GHCR (GitHub Container Registry)
- Frontend: Vercel
- Database: Supabase (managed PostgreSQL 15)

**Coverage:**
- Codecov integration via `codecov.yml`
  - Project target: 80%, patch target: 80%
  - Flags: `backend` (src/), `frontend` (app/, components/, hooks/, lib/)
  - Carryforward enabled for both flags

## Environment Configuration

**Required env vars (backend):**
- `DATABASE_URL` - PostgreSQL connection string
- `GOOGLE_API_KEY` - Gemini AI API key

**Optional env vars (backend):**
- `REDIS_URL` - Redis connection (default: redis://localhost:6379)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` - Auth (Phase 8)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` - Payments (Phase 9)
- `RESEND_API_KEY`, `FROM_EMAIL` - Email
- `SENTRY_DSN`, `SENTRY_ENVIRONMENT` - Error tracking
- `OTEL_EXPORTER_OTLP_ENDPOINT` - Tracing exporter
- `STABILITY_API_KEY` - Stability AI fallback for image generation
- `ANTHROPIC_API_KEY` - Dev-agent Claude model
- `SHUTDOWN_TIMEOUT_MS` - Graceful shutdown timeout (default: 10000)

**Required env vars (frontend):**
- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (optional for anonymous mode)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (optional for anonymous mode)

---

*Integration audit: 2026-03-01*
