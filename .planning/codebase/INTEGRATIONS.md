# External Integrations

**Analysis Date:** 2026-02-09

## APIs & External Services

**AI/ML:**
- Google Gemini AI - LangChain-based conversational AI with tool calling
  - SDK/Client: @langchain/google-genai 2.1.12, @google/generative-ai 0.24.1
  - Auth: GOOGLE_API_KEY (env var)
  - Models: gemini-2.5-flash (4 model configurations: chat, vision, structured, streaming)
  - Located: `backend/src/config/gemini.ts`

## Data Storage

**Databases:**
- PostgreSQL 15+ (primary database)
  - Connection: DATABASE_URL (env var)
  - Client: Drizzle ORM 0.38.3
  - Pool management: `backend/src/db/index.ts`
  - Schemas: 8 tables (users, sessions, rooms, messages, products, contractors, styles, assets)
  - Migrations: `backend/drizzle/` directory

**File Storage:**
- Supabase Storage (optional - Phase 2.1+)
  - Bucket: SUPABASE_STORAGE_BUCKET (default: 'room-assets')
  - Client: @supabase/supabase-js
  - Use case: User-uploaded room images for AI analysis
  - Located: `backend/src/services/asset.service.ts`

**Caching:**
- Redis 7-alpine (optional - docker-compose.yml)
  - Connection: localhost:6379 (development)
  - Use case: Session storage, rate limiting (future implementation)
  - Currently: In-memory token bucket rate limiting in `backend/src/server.ts`

**LangGraph Checkpointing:**
- PostgreSQL (conversation state persistence)
  - Mode: LANGGRAPH_CHECKPOINTER=postgres (default: memory)
  - Client: @langchain/langgraph-checkpoint-postgres 1.0.0
  - Purpose: Multi-turn conversation history and ReAct agent state
  - Located: `backend/src/services/checkpointer.service.ts`

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (optional - Phase 8+)
  - Implementation: JWT-based authentication
  - Config: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
  - Client: @supabase/supabase-js 2.90.1 (backend), 2.94.1 (frontend)
  - Middleware: `backend/src/middleware/auth.middleware.ts` - Token verification
  - SSR Support: @supabase/ssr 0.8.0 (frontend)
  - Socket.io Auth: Token-based middleware in `backend/src/server.ts` (lines 145-160)
  - User ID: Nullable in database schemas for anonymous sessions (Phases 1-7)

## Monitoring & Observability

**Error Tracking:**
- None (custom Logger class only)

**Logs:**
- Custom structured JSON logger (`backend/src/utils/logger.ts`)
- Format: Timestamp, level (DEBUG/INFO/WARN/ERROR), service name, message, metadata
- MDC pattern: Includes userId, sessionId, socketId contextual fields
- Output: console.log with JSON.stringify (container compatible)
- No external log aggregation service configured

## CI/CD & Deployment

**Hosting:**
- Frontend: Vercel
- Backend: Docker container (any container platform)
  - HTTP server (TLS termination at reverse proxy / load balancer)
  - Health endpoints: `/health`, `/health/live`, `/health/ready`, `/health/status`
  - Graceful shutdown: 10s timeout with resource cleanup

**CI Pipeline:**
- GitHub Actions
- Docker: Multi-stage builds (`backend/Dockerfile`)
- Docker Compose: `docker-compose.yml` for development environment

**Build Tools:**
- Backend: tsx (dev), tsc (production build)
- Frontend: Next.js build system (webpack/turbopack)

## Environment Configuration

**Required env vars:**
- Backend: NODE_ENV, PORT, DATABASE_URL, GOOGLE_API_KEY, FRONTEND_URL
- Frontend: NEXT_PUBLIC_API_URL, NEXT_PUBLIC_BACKEND_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY

**Secrets location:**
- Development: `.env` files (gitignored)
- Production: Environment variables injected at container runtime
- Schema validation: `backend/src/config/env.ts` with Zod

## Webhooks & Callbacks

**Incoming:**
- Socket.io events (WebSocket) - Real-time chat communication
  - `chat:join_session` - Join renovation session room
  - `chat:user_message` - User sends message to AI agent
  - Handler: `backend/src/server.ts` (lines 194-338)
  - Rate limiting: 10 tokens per 60s per socket (in-memory)

**Outgoing:**
- Socket.io events (WebSocket) - AI responses and tool events
  - `chat:session_joined` - Session join confirmation
  - `chat:message_ack` - Message receipt acknowledgment
  - `chat:assistant_token` - Streaming AI response tokens
  - `chat:tool_call` - Agent is calling a tool (e.g., save_intake_state)
  - `chat:tool_result` - Tool execution result
  - `chat:error` - Error during message processing
  - Emitted from: `backend/src/services/chat.service.ts` (StreamCallback interface)

**Stripe Webhooks (Optional - Phase 9):**
- Not yet implemented
- Config: STRIPE_WEBHOOK_SECRET (env var)
- Use case: Payment confirmation callbacks

## Real-Time Communication

**Socket.io Configuration:**
- CORS: Restricted to FRONTEND_URL with credentials
- Transport: WebSocket with polling fallback
- Settings: 60s ping timeout, 25s ping interval, 10MB max payload (for image uploads)
- Authentication: JWT token in handshake.auth.token
- Room-based: Session isolation (`session:${sessionId}`)

## LangChain Tool Integrations

**Renovation Agent Tools:**
- `getStyleExamplesTool` - Retrieve design style examples from database (`backend/src/tools/get-style-examples.tool.ts`)
- `searchProductsTool` - Search product recommendations (`backend/src/tools/search-products.tool.ts`)
- `saveIntakeStateTool` - Persist intake phase data (`backend/src/tools/save-intake-state.tool.ts`)
- `saveChecklistStateTool` - Persist checklist phase data (`backend/src/tools/save-checklist-state.tool.ts`)
- Tool binding: Model binds tools in ReAct agent (`backend/src/services/chat.service.ts` line 64)

---

*Integration audit: 2026-02-09*
