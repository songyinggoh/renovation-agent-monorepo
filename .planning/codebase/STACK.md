# Technology Stack

**Analysis Date:** 2026-03-01

## Languages

**Primary:**
- TypeScript 5.x - All backend, frontend, and shared-types code
  - Backend: `backend/tsconfig.json` targets ESNext with NodeNext module resolution
  - Frontend: `frontend/tsconfig.json` targets ES2017 with bundler module resolution
  - Shared: `packages/shared-types/` (separate tsc compilation)

**Secondary:**
- SQL - Drizzle ORM migrations in `backend/drizzle/*.sql`
- CSS - Tailwind utility classes + custom CSS variables in `frontend/app/globals.css`
- JavaScript - k6 load tests in `backend/load-tests/`

## Runtime

**Environment:**
- Node.js 20 (CI pinned via `actions/setup-node@v4` with `node-version: '20'`)
- No `.nvmrc` or `.node-version` file (rely on CI config only)

**Package Manager:**
- pnpm 10.29.1 (declared in root `package.json` `"packageManager"` field)
- Lockfile: `pnpm-lock.yaml` (present, CI uses `--frozen-lockfile`)
- Workspace config: `pnpm-workspace.yaml` (packages: backend, frontend, packages/*)

## Frameworks

**Core:**
- Next.js 16.1.6 - App Router, React Server Components
- React 19.2.4 - Latest stable with concurrent features
- Express.js 4.22.1 - HTTP API server, ESM mode (`"type": "module"`)
- Socket.io 4.8.1 - Real-time WebSocket communication (bidirectional)
- LangChain 1.2.27 + LangGraph 1.0.13 - AI agent orchestration (ReAct pattern with tool calling)

**Testing:**
- Vitest 3.0.5 (backend) / 4.0.18 (frontend) - Unit test runner with v8 coverage
- @testing-library/react 16.3.2 - React component testing (jsdom env)
- Playwright - E2E browser testing (root `e2e/` directory)
- Supertest 7.1.0 - HTTP integration testing
- Testcontainers 11.11.0 - Docker-based integration tests (PostgreSQL containers)

**Build/Dev:**
- TypeScript Compiler (tsc) - Backend build to `backend/dist/`
- tsx 4.19.2 - Dev server with hot reload (`tsx watch`), script runner
- concurrently 8.2.2 - Parallel dev servers (frontend + backend)
- Husky 9.1.7 + lint-staged 16.2.7 - Pre-commit hooks (lint on staged files)

## Key Dependencies

**Critical (backend):**
- `@langchain/google-genai` 2.1.20 - Gemini AI model integration via LangChain
- `@langchain/langgraph` 1.0.13 - StateGraph for ReAct agent loop
- `@langchain/langgraph-checkpoint-postgres` 1.0.0 - Conversation memory persistence
- `@langchain/anthropic` 1.3.20 - Claude model for dev-agent framework
- `@google/genai` 1.0.0 - Direct Google AI SDK (image generation)
- `drizzle-orm` 0.38.3 / `drizzle-kit` 0.31.9 - Type-safe SQL ORM + migration tooling
- `pg` 8.13.1 - PostgreSQL driver
- `zod` 3.24.1 - Runtime schema validation (env, socket payloads, job data)
- `bullmq` 5.69.1 - Redis-backed job queues (4 queue types)

**Critical (frontend):**
- `@tanstack/react-query` 5.90.20 - Server state management and caching
- `socket.io-client` 4.8.3 - WebSocket client for real-time chat
- `@supabase/ssr` 0.8.0 + `@supabase/supabase-js` 2.94.1 - Auth (SSR-compatible)
- `react-hook-form` 7.71.1 + `@hookform/resolvers` 5.2.2 - Form management with Zod
- `stripe` 18.5.0 - Payment integration (Phase 9, not yet active)

**Infrastructure (backend):**
- `ioredis` 5.9.3 - Redis client (caching, Socket.io adapter, BullMQ)
- `@socket.io/redis-adapter` 8.3.0 - Multi-instance Socket.io via Redis pub/sub
- `@sentry/node` 10.38.0 - Error tracking + profiling
- `@opentelemetry/sdk-node` 0.212.0 - Distributed tracing (spans, metrics)
- `helmet` 8.1.0 - Security headers
- `rate-limiter-flexible` 9.1.1 - HTTP rate limiting
- `sharp` 0.34.5 - Image processing (thumbnails, WebP, AVIF)
- `resend` 6.9.2 - Transactional email
- `puppeteer-core` 24.37.4 + `@sparticuz/chromium` 143.0.4 - PDF generation
- `handlebars` 4.7.8 - Email/doc templates

**UI Framework (frontend):**
- Tailwind CSS 3.4.19 - Utility-first CSS framework
- shadcn/ui - Component library (Radix UI primitives + Tailwind)
- `class-variance-authority` 0.7.1 - Variant-based component styling
- `lucide-react` 0.542.0 - Icon library
- `next-themes` 0.4.6 - Dark mode ("Blueprint Mode")
- `react-dropzone` 14.4.0 - File upload drag-and-drop
- `react-hot-toast` 2.6.0 - Toast notifications

## Shared Types Package

**Location:** `packages/shared-types/`
- Workspace dependency: `@renovation/shared-types` (workspace:*)
- Must be built before backend/frontend: `pnpm run build:shared-types`
- Barrel export: `packages/shared-types/src/index.ts`
- Exports: `RenovationPhase`, Socket.io event types (`ClientToServerEvents`, `ServerToClientEvents`), asset types, message types, product constants
- Build: pure `tsc` (no bundler)

## Configuration

**Environment (backend):**
- Validated via Zod schema: `backend/src/config/env.ts`
- Required: `DATABASE_URL`, `GOOGLE_API_KEY`
- Optional by phase: `SUPABASE_*` (Phase 8), `STRIPE_*` (Phase 9)
- Optional infrastructure: `REDIS_URL` (default localhost:6379), `SENTRY_DSN`, `OTEL_*`
- Helper functions: `isAuthEnabled()`, `isPaymentsEnabled()`, `isStorageEnabled()`, `isTelemetryEnabled()`, `isEmailEnabled()`, `isPdfEnabled()`, `isImageGenerationEnabled()`, `isDevAgentEnabled()`
- `.env` files: `backend/.env` and `frontend/.env.local` (not committed, see `.env.example`)

**Build:**
- `backend/tsconfig.json` - strict: true, ESNext target, NodeNext modules, rootDir: ./src, outDir: ./dist
- `frontend/tsconfig.json` - strict: true, bundler module resolution, `@/*` path alias
- `backend/eslint.config.js` - ESLint 9 flat config, typescript-eslint recommended
- `frontend/eslint.config.mjs` - eslint-config-next (core-web-vitals + typescript)
- `frontend/tailwind.config.ts` - Custom design system tokens, phase colors, material tokens
- `codecov.yml` - Coverage targets: 80% project, 80% patch

## Platform Requirements

**Development:**
- Node.js 20+
- pnpm 10.29.1+
- PostgreSQL 15 (via Docker, Supabase, or local)
- Redis 7 (optional, graceful degradation when absent)
- Google API Key (Gemini AI)

**Production:**
- Docker (backend: `backend/Dockerfile`, orchestrated via `docker-compose.yml`)
- GHCR (GitHub Container Registry) - backend Docker images via `backend-deploy.yml`
- Vercel - frontend deployment via `frontend-deploy.yml`
- PostgreSQL 15 (Supabase hosted or self-managed)
- Redis 7 (required for BullMQ workers, Socket.io adapter, caching)

---

*Stack analysis: 2026-03-01*
