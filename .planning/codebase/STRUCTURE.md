# Codebase Structure

**Analysis Date:** 2026-02-09

## Directory Layout

```
renovation-agent-monorepo/
├── backend/                    # Express.js backend with LangChain AI
│   ├── src/
│   ├── tests/
│   ├── drizzle/               # Database migrations
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── Dockerfile
├── frontend/                   # Next.js 16 frontend with React 19
│   ├── app/                   # Next.js App Router pages
│   ├── components/            # React components (ui, chat, renovation, dashboard)
│   ├── hooks/                 # React hooks
│   ├── lib/                   # Utilities and configuration
│   ├── types/                 # TypeScript type definitions
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   └── Dockerfile
├── .planning/                  # GSD codebase analysis (this directory)
│   └── codebase/
├── package.json                # Root workspace configuration
├── pnpm-workspace.yaml
├── docker-compose.yml
├── CLAUDE.md                   # Claude Code instructions
└── README.md
```

## Directory Purposes

**backend/src/config/**
- Purpose: Application configuration and external service clients
- Contains: env.ts (Zod validation), gemini.ts (4 AI model factories), supabase.ts, prompts.ts (phase-aware system prompts)
- Key files: `env.ts` (required env vars), `gemini.ts` (createChatModel, createVisionModel, createStructuredModel, createStreamingModel)

**backend/src/controllers/**
- Purpose: HTTP request handlers (Express route logic)
- Contains: Request/response transformation, validation, service orchestration
- Key files: `message.controller.ts`, `product.controller.ts`, `style.controller.ts`

**backend/src/db/**
- Purpose: Database connection, schemas, and ORM configuration
- Contains: Drizzle ORM connection pool, 8 schema files (users, sessions, rooms, messages, products, contractors, styles, assets)
- Key files: `index.ts` (db connection pool), `schema/*.schema.ts` (table definitions with type inference)

**backend/src/middleware/**
- Purpose: Express middleware (auth, error handling, validation)
- Contains: authMiddleware, errorHandler, validation schemas
- Key files: `auth.middleware.ts` (Supabase JWT verification), `errorHandler.ts` (global error handler), `validation/` (request validation)

**backend/src/routes/**
- Purpose: Express route definitions
- Contains: 7 route files mapping HTTP methods to controllers
- Key files: `health.routes.ts` (/health endpoints), `session.routes.ts`, `message.routes.ts`, `room.routes.ts`, `style.routes.ts`, `product.routes.ts`, `asset.routes.ts`

**backend/src/services/**
- Purpose: Business logic, AI orchestration, database operations
- Contains: ChatService (ReAct agent), MessageService, RoomService, ProductService, StyleService, AssetService, CheckpointerService
- Key files: `chat.service.ts` (LangGraph ReAct agent with streaming), `message.service.ts` (message history), `checkpointer.service.ts` (conversation persistence)

**backend/src/tools/**
- Purpose: LangChain tools for ReAct agent
- Contains: 4 tool definitions with Zod input schemas
- Key files: `index.ts` (tool registry), `get-style-examples.tool.ts`, `search-products.tool.ts`, `save-intake-state.tool.ts`, `save-checklist-state.tool.ts`

**backend/src/utils/**
- Purpose: Shared utilities (logging, error handling, shutdown management)
- Contains: Logger, AppError, ShutdownManager
- Key files: `logger.ts` (structured JSON logging), `errors.ts` (custom error classes), `shutdown-manager.ts` (graceful shutdown)

**backend/tests/**
- Purpose: Vitest unit and integration tests
- Contains: `unit/` (service, controller, tool tests), `integration/` (socket.test.ts)
- Key files: `unit/services/message.service.test.ts`, `unit/services/chat.service.test.ts`, `integration/socket.test.ts`

**backend/drizzle/**
- Purpose: Database migration SQL files and metadata
- Contains: Generated migrations, snapshot metadata
- Key files: `meta/_journal.json` (migration history), `0000_*.sql` (migration files)

**frontend/app/**
- Purpose: Next.js App Router pages and layouts
- Contains: Root layout, page components, nested routes
- Key files: `page.tsx` (landing page), `app/page.tsx` (main app), `app/layout.tsx` (app shell), `test-chat/page.tsx` (chat test page)

**frontend/components/ui/**
- Purpose: shadcn/ui component library (Radix UI + Tailwind CSS)
- Contains: Reusable UI primitives (buttons, cards, badges, dialogs, inputs)
- Key files: `button.tsx`, `card.tsx`, `badge.tsx`, `input.tsx`, `separator.tsx`, `sheet.tsx`, `skeleton-loader.tsx`, `loading-state.tsx`, `theme-toggle.tsx`

**frontend/components/chat/**
- Purpose: Chat UX components (8 components for AI conversation interface)
- Contains: SuggestionBubbles, ContextChip, InlineApprovalWidget, VisualResponse, EmptyState, ToolResultRenderer
- Key files: All located in `frontend/components/chat/` directory

**frontend/components/renovation/**
- Purpose: Domain-specific renovation UI components (9 components)
- Contains: PhaseProgressBar, BudgetGauge, RoomCard, MaterialSwatch, ContractorCard, TimelineView, TrustBadge, BeforeAfterSlider, PhaseTransition
- Key files: `index.ts` (barrel exports), `phase-progress-bar.tsx`, `budget-gauge.tsx`, `room-card.tsx`

**frontend/components/dashboard/**
- Purpose: Dashboard layout components (future implementation)
- Contains: Currently unspecified

**frontend/components/providers/**
- Purpose: React context providers
- Contains: QueryProvider (TanStack Query), ThemeProvider (next-themes)
- Key files: Located in `frontend/components/providers/`

**frontend/hooks/**
- Purpose: Custom React hooks
- Contains: useChat (Socket.io hook), useIntersectionObserver (viewport detection)
- Key files: `useChat.ts` (WebSocket communication), `useIntersectionObserver.ts`

**frontend/lib/**
- Purpose: Utilities, configuration, and shared logic
- Contains: design-tokens.ts (phase config), fonts.ts (font loading), supabase/ (Supabase client)
- Key files: `design-tokens.ts` (PHASE_CONFIG, PHASE_INDEX), `fonts.ts` (fontVariables), `utils.ts` (cn helper), `supabase/` (client/server)

**frontend/types/**
- Purpose: TypeScript type definitions
- Contains: chat.ts (Message, ChatState), renovation.ts (SessionSummary, RoomSummary)
- Key files: `chat.ts`, `renovation.ts`

## Key File Locations

**Entry Points:**
- `backend/src/server.ts`: Backend HTTP + Socket.io server startup
- `backend/src/app.ts`: Express application factory (routes, middleware)
- `frontend/app/page.tsx`: Public landing page
- `frontend/app/app/page.tsx`: Main application page

**Configuration:**
- `backend/src/config/env.ts`: Environment variable validation (Zod schema)
- `backend/tsconfig.json`: Backend TypeScript config (ESNext, NodeNext, strict)
- `frontend/tsconfig.json`: Frontend TypeScript config (ESNext, bundler, strict)
- `frontend/tailwind.config.ts`: Tailwind CSS with design tokens (52 custom colors, 4 font families)
- `backend/drizzle.config.ts`: Drizzle ORM migration config
- `docker-compose.yml`: Development environment (PostgreSQL, frontend, backend, Redis)

**Core Logic:**
- `backend/src/services/chat.service.ts`: LangGraph ReAct agent with streaming (323 lines)
- `backend/src/services/message.service.ts`: Message persistence and history
- `backend/src/db/index.ts`: PostgreSQL connection pool (Drizzle)
- `frontend/hooks/useChat.ts`: Socket.io client hook for real-time chat

**Testing:**
- `backend/vitest.config.ts`: Vitest config (80% coverage thresholds)
- `backend/tests/unit/services/message.service.test.ts`: Example unit test (Vitest + mocks)
- `backend/tests/integration/socket.test.ts`: Socket.io integration test

## Naming Conventions

**Files:**
- Backend: `kebab-case.ts` (e.g., `chat.service.ts`, `auth.middleware.ts`)
- Frontend components: `kebab-case.tsx` (e.g., `phase-progress-bar.tsx`)
- Tests: `*.test.ts` (co-located or in `tests/` directory)
- Schemas: `*.schema.ts` (Drizzle table definitions)
- Routes: `*.routes.ts` (Express route modules)
- Tools: `*.tool.ts` (LangChain tool definitions)

**Directories:**
- Backend: `lowercase` (e.g., `services`, `controllers`, `middleware`)
- Frontend: `lowercase` (e.g., `components`, `hooks`, `lib`)

## Where to Add New Code

**New Backend Service:**
- Implementation: `backend/src/services/[feature].service.ts`
- Tests: `backend/tests/unit/services/[feature].service.test.ts`
- Database schema (if needed): `backend/src/db/schema/[feature].schema.ts`

**New Backend API Endpoint:**
- Route: `backend/src/routes/[resource].routes.ts`
- Controller: `backend/src/controllers/[resource].controller.ts`
- Service: Use existing or create in `backend/src/services/`
- Register in: `backend/src/app.ts` (add `app.use()` line)

**New LangChain Tool:**
- Implementation: `backend/src/tools/[tool-name].tool.ts`
- Export: Add to `backend/src/tools/index.ts` → `renovationTools` array
- Test: `backend/tests/unit/tools/[tool-name].tool.test.ts`

**New Frontend Component:**
- UI primitive: `frontend/components/ui/[component].tsx` (shadcn/ui pattern)
- Domain component: `frontend/components/renovation/[component].tsx` (export in `index.ts`)
- Chat component: `frontend/components/chat/[component].tsx`
- Dashboard component: `frontend/components/dashboard/[component].tsx`

**New Frontend Page:**
- Public route: `frontend/app/[route]/page.tsx`
- App route: `frontend/app/app/[route]/page.tsx`
- Layout (if needed): `frontend/app/[route]/layout.tsx`

**New Frontend Hook:**
- Implementation: `frontend/hooks/use[HookName].ts` (camelCase after 'use' prefix)

**Utilities:**
- Backend utilities: `backend/src/utils/[utility].ts`
- Frontend utilities: `frontend/lib/[utility].ts`

**Database Migration:**
- Generate: `npm run db:generate` (creates SQL in `backend/drizzle/`)
- Run: `npm run db:migrate`
- Schema: Edit `backend/src/db/schema/*.schema.ts` first

## Special Directories

**backend/drizzle/**
- Purpose: Database migration files (SQL) and metadata (JSON)
- Generated: Yes (via drizzle-kit generate)
- Committed: Yes (migrations tracked in version control)

**backend/dist/**
- Purpose: Compiled JavaScript output (TypeScript → JS)
- Generated: Yes (via tsc)
- Committed: No (gitignored)

**frontend/.next/**
- Purpose: Next.js build output and cache
- Generated: Yes (via next build)
- Committed: No (gitignored)

**node_modules/**
- Purpose: pnpm dependencies (workspace hoisting)
- Generated: Yes (via pnpm install)
- Committed: No (gitignored)

**.planning/**
- Purpose: GSD codebase analysis documents
- Generated: Yes (by GSD commands like /gsd:map-codebase)
- Committed: Yes (for GSD context)

---

*Structure analysis: 2026-02-09*
