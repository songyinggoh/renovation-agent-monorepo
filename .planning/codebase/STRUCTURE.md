# Codebase Structure

**Analysis Date:** 2026-03-01

## Directory Layout

```
renovation-agent-monorepo/
├── backend/                    # Express.js API + Socket.io server
│   ├── src/
│   │   ├── config/             # Environment, AI models, Redis, Sentry, queues, telemetry
│   │   ├── controllers/        # HTTP request handlers (7 controllers)
│   │   ├── data/               # Seed data (products, styles, style-images)
│   │   ├── db/                 # Database connection + schema definitions
│   │   │   └── schema/         # Drizzle table schemas (12 files)
│   │   ├── dev-agents/         # LangChain dev-agent framework (experimental)
│   │   │   ├── implement/      # Implementation agent
│   │   │   ├── migration/      # Migration agent
│   │   │   ├── research/       # Research agent
│   │   │   ├── review/         # Code review agent
│   │   │   ├── scaffold/       # Scaffolding agent
│   │   │   ├── test/           # Test writing agent
│   │   │   └── tools/          # Agent tools (bash, file-ops, git, search)
│   │   ├── emails/             # Email templates (Handlebars)
│   │   ├── middleware/         # Express + Socket.io middleware
│   │   ├── routes/             # Express route definitions (8 route files)
│   │   ├── services/           # Business logic layer (11 services)
│   │   ├── tools/              # LangGraph agent tools (7 renovation tools)
│   │   ├── types/              # TypeScript type declarations
│   │   ├── utils/              # Shared utilities (logger, errors, tracing, guards)
│   │   ├── validators/         # Zod validation schemas (7 validator files)
│   │   ├── workers/            # BullMQ job processors (4 workers)
│   │   ├── app.ts              # Express app factory (middleware + routes)
│   │   └── server.ts           # HTTP + Socket.io server startup + shutdown
│   ├── tests/
│   │   ├── unit/               # Unit tests mirroring src/ structure
│   │   ├── integration/        # Integration tests (API + Socket.io)
│   │   └── ai-regression/      # AI output regression tests
│   ├── drizzle/                # Database migrations (journal-managed)
│   │   ├── archive/            # Archived manual migrations
│   │   ├── meta/               # Drizzle-kit journal metadata
│   │   └── rollbacks/          # Auto-generated rollback scripts
│   ├── load-tests/             # k6 load test scripts
│   ├── scripts/                # DB utility scripts + migration safety tools
│   ├── vitest.config.ts        # Unit test config
│   ├── vitest.integration.config.ts  # Integration test config
│   └── vitest.ai-regression.config.ts # AI regression test config
│
├── frontend/                   # Next.js 16 App Router
│   ├── app/                    # Pages (App Router)
│   │   ├── page.tsx            # Landing page
│   │   ├── layout.tsx          # Root layout (providers, header, footer)
│   │   ├── app/                # Authenticated app section
│   │   │   ├── page.tsx        # Dashboard (session list)
│   │   │   └── session/
│   │   │       └── [sessionId]/
│   │   │           └── page.tsx # Chat session page
│   │   ├── auth/callback/      # Supabase auth callback
│   │   ├── render-test/        # Render testing page
│   │   └── test-chat/          # Chat testing page
│   ├── components/
│   │   ├── chat/               # Chat UX components (10 files)
│   │   ├── dashboard/          # Dashboard components (create session, session list)
│   │   ├── providers/          # React context providers (Query, Theme)
│   │   ├── renovation/         # Domain-specific components (11 files)
│   │   ├── session/            # Session page layout (client wrapper, sidebar)
│   │   └── ui/                 # shadcn/ui base components (9 files)
│   ├── hooks/                  # Custom React hooks (7 hooks)
│   ├── lib/                    # Utilities and clients
│   │   ├── supabase/           # Supabase client (browser, server, middleware)
│   │   ├── api.ts              # fetchWithAuth helper
│   │   ├── api-mappers.ts      # API response transformers
│   │   ├── design-tokens.ts    # Phase config, PHASE_CONFIG, PHASE_INDEX
│   │   ├── fonts.ts            # Font definitions (Inter, DM Serif, JetBrains Mono)
│   │   ├── logger.ts           # Frontend structured logger
│   │   ├── upload.ts           # File upload utilities
│   │   └── utils.ts            # cn() helper (clsx + tailwind-merge)
│   ├── types/                  # Frontend-specific types
│   │   ├── chat.ts             # Message, chat-related types
│   │   └── renovation.ts       # SessionSummary, RoomSummary interfaces
│   ├── __tests__/              # Frontend test files
│   │   ├── components/chat/    # Chat component tests
│   │   ├── hooks/              # Hook tests
│   │   └── setup.ts            # Test setup (jsdom)
│   ├── middleware.ts           # Next.js middleware (Supabase session refresh)
│   ├── vitest.config.ts        # Frontend test config
│   └── tailwind.config.ts      # Tailwind + design system config
│
├── packages/
│   └── shared-types/           # Shared TypeScript types
│       ├── src/
│       │   ├── index.ts        # Barrel export
│       │   ├── phases.ts       # RenovationPhase type + constants
│       │   ├── session.ts      # Session-related types
│       │   ├── assets.ts       # Asset types, statuses, MIME types
│       │   ├── messages.ts     # Message roles, types
│       │   ├── socket-events.ts # Socket.io event type contracts
│       │   └── constants.ts    # Product categories, room types
│       └── dist/               # Compiled output (tsc)
│
├── e2e/                        # Playwright E2E tests
├── database/                   # Docker init scripts (schema.sql, seed.sql)
├── supabase/                   # Supabase local dev config
├── .github/workflows/          # CI/CD pipelines (13 workflow files)
├── .planning/                  # Planning documents + codebase analysis
├── docker-compose.yml          # Local dev stack (Postgres, Redis, backend, frontend)
├── pnpm-workspace.yaml         # Workspace package definitions
├── codecov.yml                 # Coverage configuration
└── package.json                # Root package.json (workspace scripts)
```

