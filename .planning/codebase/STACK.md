# Technology Stack

**Analysis Date:** 2026-04-17

## Languages

**Primary:**
- TypeScript 5.9 — all backend and frontend source code
- SQL — Drizzle migrations in `backend/drizzle/*.sql`

**Secondary:**
- HBS (Handlebars) — PDF templates in `backend/src/templates/`
- HTML/CSS — via Tailwind CSS utility classes

## Runtime

**Environment:**
- Node.js 20 (backend, per GitHub Actions `.github/workflows/`)
- Browser (frontend, Next.js React 19)

**Package Manager:**
- pnpm 10.29.1 (workspace monorepo)
- Lockfile: `pnpm-lock.yaml` (present)
- Workspace config: `pnpm-workspace.yaml` — packages: `backend`, `frontend`, `packages/*`

## Frameworks

**Backend Core:**
- Express 4.22 — HTTP server, configured in `backend/src/app.ts`
- Socket.io 4.8 — real-time bidirectional events, initialized in `backend/src/server.ts`
- ESM module system — `"type": "module"` in `backend/package.json`; all internal imports use `.js` extensions

**Frontend Core:**
- Next.js 16 (App Router) — React 19 SSR/SSG framework (`frontend/app/`)
- React 19 — UI rendering
- TanStack Query v5 — server state, query cache, invalidation (`frontend/components/providers/query-provider.tsx`)

**AI / Agent:**
- LangChain Core 1.1 — message types, chains (`backend/src/services/chat.service.ts`)
- `@langchain/google-genai` 2.1 — `ChatGoogleGenerativeAI` wrapper (`backend/src/config/gemini.ts`)
- `@langchain/langgraph` 1.2 — `StateGraph` ReAct agent with tool calling (`backend/src/services/chat.service.ts`)
- `@langchain/langgraph-checkpoint-postgres` 1.0 — durable agent state persistence (`backend/src/services/checkpointer.service.ts`)
- `@langchain/langgraph-supervisor` 1.0 — multi-agent dev-agent framework (`backend/src/dev-agents/supervisor.ts`)
- `@google/genai` 1.45 — native Gemini SDK for image generation (`backend/src/services/image-generation.service.ts`)
- `@langchain/anthropic` 1.3 — Claude SDK for dev-agent framework (`backend/src/config/claude.ts`)

**AI Models in Use:**
- `gemini-2.5-flash` — chat, vision, structured output, streaming (all via `backend/src/config/gemini.ts`)
- `gemini-2.5-flash-image` — image generation in `GeminiImageAdapter` (`backend/src/services/image-generation.service.ts`)
- Stability AI (optional, `sd3`) — alternate image generation adapter when `STABILITY_API_KEY` is set

**Database ORM:**
- Drizzle ORM 0.38 — type-safe SQL builder, connection pool via `pg` (`backend/src/db/index.ts`)
- drizzle-kit 0.31 — migration generation CLI and Studio GUI

**Job Queue:**
- BullMQ 5.71 — Redis-backed job queue with typed workers (`backend/src/config/queue.ts`)
- Bull Board 6.20 — queue admin UI at `/admin/queues` (dev/staging only, `backend/src/app.ts`)

**Testing:**
- Vitest 3.2 (backend) / 4.1 (frontend) — unit and integration test runner
- `@vitest/coverage-v8` — V8 coverage provider
- Playwright — end-to-end browser tests (`e2e/playwright.config.ts`)
- Testcontainers 11.12 — Docker-based integration test environments
- Supertest 7.2 — HTTP integration testing
- k6 — load tests (`backend/load-tests/health-check.k6.js`, `backend/load-tests/chat-flow.k6.js`)

**Build/Dev:**
- `tsx` 4.21 — TypeScript execution in dev (no compile step); also runs scripts
- `concurrently` 8.2 — parallel frontend + backend dev start from monorepo root
- Husky 9.1 + lint-staged 16.4 — pre-commit hooks (root `package.json`)

## Key Dependencies

**Critical:**
- `drizzle-orm` 0.38 + `pg` 8.20 — all database access (pool max 20, 30s idle timeout)
- `@langchain/langgraph` 1.2 — core ReAct agent runtime
- `socket.io` 4.8 — real-time AI token streaming to browser
- `stripe` 18.5 — Checkout Session creation and webhook processing
- `zod` 3.25 — env config validation, all HTTP and Socket.io request validation

