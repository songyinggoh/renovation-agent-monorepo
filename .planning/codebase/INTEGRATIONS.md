# External Integrations

**Analysis Date:** 2026-04-17

## APIs & External Services

**AI / Machine Learning:**
- Google Gemini (via `@langchain/google-genai` and `@google/genai`)
  - SDK/Client: `backend/src/config/gemini.ts` (LangChain wrapper), `backend/src/services/image-generation.service.ts` (native `@google/genai`)
  - Auth: `GOOGLE_API_KEY` env var
  - Models: `gemini-2.5-flash` (chat/vision/structured/streaming), `gemini-2.5-flash-image` (image generation)
  - Used for: ReAct agent conversation, vision analysis, structured JSON output, room render image generation

- Anthropic Claude (via `@langchain/anthropic`)
  - SDK/Client: `backend/src/config/claude.ts`
  - Auth: `ANTHROPIC_API_KEY` env var (optional — gates `isDevAgentEnabled()`)
  - Used for: dev-agent framework only (`backend/src/dev-agents/`), not the end-user product

- Stability AI (optional alternate image provider)
  - SDK/Client: `StabilityAIAdapter` in `backend/src/services/image-generation.service.ts`
  - Auth: `STABILITY_API_KEY` env var
  - Activation: `IMAGE_GENERATION_PROVIDER=stability` env var (default is `gemini`)

**Payments:**
- Stripe
  - SDK/Client: `stripe` npm package, lazy-initialized in `backend/src/config/stripe.ts`
  - Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` env vars
  - Guards: `isPaymentsEnabled()` check before any Stripe call
  - Used for: Checkout Session creation (`backend/src/services/payment.service.ts`), webhook fulfillment
  - Webhook endpoint: `POST /api/webhooks/stripe` — mounted in `backend/src/app.ts` with `express.raw()` before `express.json()` (required for signature verification)
  - Frontend: `stripe` npm package in `frontend/` for Stripe.js (redirect to hosted Checkout)

**Email:**
- Resend
  - SDK/Client: `resend` npm package, lazy-initialized in `backend/src/config/email.ts`
  - Auth: `RESEND_API_KEY` env var (optional — gates `isEmailEnabled()`)
  - Used for: transactional email via BullMQ `email:send-notification` jobs (`backend/src/workers/email.worker.ts`)
  - Templates: `backend/src/emails/templates.ts`
  - Rate limit: 10 emails/second (configured in BullMQ worker profile, `backend/src/config/queue.ts`)

**Error Tracking & Monitoring:**
- Sentry
  - Backend SDK: `@sentry/node` + `@sentry/profiling-node`, initialized in `backend/src/config/sentry.ts`
  - Frontend SDK: `@sentry/nextjs`, configured in `frontend/sentry.*.config.ts`
  - Auth: `SENTRY_DSN` env var (optional)
  - Config: `SENTRY_ORG`, `SENTRY_PROJECT` (frontend source map upload)
  - Used for: error capture, performance tracing, CPU profiling

## Data Storage

**Databases:**
- PostgreSQL 15
  - Connection: `DATABASE_URL` env var
  - Client: `pg` (connection pool, max 20) + Drizzle ORM (`backend/src/db/index.ts`)
  - Also used for: LangGraph checkpoint persistence (`LANGGRAPH_CHECKPOINTER=postgres`), distributed rate limiting (`rate_limits` table via `rate-limiter-flexible`)

**File Storage:**
- Supabase Storage
  - Client: `supabaseAdmin` in `backend/src/config/supabase.ts` (service role key)
  - Auth: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` env vars
  - Buckets:
    - `SUPABASE_STORAGE_BUCKET` (default `room-assets`) — user-uploaded room photos and floorplans
    - `SUPABASE_STYLE_BUCKET` (default `style-assets`) — style moodboard images
    - `SUPABASE_DOCUMENTS_BUCKET` (default `renovation-documents`) — AI-generated PDFs
  - Guards: `isStorageEnabled()` — requires `isAuthEnabled()` to be true
  - Usage: `backend/src/services/asset.service.ts`, `backend/src/services/render.service.ts`, `backend/src/services/document.service.ts`
  - Signed URLs: 15-minute expiry for asset access

**Caching:**
- Redis (via ioredis)
  - Connection: `REDIS_URL` env var (default `redis://localhost:6379`)
  - Client: `backend/src/config/redis.ts` (lazy connect, 5-retry strategy)
  - Used for: Socket.io Redis adapter (cross-instance events), BullMQ job queues, `CacheService` (`backend/src/services/cache.service.ts`)
  - Graceful degradation: all Redis-dependent features (workers, Socket.io adapter) skip with warnings if Redis is unavailable