## Directory Purposes

**`backend/src/config/`:**
- Purpose: Application configuration and external service clients
- Contains: Environment validation (`env.ts`), AI model factories (`gemini.ts`, `claude.ts`), Redis client (`redis.ts`), Sentry init (`sentry.ts`), BullMQ queue config (`queue.ts`), dead letter queue (`dead-letter.ts`), telemetry (`telemetry.ts`), email config (`email.ts`), prompts (`prompts.ts`), Supabase admin client (`supabase.ts`)
- Key pattern: Each file exports factory functions or singleton instances. Feature flags (`isAuthEnabled()`, etc.) live in `env.ts`.

**`backend/src/controllers/`:**
- Purpose: HTTP request handlers (thin layer between routes and services)
- Contains: 7 controllers - `session.controller.ts`, `message.controller.ts`, `room.controller.ts`, `asset.controller.ts`, `style.controller.ts`, `product.controller.ts`, `render.controller.ts`
- Pattern: Export named handler functions wrapped in `asyncHandler()`. Each function receives `(req, res)`.

**`backend/src/services/`:**
- Purpose: Business logic, database operations, external API orchestration
- Contains: 11 services covering chat, messages, rooms, assets, products, styles, renders, image generation, caching, email, checkpointer
- Key file: `chat.service.ts` - Creates and runs the ReAct agent graph
- Pattern: Class-based services instantiated in controllers or server.ts. Constructor initializes dependencies.

**`backend/src/tools/`:**
- Purpose: LangGraph agent tools that the AI can call during conversation
- Contains: 7 tools - `save-intake-state`, `save-checklist-state`, `save-product-recommendation`, `save-renders-state`, `search-products`, `get-style-examples`, `generate-render`
- Barrel export: `backend/src/tools/index.ts` exports `renovationTools` array
- Pattern: Each tool is a LangChain `DynamicStructuredTool` with Zod input schema

**`backend/src/validators/`:**
- Purpose: Zod schemas for runtime validation
- Contains: Socket.io payload validation (`socket.validators.ts`), HTTP body schemas (`session.validators.ts`, `room.validators.ts`, `style.validators.ts`, `product.validators.ts`, `checklist.validators.ts`), job data validation (`job.validators.ts`), shared constants (`constants.ts`)
- Key file: `socket.validators.ts` includes prompt injection detection (3-tier severity classification)

