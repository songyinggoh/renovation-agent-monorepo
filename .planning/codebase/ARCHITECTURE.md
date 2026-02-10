# Architecture

**Analysis Date:** 2026-02-09

## Pattern Overview

**Overall:** Monorepo with separate frontend (Next.js SSR/SSG) and backend (Express REST API + Socket.io) communicating via HTTP/WebSocket

**Key Characteristics:**
- **Separation of concerns**: Frontend and backend are independent deployable units
- **Real-time first**: Socket.io for bidirectional streaming chat with LangChain ReAct agent
- **Phase-driven workflow**: 7-phase renovation flow (INTAKE → CHECKLIST → PLAN → RENDER → PAYMENT → COMPLETE → ITERATE)
- **Tool-augmented AI**: LangGraph StateGraph with tool calling for structured data persistence
- **Type-safe data flow**: Zod validation at API boundaries, Drizzle ORM for database, TypeScript strict mode

## Layers

**Frontend (Next.js App Router):**
- Purpose: Customer-facing UI with Server Components and real-time chat
- Location: `frontend/`
- Contains: React components, API routes (App Router), TanStack Query for data fetching, Socket.io client
- Depends on: Backend API (HTTP), Backend Socket.io (WebSocket), Supabase Auth (optional)
- Used by: End users (web browsers)
- Entry point: `frontend/app/page.tsx` (landing), `frontend/app/app/page.tsx` (main app)

**Backend API (Express + Socket.io):**
- Purpose: RESTful API, real-time WebSocket server, LangChain orchestration
- Location: `backend/src/`
- Contains: Express routes, controllers, services, middleware, Socket.io handlers
- Depends on: PostgreSQL (Drizzle ORM), Gemini AI (LangChain), Supabase (optional auth/storage)
- Used by: Frontend, external integrations (future)
- Entry point: `backend/src/server.ts` (bootstraps HTTP + Socket.io)

**Service Layer:**
- Purpose: Business logic, AI agent orchestration, database operations
- Location: `backend/src/services/`
- Contains: ChatService (ReAct agent), MessageService, RoomService, ProductService, StyleService, AssetService, CheckpointerService
- Depends on: Database (Drizzle), AI models (LangChain), Tools
- Used by: Controllers, Socket.io handlers

**Data Layer:**
- Purpose: PostgreSQL database with Drizzle ORM for type-safe queries
- Location: `backend/src/db/`
- Contains: Connection pool (`index.ts`), schemas (8 tables), migrations (`backend/drizzle/`)
- Depends on: PostgreSQL instance
- Used by: Services

**Tool Layer:**
- Purpose: LangChain tools for ReAct agent to persist structured data
- Location: `backend/src/tools/`
- Contains: 4 tools (get-style-examples, search-products, save-intake-state, save-checklist-state)
- Depends on: Services (RoomService, ProductService, StyleService)
- Used by: ChatService (bound to Gemini model)

## Data Flow

**HTTP Request Flow (REST API):**

1. Express receives HTTP request → Request logging middleware → CORS middleware
2. Route handler matches path → Controller receives request
3. Controller calls Service layer (business logic + database queries)
4. Service uses Drizzle ORM to query PostgreSQL
5. Service returns data → Controller formats response → Express sends JSON

**WebSocket Chat Flow (Real-Time AI Conversation):**

1. Frontend Socket.io client connects with JWT token → Auth middleware verifies token
2. Client emits `chat:join_session` → Server joins socket to room (`session:${sessionId}`)
3. Client emits `chat:user_message` → Rate limiter checks (10 msgs/60s)
4. ChatService.processMessage() is called:
   - Save user message to database (MessageService)
   - Fetch session phase from database
   - Generate phase-aware system prompt
   - Load last 20 messages for context
   - Build LangChain message array (SystemMessage + history + HumanMessage)
5. ReAct agent executes (LangGraph StateGraph):
   - Model invoked with bound tools → Stream tokens to client via `chat:assistant_token`
   - If model requests tool call → Emit `chat:tool_call` → ToolNode executes → Emit `chat:tool_result`
   - Loop continues until model returns final text response
6. Save assistant message to database → Emit `chat:assistant_token` with done: true

**State Management:**
- Frontend: TanStack Query for server cache, React state for UI
- Backend: LangGraph checkpointer for conversation state (PostgreSQL or memory)
- Database: Sessions table tracks phase progression

## Key Abstractions