## Authentication & Identity

**Auth Provider:**
- Supabase Auth
  - Backend: `supabaseAdmin.auth.getUser(token)` in `backend/src/middleware/auth.middleware.ts`
  - Frontend: `@supabase/ssr` client in `frontend/lib/supabase/`; auth callback route at `frontend/app/auth/callback/route.ts`
  - Activation: optional — `isAuthEnabled()` returns false when Supabase vars are absent, enabling anonymous access (Phases 1-7)
  - Socket.io auth: token passed in `socket.handshake.auth.token`, verified in `backend/src/server.ts` io.use() middleware

**Anonymous Access Pattern:**
- HTTP routes use `optionalAuthMiddleware` (`backend/src/middleware/auth.middleware.ts`) — passes through without a token when Supabase is not configured
- Socket.io skips auth when `!isAuthEnabled()`
- Frontend `fetchWithAuth` (`frontend/lib/api.ts`) omits `Authorization` header when no session token exists
- `useChat` hook (`frontend/hooks/useChat.ts`) connects with `auth: token ? { token } : {}`

## Observability

**Distributed Tracing:**
- OpenTelemetry (OTLP over HTTP)
  - SDK: `@opentelemetry/sdk-node` with `BatchSpanProcessor`
  - Exporter: `@opentelemetry/exporter-trace-otlp-http`
  - Config: `backend/src/config/telemetry.ts` (must import before all other modules in `server.ts`)
  - Activation: `OTEL_ENABLED=true` (default), `OTEL_EXPORTER_OTLP_ENDPOINT` for export destination
  - Auto-instrumentation: HTTP, Express, PostgreSQL via `@opentelemetry/auto-instrumentations-node`
  - Custom instrumentation: Socket.io (`backend/src/middleware/socketio-tracing.middleware.ts`), AI calls (`backend/src/utils/ai-tracing.ts`), Logger trace correlation (`backend/src/utils/logger.ts`)
  - Force-sample header: `x-force-sample` (for load tests and E2E verification)

**Error Tracking:**
- Sentry (see "Error Tracking & Monitoring" above)

**Logs:**
- Structured JSON logger (`backend/src/utils/logger.ts`) — outputs `{ timestamp, level, service, message, requestId, trace_id, span_id, ...metadata }`
- Request ID propagated via `AsyncLocalStorage` (`backend/src/middleware/request-id.middleware.ts`)

**Queue Monitoring:**
- Bull Board at `/admin/queues` — only mounted when `NODE_ENV !== 'production'`

## CI/CD & Deployment

**Hosting:**
- Frontend: Vercel (`.github/workflows/frontend-deploy.yml`)
- Backend: containerized (`.github/workflows/backend-deploy.yml`), Docker (`backend/Dockerfile`)

**CI Pipeline:**
- GitHub Actions — `.github/workflows/` contains:
  - `quality-gates.yml` — lint, type-check, unit tests, schema drift detection
  - `integration-tests.yml` — integration tests with test database
  - `ai-regression.yml` — AI prompt smoke tests (token budget guards)
  - `frontend-deploy.yml` — Vercel deployment
  - `backend-deploy.yml` — backend deployment
  - `dependency-audit.yml` — npm audit
  - `dependency-review.yml` — PR dependency review
  - `docker-scan.yml` — container vulnerability scanning
  - `codeql.yml` — static analysis
  - `semgrep.yml` — security scanning
  - `lighthouse.yml` — frontend performance
  - `db-health.yml` — database health checks
  - `release.yml` — release automation

## Webhooks & Callbacks

**Incoming:**
- `POST /api/webhooks/stripe` — Stripe payment events (`checkout.session.completed`, etc.)
  - Raw body required for HMAC signature verification
  - Handler: `handleStripeWebhook` in `backend/src/controllers/payment.controller.ts`

- `GET /app/auth/callback` — Supabase OAuth callback
  - Handler: `frontend/app/auth/callback/route.ts`

**Outgoing:**
- None — all external API calls are request-initiated (Stripe Checkout, Gemini, Resend)

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` — PostgreSQL connection string
- `GOOGLE_API_KEY` — Gemini API key

**Critical optional vars (features silently disabled without them):**
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` — auth and file storage
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — payments
- `REDIS_URL` — job queues and cross-instance events
- `RESEND_API_KEY` — email delivery
- `SENTRY_DSN` — error tracking
- `ANTHROPIC_API_KEY` — dev-agent framework

**Frontend env vars:**
- `NEXT_PUBLIC_API_URL` — backend URL (default `http://localhost:3000`)
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser Supabase client
- `NEXT_PUBLIC_SENTRY_DSN` — frontend Sentry

---

*Integration audit: 2026-04-17*