**`backend/src/workers/`:**
- Purpose: BullMQ job processor functions
- Contains: 4 workers - `image.worker.ts` (thumbnails/WebP/AVIF), `email.worker.ts` (Resend), `doc.worker.ts` (PDF via Puppeteer), `render.worker.ts` (AI image generation)
- Pattern: Each exports `startXxxWorker()` function called from `server.ts`

**`backend/src/dev-agents/`:**
- Purpose: Experimental LangChain agent framework for automated coding tasks
- Contains: 6 specialist agents (research, scaffold, implement, test, review, migration) + supervisor + middleware + cost tracking + shared tools (bash, file-ops, git, search)
- Pattern: Each agent has `agent.ts` (creation) + `prompt.ts` (system prompt). Middleware provides tool/model call limits and cost tracking.

**`frontend/components/chat/`:**
- Purpose: Chat interface components
- Contains: `chat-view.tsx`, `chat-input.tsx`, `message-list.tsx`, `empty-state.tsx`, `suggestion-bubbles.tsx`, `context-chip.tsx`, `inline-approval-widget.tsx`, `visual-response.tsx`, `file-upload-zone.tsx`, `tool-result-renderer.tsx`, `tool-error-boundary.tsx`

**`frontend/components/renovation/`:**
- Purpose: Domain-specific renovation UI components
- Contains: `phase-progress-bar.tsx`, `budget-gauge.tsx`, `room-card.tsx`, `material-swatch.tsx`, `contractor-card.tsx`, `timeline-view.tsx`, `trust-badge.tsx`, `before-after-slider.tsx`, `phase-transition.tsx`, `render-card.tsx`, `render-gallery.tsx`
- Barrel export: `frontend/components/renovation/index.ts`

**`frontend/hooks/`:**
- Purpose: Custom React hooks for state management and real-time features
- Contains: `useChat.ts` (Socket.io chat), `useSession.ts` (session data), `useSessionRooms.ts` (room queries), `useFileUpload.ts` (file upload state), `useRenderState.ts` (render tracking via Socket.io), `useRoomRenders.ts` (render queries), `useSocketQuerySync.ts` (Socket.io -> TanStack Query bridge), `useAssetProcessingState.ts` (asset processing progress)

## Key File Locations

**Entry Points:**
- `backend/src/server.ts`: Backend server startup (HTTP + Socket.io + workers)
- `backend/src/app.ts`: Express app factory (middleware + routes)
- `frontend/app/layout.tsx`: Root layout (providers, header, footer)
- `frontend/app/page.tsx`: Landing page
- `frontend/app/app/page.tsx`: Dashboard page

**Configuration:**
- `backend/src/config/env.ts`: Environment variable validation (Zod schema + feature flags)
- `backend/src/config/gemini.ts`: AI model factories
- `backend/src/config/queue.ts`: BullMQ queue definitions and worker profiles
- `backend/src/config/prompts.ts`: Phase-aware system prompts for AI agent
- `frontend/tailwind.config.ts`: Design system tokens
- `frontend/lib/design-tokens.ts`: Phase config constants

**Core Logic:**
- `backend/src/services/chat.service.ts`: ReAct agent graph + message processing
- `backend/src/tools/index.ts`: Agent tool registry
- `backend/src/utils/socket-emitter.ts`: Global Socket.io emitter for workers
- `frontend/hooks/useChat.ts`: Client-side chat state + Socket.io connection

**Database:**
- `backend/src/db/index.ts`: Database connection pool
- `backend/src/db/schema/index.ts`: Schema barrel export (12 tables)
- `backend/drizzle/`: Migration files (journal-managed)

## Naming Conventions

**Files:**
- Backend source: `kebab-case.ts` (e.g., `chat.service.ts`, `auth.middleware.ts`)
- Backend tests: `kebab-case.test.ts` mirroring source path (e.g., `tests/unit/services/chat.service.test.ts`)
- Frontend components: `kebab-case.tsx` (e.g., `chat-input.tsx`, `phase-progress-bar.tsx`)
- Frontend hooks: `camelCase.ts` (e.g., `useChat.ts`, `useRenderState.ts`)
- Schema files: `kebab-case.schema.ts` (e.g., `sessions.schema.ts`)
- Validator files: `kebab-case.validators.ts` (e.g., `socket.validators.ts`)
- Worker files: `kebab-case.worker.ts` (e.g., `render.worker.ts`)