**RenovationSession:**
- Purpose: Represents a single renovation project lifecycle
- Examples: `backend/src/db/schema/sessions.schema.ts`
- Pattern: Central aggregate root with nullable userId (for anonymous sessions in Phases 1-7)
- Fields: id, userId, title, phase, totalBudget, currency, isPaid, stripePaymentIntentId

**ChatService (ReAct Agent):**
- Purpose: Orchestrates LangChain ReAct agent with streaming and tool calling
- Examples: `backend/src/services/chat.service.ts`
- Pattern: StateGraph with MessagesAnnotation, ToolNode, conditional edges
- Methods: processMessage(sessionId, userMessage, callback) → streams response via callbacks

**PhaseConfig:**
- Purpose: Configuration object for 7 renovation phases
- Examples: `frontend/lib/design-tokens.ts`
- Pattern: Strongly typed constants with PHASE_CONFIG record, PHASE_INDEX mapping
- Used by: Phase-aware UI components, backend system prompts

**StreamCallback:**
- Purpose: Interface for real-time event streaming from AI agent to Socket.io
- Examples: `backend/src/services/chat.service.ts` (lines 29-35)
- Pattern: Observer pattern with onToken, onComplete, onError, onToolCall, onToolResult
- Used by: Socket.io connection handler to emit events to client

## Entry Points

**Backend Server:**
- Location: `backend/src/server.ts`
- Triggers: `npm run dev` (tsx watch) or `npm start` (node dist/server.js)
- Responsibilities: Startup sequence (DB validation → Gemini validation → Express app → HTTP server → Socket.io → graceful shutdown setup)

**Frontend Application:**
- Location: `frontend/app/page.tsx` (public landing), `frontend/app/app/page.tsx` (authenticated app)
- Triggers: User navigates to URL, Next.js handles routing
- Responsibilities: Server-side rendering, hydration, client-side navigation

**Socket.io Connection Handler:**
- Location: `backend/src/server.ts` (line 194)
- Triggers: Client WebSocket connection with JWT token
- Responsibilities: Auth verification, session joining, message handling, rate limiting, AI response streaming

## Error Handling

**Strategy:** Centralized error handling with custom error classes and structured logging

**Patterns:**
- **AppError class**: Custom error with statusCode (`backend/src/utils/errors.ts`)
- **Global error middleware**: Catches all Express errors, distinguishes AppError vs unexpected errors (`backend/src/middleware/errorHandler.ts`)
- **Structured Logger**: JSON logs with error stack traces, metadata context (`backend/src/utils/logger.ts`)
- **Socket.io errors**: Emit `chat:error` event to client with user-friendly message, log full error server-side
- **Graceful shutdown**: ShutdownManager handles SIGTERM/SIGINT with resource cleanup (Socket.io → Database → LangGraph checkpointer) (`backend/src/utils/shutdown-manager.ts`)

**Error Flow:**
1. Error thrown in service/controller
2. If Express route: Error middleware catches → Logs → Returns appropriate HTTP status
3. If Socket.io handler: try/catch → Emit chat:error → Log error with metadata
4. If startup error: Log fatal error → Exit process (container orchestrator restarts)

## Cross-Cutting Concerns

**Logging:** Custom Logger class with JSON structured output, MDC pattern (serviceName, userId, sessionId, socketId). Used consistently across all modules. Located: `backend/src/utils/logger.ts`

**Validation:** Zod schemas at API boundaries (env config, request bodies), Drizzle ORM for database type safety, class-validator for DTOs (imported but not heavily used yet). Located: `backend/src/config/env.ts`, `backend/src/middleware/validation/`

**Authentication:** Supabase JWT verification middleware for HTTP routes and Socket.io connections. Optional in Phases 1-7 (userId nullable). Located: `backend/src/middleware/auth.middleware.ts`, Socket.io auth middleware in `backend/src/server.ts` (lines 145-160)

**Rate Limiting:** In-memory token bucket per socket (10 tokens, 60s refill). Located: `backend/src/server.ts` (lines 165-191). Future: Redis-backed rate limiting for distributed systems.

**CORS:** Configured to allow FRONTEND_URL with credentials. Located: `backend/src/app.ts` (lines 39-46)

**Graceful Shutdown:** ShutdownManager with per-resource cleanup and timeouts. Handles SIGTERM/SIGINT for Kubernetes deployments. Located: `backend/src/utils/shutdown-manager.ts`

---

*Architecture analysis: 2026-02-09*
