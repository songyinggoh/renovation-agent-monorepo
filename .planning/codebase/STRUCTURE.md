# Codebase Structure

**Analysis Date:** 2026-04-17

## Directory Layout

```
renovation-agent-monorepo/
├── backend/                    # Express.js API + Socket.io + AI agent
│   ├── src/
│   │   ├── app.ts              # Express app factory (middleware + routes)
│   │   ├── server.ts           # HTTP + Socket.io server startup
│   │   ├── config/             # External service clients + env validation
│   │   ├── controllers/        # HTTP request handlers
│   │   ├── db/                 # Drizzle ORM instance + schema definitions
│   │   ├── dev-agents/         # LangGraph multi-agent dev tooling (not product)
│   │   ├── emails/             # Email templates
│   │   ├── middleware/         # Express + Socket.io middleware
│   │   ├── routes/             # Express Router definitions
│   │   ├── services/           # Business logic + external API calls
│   │   ├── tools/              # LangGraph agent tool implementations
│   │   ├── types/              # TypeScript type declarations
│   │   ├── utils/              # Logger, errors, shutdown, tracing helpers
│   │   ├── validators/         # Zod schemas for requests + socket payloads
│   │   └── workers/            # BullMQ background job processors
│   ├── drizzle/                # SQL migration files + drizzle-kit journal
│   ├── load-tests/             # k6 load test scripts
│   ├── scripts/                # Utility scripts (seed, check DB, migration safety)
│   ├── templates/              # Handlebars HTML templates for PDF generation
│   ├── tests/                  # Integration + unit tests
│   ├── drizzle.config.ts       # Drizzle-kit config
│   ├── tsconfig.json
│   └── package.json
├── frontend/                   # Next.js 16 App Router frontend
│   ├── app/                    # Next.js pages + layouts (App Router)
│   │   ├── layout.tsx          # Root layout (ThemeProvider, QueryProvider)
│   │   ├── page.tsx            # Landing page
│   │   ├── app/                # Authenticated app section
│   │   │   ├── layout.tsx      # App layout
│   │   │   ├── page.tsx        # Dashboard (session list)
│   │   │   └── session/[sessionId]/page.tsx  # Session chat page
│   │   └── auth/callback/      # Supabase OAuth callback route
│   ├── components/
│   │   ├── chat/               # Chat UI components
│   │   ├── dashboard/          # Session list + create button
│   │   ├── payment/            # Payment panel
│   │   ├── providers/          # QueryProvider, ThemeProvider
│   │   ├── renovation/         # Domain components (renders, budgets, rooms, etc.)
│   │   ├── session/            # Session page client + sidebar
│   │   └── ui/                 # shadcn/ui primitive components
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities (API client, design tokens, fonts, logger)
│   ├── types/                  # Frontend-specific TypeScript types
│   ├── __tests__/              # Vitest unit tests
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
├── packages/
│   └── shared-types/           # @renovation/shared-types — Socket.io event types + domain constants
│       └── src/
│           ├── index.ts        # Barrel exports
│           ├── socket-events.ts# ClientToServerEvents, ServerToClientEvents
│           ├── phases.ts       # RenovationPhase, RENOVATION_PHASES
│           ├── assets.ts       # Asset type constants
│           ├── messages.ts     # Message role/type constants
│           ├── session.ts      # SessionStylePreferences, RoomSummary
│           └── constants.ts    # PRODUCT_CATEGORIES, ROOM_TYPES, etc.
├── e2e/                        # Playwright end-to-end tests
├── .github/workflows/          # CI/CD pipelines (13 workflow files)
├── .planning/                  # Project planning, research, phase docs
├── docker-compose.yml          # Dev stack: PostgreSQL 15, Redis 7, frontend, backend
├── pnpm-workspace.yaml
└── package.json                # Monorepo root (pnpm scripts, husky, lint-staged)
```

## Directory Purposes

**`backend/src/config/`:**
- Purpose: All external service clients and app-wide configuration
- Contains: `env.ts` (Zod schema + singleton), `gemini.ts` (model factories), `stripe.ts`, `supabase.ts`, `redis.ts`, `queue.ts`, `sentry.ts`, `telemetry.ts`, `email.ts`, `claude.ts`, `prompts.ts`, `dead-letter.ts`
- Key files: `env.ts` is the single source of truth for all environment variables and feature-gate functions

**`backend/src/db/schema/`:**
- Purpose: Drizzle table definitions — one file per domain table
- Key files: `sessions.schema.ts`, `rooms.schema.ts`, `assets.schema.ts`, `messages.schema.ts`, `users.schema.ts`, `products.schema.ts`, `contractors.schema.ts`, `styles.schema.ts`, `style-images.schema.ts`, `asset-variants.schema.ts`, `document-artifacts.schema.ts`, `products-catalog.schema.ts`
- All exported through `backend/src/db/schema/index.ts` barrel

**`backend/src/tools/`:**
- Purpose: LangGraph tool implementations — the AI agent's action set
- All tools registered in `backend/src/tools/index.ts` as `renovationTools` array
- Each tool file exports a single structured tool with Zod input schema