**Directories:**
- `kebab-case` throughout (e.g., `dev-agents/`, `shared-types/`)

**Exports:**
- Functions: `camelCase` (e.g., `createChatModel`, `fetchWithAuth`, `emitToSession`)
- Classes: `PascalCase` (e.g., `ChatService`, `Logger`, `AppError`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `WORKER_PROFILES`, `RENOVATION_PHASES`, `MAX_REACT_ITERATIONS`)
- Types/Interfaces: `PascalCase` (e.g., `TracedModel`, `StreamCallback`, `WorkerProfile`)
- Zod schemas: `camelCase` (e.g., `chatUserMessageSchema`, `renderGenerateJobSchema`)

## Where to Add New Code

**New API Endpoint:**
1. Create validator schema: `backend/src/validators/{resource}.validators.ts`
2. Create or extend controller: `backend/src/controllers/{resource}.controller.ts`
3. Create or extend service: `backend/src/services/{resource}.service.ts`
4. Create or extend routes: `backend/src/routes/{resource}.routes.ts`
5. Mount routes in `backend/src/app.ts`
6. Add types to `packages/shared-types/src/` if shared with frontend
7. Tests: `backend/tests/unit/controllers/{resource}.controller.test.ts`, `backend/tests/unit/services/{resource}.service.test.ts`

**New Database Table:**
1. Create schema: `backend/src/db/schema/{table}.schema.ts`
2. Export from barrel: `backend/src/db/schema/index.ts`
3. Generate migration: `pnpm db:generate`
4. If JSONB columns: add Zod schema to `backend/src/db/jsonb-schemas.ts`

**New AI Agent Tool:**
1. Create tool: `backend/src/tools/{tool-name}.tool.ts` (use `DynamicStructuredTool`)
2. Register in: `backend/src/tools/index.ts` (add to `renovationTools` array)
3. Test: `backend/tests/unit/tools/{tool-name}.tool.test.ts`

**New BullMQ Worker:**
1. Add job type to `JobTypes` interface in `backend/src/config/queue.ts`
2. Add worker profile to `WORKER_PROFILES` in `backend/src/config/queue.ts`
3. Add job validator to `backend/src/validators/job.validators.ts`
4. Create worker: `backend/src/workers/{name}.worker.ts` (export `startXxxWorker()`)
5. Start worker in `backend/src/server.ts` startup sequence
6. Register shutdown in `setupGracefulShutdown()`
7. Add to Bull Board in `backend/src/app.ts`

**New Frontend Page:**
1. Create page: `frontend/app/{path}/page.tsx` (server component)
2. Create client component if needed: `frontend/components/{section}/{name}.tsx`
3. Add data fetching hook if needed: `frontend/hooks/use{Name}.ts`

**New Frontend Component:**
- UI primitives: `frontend/components/ui/` (shadcn pattern)
- Chat components: `frontend/components/chat/`
- Renovation domain: `frontend/components/renovation/` (update barrel `index.ts`)
- Dashboard: `frontend/components/dashboard/`

**New Shared Type:**
1. Add to appropriate file in `packages/shared-types/src/`
2. Export from `packages/shared-types/src/index.ts`
3. Rebuild: `pnpm run build:shared-types`

## Special Directories

**`backend/drizzle/`:**
- Purpose: Database migration files managed by drizzle-kit
- Generated: Yes (via `pnpm db:generate`)
- Committed: Yes
- Subdirs: `meta/` (journal), `archive/` (old manual migrations), `rollbacks/` (auto-generated)

**`backend/dist/`:**
- Purpose: Compiled TypeScript output
- Generated: Yes (via `pnpm build`)
- Committed: No (gitignored)

**`frontend/.next/`:**
- Purpose: Next.js build output
- Generated: Yes (via `pnpm build`)
- Committed: No (gitignored)

**`packages/shared-types/dist/`:**
- Purpose: Compiled shared type declarations
- Generated: Yes (via `pnpm run build:shared-types`)
- Committed: Yes (needed for workspace resolution)

**`.planning/`:**
- Purpose: Planning documents, codebase analysis, phase plans, debug logs
- Generated: Manually by developers/AI
- Committed: Yes

---

*Structure analysis: 2026-03-01*