**Infrastructure:**
- `ioredis` 5.10 — Redis client (Socket.io adapter, BullMQ, cache); use named import `import { Redis } from 'ioredis'`
- `@socket.io/redis-adapter` 8.3 — cross-instance Socket.io pub/sub
- `rate-limiter-flexible` 9.1 — PostgreSQL-backed distributed rate limiting (`backend/src/middleware/rate-limit.middleware.ts`)
- `helmet` 8.1 — HTTP security headers (CSP active in production only)
- `@supabase/supabase-js` 2.99 — JWT auth and Supabase Storage for assets, renders, documents
- `resend` 6.9 — transactional email (`backend/src/config/email.ts`)
- `sharp` 0.34 — server-side image optimization in BullMQ image worker
- `puppeteer-core` 24.39 + `@sparticuz/chromium` 143 — serverless-compatible PDF generation (`backend/src/services/document.service.ts`)
- `handlebars` 4.7 — HTML template rendering for PDFs

**Observability:**
- `@sentry/node` 10.43 + `@sentry/profiling-node` — backend error tracking and profiling
- `@sentry/nextjs` 10.43 — frontend error and performance
- `@opentelemetry/sdk-node` 0.212 + OTLP HTTP exporter — distributed tracing, configured in `backend/src/config/telemetry.ts`

**Frontend UI:**
- shadcn/ui — component library built on Radix UI primitives (`frontend/components/ui/`)
- Radix UI: `@radix-ui/react-dialog`, `@radix-ui/react-separator`, `@radix-ui/react-slot`
- `lucide-react` 0.542 — icon set
- `tailwindcss` 3.4 + `tailwindcss-animate` — utility CSS
- `next-themes` 0.4 — dark/light mode
- `react-hook-form` 7.71 + `@hookform/resolvers` 5.2 — form state management
- `react-dropzone` 14.4 — file upload drag-and-drop
- `react-hot-toast` 2.6 — toast notifications
- `class-variance-authority` + `clsx` + `tailwind-merge` — variant-based component styles

## Configuration

**Environment:**
- Backend: `backend/.env` (gitignored), validated at startup by Zod schema in `backend/src/config/env.ts`
- Frontend: `frontend/.env.local` (gitignored)
- Reference templates: `backend/.env.example`, `frontend/.env.example`

**Required backend vars:**
- `DATABASE_URL` — PostgreSQL connection string
- `GOOGLE_API_KEY` — Gemini API key

**Optional backend vars (feature-gated):**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — enables auth + storage
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — enables payments
- `REDIS_URL` (default `redis://localhost:6379`) — enables BullMQ workers and Socket.io Redis adapter
- `RESEND_API_KEY` — enables email worker
- `SENTRY_DSN` — enables error tracking
- `ANTHROPIC_API_KEY` — enables dev-agent framework
- `OTEL_EXPORTER_OTLP_ENDPOINT` — enables trace export
- `STABILITY_API_KEY` — enables Stability AI image provider
- `LANGGRAPH_CHECKPOINTER` — `memory` (default) or `postgres`

**Feature-gate helper functions in `backend/src/config/env.ts`:**
- `isAuthEnabled()`, `isPaymentsEnabled()`, `isStorageEnabled()`, `isEmailEnabled()`, `isTelemetryEnabled()`, `isImageGenerationEnabled()`, `isDevAgentEnabled()`

**Build:**
- Backend: `tsc` → `backend/dist/` (target ESNext, module NodeNext)
- Frontend: `next build` (prebuild step compiles `@renovation/shared-types`)
- Shared types: `tsc` → `packages/shared-types/dist/`

## Platform Requirements

**Development:**
- Node.js 20, pnpm 10.29.1
- Docker + Docker Compose (PostgreSQL 15, Redis 7-alpine) or local instances
- Redis optional in dev — workers log warnings and skip gracefully

**Production:**
- TLS termination at reverse proxy level (app runs plain HTTP internally)
- PostgreSQL 15, Redis (required for BullMQ and Socket.io cross-instance)
- Supabase project (when auth/storage features enabled)
- Stripe account (when payments enabled)
- OTLP-compatible collector optional (Grafana Cloud, Honeycomb, etc.)
- Frontend: Vercel (per `.github/workflows/frontend-deploy.yml`)
- Backend: containerized deployment (per `.github/workflows/backend-deploy.yml`)

---

*Stack analysis: 2026-04-17*