**`backend/src/dev-agents/`:**
- Purpose: Internal developer AI tooling (not end-user product)
- Contains: supervisor, 6 specialist agents (scaffold, migration, test, review, research, implement), tools (bash, file-ops, git, search)
- Entry: `cli.ts` and `cli-workflow.ts` (invoked via `npm run dev:agent` / `dev:workflow`)

**`backend/drizzle/`:**
- Purpose: Migration SQL files and drizzle-kit journal
- Managed exclusively by `drizzle-kit generate` and `drizzle-kit migrate`
- Do NOT edit migration files manually after they are committed

**`backend/scripts/`:**
- Purpose: One-off utility scripts run with `tsx`
- Contains: seed scripts, DB check scripts, migration safety analysis/rollback tools

**`backend/templates/`:**
- Purpose: Handlebars templates for Puppeteer PDF generation
- Contains: `checklist.hbs`, `renovation-plan.hbs`, `partials/print-styles.hbs`

**`frontend/app/`:**
- Purpose: Next.js App Router pages — server components by default
- Structure mirrors URL hierarchy; client components marked with `'use client'` directive
- `layout.tsx` files add persistent UI wrappers (header, providers) at each level

**`frontend/components/chat/`:**
- Purpose: All chat UI components
- Key files: `chat-view.tsx` (container), `chat-input.tsx`, `message-list.tsx`, `suggestion-bubbles.tsx`, `inline-approval-widget.tsx`, `empty-state.tsx`, `visual-response.tsx`, `tool-result-renderer.tsx`, `context-chip.tsx`, `file-upload-zone.tsx`

**`frontend/components/renovation/`:**
- Purpose: Domain-specific display components
- Key files: `phase-progress-bar.tsx`, `budget-gauge.tsx`, `room-card.tsx`, `render-card.tsx`, `render-gallery.tsx`, `before-after-slider.tsx`, `document-card.tsx`, `document-list.tsx`, `comparison-dialog.tsx`
- All exported via `frontend/components/renovation/index.ts` barrel

**`frontend/components/ui/`:**
- Purpose: shadcn/ui primitive components
- Key files: `button.tsx`, `badge.tsx`, `card.tsx`, `input.tsx`, `sheet.tsx`, `separator.tsx`, `skeleton-loader.tsx`, `loading-state.tsx`, `theme-toggle.tsx`

**`frontend/hooks/`:**
- Purpose: Custom React hooks for data fetching and real-time state
- Key files: `useChat.ts` (Socket.io), `useSocketQuerySync.ts` (event→cache bridge), `useRenderState.ts` (in-flight renders), `useSession.ts`, `useSessionRooms.ts`, `useRoomRenders.ts`, `useDocuments.ts`, `usePayment.ts`, `useFileUpload.ts`, `useAssetProcessingState.ts`, `useRequestRender.ts`

**`frontend/lib/`:**
- Purpose: Shared utilities and configuration
- Key files: `design-tokens.ts` (phase config, `RenovationPhase`, `PHASE_CONFIG`, `PHASE_INDEX`), `fonts.ts` (font variables), `api.ts` (`fetchWithAuth`), `api-mappers.ts` (response → UI type mapping), `logger.ts` (frontend logger), `supabase/client.ts`, `supabase/server.ts`

**`packages/shared-types/src/`:**
- Purpose: Shared TypeScript types consumed by both frontend and backend
- Build required before either workspace: `pnpm run build:shared-types`
- Referenced as `@renovation/shared-types` workspace dependency

## Key File Locations

**Entry Points:**
- `backend/src/server.ts` — backend process entry (OTel init, all startup logic)
- `backend/src/app.ts` — Express app factory (imported by server.ts and tests)
- `frontend/app/layout.tsx` — frontend root layout
- `frontend/app/app/session/[sessionId]/page.tsx` — session chat page (server component shell)
- `frontend/components/session/session-page-client.tsx` — session page client component (all hooks wired here)

**Configuration:**
- `backend/src/config/env.ts` — all env vars, feature gates
- `backend/src/config/gemini.ts` — AI model factories
- `backend/src/config/queue.ts` — BullMQ queue + worker factory + job type definitions
- `backend/src/config/prompts.ts` — system prompt for the AI agent
- `frontend/lib/design-tokens.ts` — phase constants, `PHASE_CONFIG`, `PHASE_INDEX`
- `frontend/lib/fonts.ts` — font variable exports for root layout

**Core Logic:**
- `backend/src/services/chat.service.ts` — ReAct agent, LangGraph StateGraph
- `backend/src/tools/index.ts` — `renovationTools` array (all agent tools)
- `backend/src/utils/errors.ts` — `AppError`, `NotFoundError`, `BadRequestError`, `ConflictError`
- `backend/src/utils/logger.ts` — structured JSON logger (use everywhere, never console.log)
- `backend/src/middleware/auth.middleware.ts` — `optionalAuthMiddleware`, `authMiddleware`, `verifyToken`
- `backend/src/middleware/ownership.middleware.ts` — `verifySessionOwnership`
- `packages/shared-types/src/socket-events.ts` — all Socket.io event payload types

**Schema:**
- `backend/src/db/schema/index.ts` — barrel re-exports all table definitions
- `backend/src/db/schema/sessions.schema.ts` — `renovationSessions` table + phase enum
- `backend/drizzle/` — migration SQL files managed by drizzle-kit

**Testing:**
- `backend/tests/unit/` — Vitest unit tests
- `backend/tests/integration/` — integration tests (with testcontainers or test DB)
- `backend/src/__tests__/` — additional unit tests co-located with source
- `frontend/__tests__/` — Vitest + Testing Library component and hook tests
- `e2e/` — Playwright end-to-end tests

## Naming Conventions

**Files:**
- Backend services: `[domain].service.ts` (e.g. `render.service.ts`)
- Backend routes: `[domain].routes.ts`
- Backend controllers: `[domain].controller.ts`
- Backend workers: `[domain].worker.ts`
- Backend tools: `[action]-[noun].tool.ts` (e.g. `generate-render.tool.ts`)
- Backend schemas: `[domain].schema.ts`
- Backend validators: `[domain].validators.ts`
- Frontend components: `kebab-case.tsx` (e.g. `chat-input.tsx`)
- Frontend hooks: `use[PascalCase].ts` (e.g. `useRenderState.ts`)
- Frontend pages: `page.tsx`, layouts: `layout.tsx`, errors: `error.tsx`, loading: `loading.tsx`

**Directories:**
- Backend: plural nouns matching layer names (`services/`, `routes/`, `controllers/`, `workers/`, `tools/`)
- Frontend components: organized by domain (`chat/`, `renovation/`, `session/`, `payment/`, `ui/`)

## Where to Add New Code

**New API endpoint:**
1. Schema (if new table): `backend/src/db/schema/[domain].schema.ts`, add export to `backend/src/db/schema/index.ts`
2. Migration: `pnpm run db:generate` → review `backend/drizzle/`
3. Validator: `backend/src/validators/[domain].validators.ts`
4. Service: `backend/src/services/[domain].service.ts`
5. Controller: `backend/src/controllers/[domain].controller.ts`
6. Route: `backend/src/routes/[domain].routes.ts`
7. Mount route in `backend/src/app.ts`

**New agent tool:**
1. Implement: `backend/src/tools/[action]-[noun].tool.ts` — export a LangChain `StructuredTool` with Zod schema
2. Register: add to `renovationTools` array in `backend/src/tools/index.ts`

**New BullMQ job type:**
1. Add job type to `JobTypes` interface in `backend/src/config/queue.ts`
2. Add `WorkerProfile` entry to `WORKER_PROFILES`
3. Add lazy queue getter function
4. Create worker in `backend/src/workers/[domain].worker.ts`
5. Start worker in `backend/src/server.ts` startup sequence

**New frontend page:**
- Location: `frontend/app/[path]/page.tsx` (server component by default)
- Add `'use client'` directive if it needs hooks/state; otherwise keep as server component

**New frontend component:**
- Domain component: `frontend/components/[domain]/[name].tsx`
- UI primitive: `frontend/components/ui/[name].tsx` (shadcn/ui pattern)
- Add to barrel export if the directory has an `index.ts`

**New frontend hook:**
- Location: `frontend/hooks/use[Name].ts`
- Use TanStack Query (`useQuery`, `useMutation`) for server data
- Use `useChat` socketRef for Socket.io event subscriptions

**New shared type:**
- Add to appropriate file in `packages/shared-types/src/`
- Export from `packages/shared-types/src/index.ts`
- Run `pnpm run build:shared-types` before using

**Utilities:**
- Backend shared helpers: `backend/src/utils/`
- Frontend shared helpers: `frontend/lib/`

## Special Directories

**`backend/drizzle/`:**
- Purpose: SQL migration files + drizzle-kit snapshot journal
- Generated: Yes (by `drizzle-kit generate`)
- Committed: Yes — do not edit migration files after committing

**`backend/drizzle/archive/manual-0007-0012/`:**
- Purpose: Historical manual migration reference only
- Generated: No
- Committed: Yes — read-only archive

**`packages/shared-types/dist/`:**
- Purpose: Compiled shared types output
- Generated: Yes (by `tsc` in `packages/shared-types/`)
- Committed: No (in `.gitignore`)
- Required: Must be built before running backend or frontend

**`frontend/.next/`:**
- Purpose: Next.js build cache and output
- Generated: Yes
- Committed: No

**`backend/dist/`:**
- Purpose: Compiled backend TypeScript output
- Generated: Yes (by `tsc`)
- Committed: No

**`.planning/`:**
- Purpose: Project planning documents, research, phase summaries, codebase analysis
- Generated: No (human/AI authored)
- Committed: Yes

**`.claude/`:**
- Purpose: Claude Code configuration, skills, agent memory, progress trackers
- Generated: Partially (agent memory, progress files)
- Committed: Partially (skills and config committed; worktrees gitignored)

---

*Structure analysis: 2026-04-17*
