# Backend Implementation Plan
**Project**: Renovation Agent Monorepo - Backend Setup
**Created**: 2026-01-06
**Updated**: 2026-01-06
**Status**: Ready for Implementation

---

## Plan Overview

This implementation plan breaks down the backend setup into **10 phases**, prioritizing **core functionality first** (agent, chat, services) before adding authentication and payment layers. The plan follows the architecture specifications from the research document and adheres to all development rules.

**Strategy**: Build the core agent and chat functionality first to validate the concept, then layer in authentication and payments.

**Estimated Timeline**: 6-8 weeks (full-time development)

---

## Phase Execution Strategy

### Principles
1. **Core First**: Agent and chat functionality take priority over auth/payments
2. **Test-Driven Development**: Write tests before implementation
3. **Incremental Delivery**: Each phase should produce working, testable code
4. **Type Safety First**: Zero `any` types, strict TypeScript
5. **Continuous Integration**: Run linters and tests after each task
6. **Documentation**: Update docs as you implement

### Progress Tracking Legend
- 🔴 **Not Started** - Task hasn't been touched
- 🟡 **In Progress** - Currently being worked on
- 🟢 **Completed** - Implemented, tested, and documented
- ⏸️ **Blocked** - Waiting on dependencies or external factors

---

## Phase 1: Database & Core Infrastructure Setup

**Goal**: Setup database schema, migrations, and core configuration (auth/payments optional for now)
**Duration**: 1 week
**Priority**: Critical (Blocks all other phases)

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1.1 | Update `package.json` with core dependencies | 🔴 | Start with DB, LangChain, Express; Stripe/Supabase Auth later |
| 1.2 | Create `.env.example` file | 🔴 | Template with all vars (mark auth/stripe optional for now) |
| 1.3 | Implement `src/config/env.ts` with Zod validation | 🔴 | Make Stripe/Supabase keys optional initially |
| 1.4 | Create database schema files in `src/db/schema/` | 🔴 | users, sessions, products, messages, contractors |
| 1.5 | Update `drizzle.config.ts` to point to new schema | 🔴 | Reference `src/db/schema/index.ts` |
| 1.6 | Generate initial Drizzle migrations | 🔴 | Run `npm run db:generate` |
| 1.7 | Apply migrations to Supabase database | 🔴 | Run `npm run db:migrate` |
| 1.8 | Implement `src/config/gemini.ts` | 🔴 | Gemini model factory (PRIORITY) |
| 1.9 | Implement `src/db/index.ts` | 🔴 | Database connection with pooling |
| 1.10 | Write unit tests for config modules | 🔴 | Test env validation edge cases |
| 1.11 | Update `src/app.ts` with basic setup | 🔴 | CORS, body parsing (no auth middleware yet) |
| 1.12 | Create `src/server.ts` with Socket.io | 🔴 | HTTP + WebSocket server (no auth yet) |
| 1.13 | Implement health check endpoint | 🔴 | GET /health returns status |
| 1.14 | Implement ShutdownManager utility class | 🔴 | `src/utils/shutdown-manager.ts` - graceful shutdown |
| 1.15 | Enhance startup validation sequence | 🔴 | Database + Gemini check in `server.ts` |
| 1.16 | Expand health check routes | 🔴 | Add `/health/live`, `/health/ready`, `/health/status` |
| 1.17 | Add server error handler for port conflicts | 🔴 | Handle EADDRINUSE in `server.ts` |

### Dependencies
- Supabase project created (for database only, not auth yet)
- Google Gemini API key obtained

### Acceptance Criteria
- [ ] All core dependencies installed (`npm install` succeeds)
- [ ] Environment validation passes with required vars (auth/stripe optional)
- [ ] Database migrations run successfully on Supabase
- [ ] All tables created with correct schema
- [ ] Gemini config exports working model factory
- [ ] Server starts without errors
- [ ] Health check endpoint returns 200
- [ ] ShutdownManager handles graceful shutdown (SIGTERM, SIGINT, SIGQUIT)
- [ ] Startup validation fails fast on missing dependencies
- [ ] Health checks support liveness/readiness probes
- [ ] Port conflict errors show helpful messages

### Testing Checklist
- [ ] Unit tests for `env.ts` validation
- [ ] Database connection test (can query tables)
- [ ] Gemini model factory returns valid model
- [ ] Health endpoint responds correctly
- [ ] Test graceful shutdown with SIGTERM signal
- [ ] Verify ShutdownManager prevents duplicate shutdowns
- [ ] Test health check routes return correct status codes

### Notes
**🎯 Focus**: Get database and server infrastructure working. Skip Supabase Auth and Stripe setup for now - we'll add those in Phase 8-9.

**Production Patterns**: ShutdownManager and enhanced health checks based on production-patterns-research.md

---

## Phase 2: Database Models & DTOs

**Goal**: Implement all data access models and DTOs with validation
**Duration**: 4-5 days
**Priority**: Critical (Required for services)

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 2.1 | Create DTOs in `src/dtos/session.dto.ts` | 🔴 | CreateSession, UpdateSession |
| 2.2 | Create DTOs in `src/dtos/chat.dto.ts` | 🔴 | ChatMessage, ChatResponse |
| 2.3 | Create DTOs in `src/dtos/product.dto.ts` | 🔴 | ProductSearch, ProductRecommendation |
| 2.4 | Create DTOs in `src/dtos/contractor.dto.ts` | 🔴 | ContractorSearch, ContractorLead |
| 2.5 | Implement `src/models/session.model.ts` | 🔴 | Session CRUD operations |
| 2.6 | Implement `src/models/room.model.ts` | 🔴 | Room CRUD operations |
| 2.7 | Implement `src/models/product.model.ts` | 🔴 | Product queries |
| 2.8 | Implement `src/models/message.model.ts` | 🔴 | Chat message persistence |
| 2.9 | Implement `src/models/contractor.model.ts` | 🔴 | Contractor queries |
| 2.10 | Implement `src/models/user.model.ts` | 🔴 | Basic user operations (no auth yet) |
| 2.11 | Add Zod schemas for all DTOs | 🔴 | Type-safe validation |
| 2.12 | Write unit tests for models | 🔴 | Mock database queries |
| 2.13 | Write integration tests for models | 🔴 | Use Testcontainers for real DB |

### Dependencies
- Phase 1 completed (Database schema)

### Acceptance Criteria
- [ ] All DTOs have Zod schemas
- [ ] All models use Drizzle ORM correctly
- [ ] No `any` types in models or DTOs
- [ ] Error handling follows development rules
- [ ] Logging follows structured format
- [ ] All tests pass with >80% coverage

### Testing Checklist
- [ ] Test DTO validation (valid and invalid inputs)
- [ ] Test model CRUD operations
- [ ] Test model error handling (e.g., foreign key violations)
- [ ] Test query filters and pagination

### Notes
**🎯 Focus**: Build the data access layer. User model exists but doesn't require authentication yet - we'll add that in Phase 8.

---

## Phase 3: Domain Services

**Goal**: Implement business logic services (Product, Contractor, File, PDF, Chat)
**Duration**: 1 week
**Priority**: Critical (Required for agent tools)

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 3.1 | Implement `src/services/product.service.ts` | 🔴 | Search, recommendations |
| 3.2 | Implement `src/services/contractor.service.ts` | 🔴 | Search, create leads |
| 3.3 | Implement `src/services/file.service.ts` | 🔴 | Supabase Storage upload/download |
| 3.4 | Implement `src/services/pdf.service.ts` | 🔴 | PDF report generation |
| 3.5 | Implement `src/services/render.service.ts` | 🔴 | Nano Banana image generation |
| 3.6 | Implement `src/services/intake.service.ts` | 🔴 | Session creation, file uploads |
| 3.7 | Implement `src/services/session.service.ts` | 🔴 | Session management logic |
| 3.8 | Write unit tests for ProductService | 🔴 | Mock database |
| 3.9 | Write unit tests for ContractorService | 🔴 | Mock database |
| 3.10 | Write unit tests for FileService | 🔴 | Mock Supabase Storage |
| 3.11 | Write unit tests for PDFService | 🔴 | Mock PDF library |
| 3.12 | Write unit tests for RenderService | 🔴 | Mock Gemini API |
| 3.13 | Write integration tests for services | 🔴 | Real database, mock external APIs |

### Dependencies
- Phase 2 completed (Models & DTOs)
- Supabase Storage bucket created
- Supabase Storage bucket created for renders (optional for now)

### Acceptance Criteria
- [ ] ProductService can search Taobao products
- [ ] ContractorService can search and create leads
- [ ] FileService can upload to Supabase Storage
- [ ] PDFService can generate reports (mock data)
- [ ] RenderService can call Nano Banana API
- [ ] SessionService handles session lifecycle
- [ ] All services follow error handling rules
- [ ] All services use structured logging
- [ ] All tests pass with >80% coverage

### Testing Checklist
- [ ] Test product search with various filters
- [ ] Test contractor search and lead creation
- [ ] Test file upload and download
- [ ] Test PDF generation with sample data
- [ ] Test render service with mock API
- [ ] Test session creation and updates

### Notes
**🎯 Focus**: Build all business logic services. These are used by the agent tools and API endpoints.

---

## Phase 4: LangChain Agent Setup ⭐ CORE

**Goal**: Implement LangChain agent with tools, middleware, and memory
**Duration**: 1.5 weeks
**Priority**: **CRITICAL** (Core functionality - this is the heart of the application)

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 4.1 | Define agent state schema in `src/agents/schemas/state.schema.ts` | 🔴 | Phase, sessionId, budget, etc. |
| 4.2 | Implement state extension middleware | 🔴 | `src/agents/middleware/state.middleware.ts` |
| 4.3 | Implement phase-aware prompt middleware | 🔴 | `src/agents/middleware/phase-prompt.middleware.ts` |
| 4.4 | Implement guardrails middleware | 🔴 | `src/agents/middleware/guardrails.middleware.ts` |
| 4.5 | Implement Taobao product search tool | 🔴 | `src/agents/tools/taobao.tool.ts` |
| 4.6 | Implement budget validation tool | 🔴 | `src/agents/tools/budget.tool.ts` |
| 4.7 | Implement render generation tool | 🔴 | `src/agents/tools/render.tool.ts` |
| 4.8 | Implement contractor search tool | 🔴 | `src/agents/tools/contractor.tool.ts` |
| 4.9 | Implement PDF generation tool | 🔴 | `src/agents/tools/pdf.tool.ts` |
| 4.10 | Setup PostgresSaver for memory | 🔴 | LangGraph checkpointer |
| 4.11 | Implement coordinator agent in `src/agents/coordinator.chain.ts` | 🔴 | Main agent with all tools |
| 4.12 | Implement ChatService to orchestrate agent | 🔴 | `src/services/chat.service.ts` |
| 4.13 | Write unit tests for tools | 🔴 | Mock service calls |
| 4.14 | Write unit tests for middleware | 🔴 | Test phase prompts, guardrails |
| 4.15 | Write integration tests for agent | 🔴 | Test full conversation flow |
| 4.16 | Test agent streaming responses | 🔴 | Verify token-by-token streaming works |

### Dependencies
- Phase 3 completed (Services for tools)
- LangChain packages installed (from Phase 1)
- Gemini API configured (from Phase 1)

### Acceptance Criteria
- [ ] Agent state tracks phase, budget, rooms
- [ ] Phase-aware prompts inject correctly for all phases
- [ ] Guardrails block forbidden topics (structural engineering, etc.)
- [ ] All tools call corresponding services correctly
- [ ] Agent can stream responses token-by-token
- [ ] Conversation memory persists in database (PostgresSaver)
- [ ] Agent handles errors gracefully
- [ ] All tests pass with >80% coverage

### Testing Checklist
- [ ] Test state extension and updates
- [ ] Test phase prompt injection for INTAKE, CHECKLIST, PLAN, RENDER, ITERATE
- [ ] Test guardrails trigger on forbidden topics
- [ ] Test each tool independently
- [ ] Test full agent conversation (intake → checklist → plan)
- [ ] Test memory persistence across multiple messages
- [ ] Test agent recovery from errors

### Notes
**🎯 PRIORITY**: This is the core innovation. Get the agent working well before moving on. Test thoroughly with various scenarios.

---

## Phase 5: API Routes & Controllers (No Auth Yet)

**Goal**: Implement HTTP API routes for sessions and chat (open access for testing)
**Duration**: 3-4 days
**Priority**: High (Enables HTTP-based testing)

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 5.1 | Implement `src/controllers/session.controller.ts` | 🔴 | CRUD operations (no auth check yet) |
| 5.2 | Implement `src/controllers/chat.controller.ts` | 🔴 | HTTP fallback for chat |
| 5.3 | Implement `src/controllers/health.controller.ts` | 🔴 | Health check |
| 5.4 | Create session routes in `src/routes/session.routes.ts` | 🔴 | GET, POST, PUT, DELETE |
| 5.5 | Create chat routes in `src/routes/chat.routes.ts` | 🔴 | POST /api/chat/message |
| 5.6 | Create route aggregator in `src/routes/index.ts` | 🔴 | Combine all routes |
| 5.7 | Add DTO validation middleware to routes | 🔴 | Validate request bodies |
| 5.8 | Write unit tests for controllers | 🔴 | Mock services |
| 5.9 | Write integration tests for routes | 🔴 | Supertest + real DB |
| 5.10 | Document API endpoints | 🔴 | Basic API documentation |
| 5.11 | Setup Swagger/OpenAPI configuration | 🔴 | `src/config/swagger.config.ts` |
| 5.12 | Integrate Swagger UI in app.ts | 🔴 | Mount at `/api-docs` |
| 5.13 | Document session routes with JSDoc | 🔴 | Add OpenAPI annotations |
| 5.14 | Document chat routes with JSDoc | 🔴 | Add OpenAPI annotations |
| 5.15 | Add request logging middleware | 🔴 | `src/middleware/requestLogger.middleware.ts` |
| 5.16 | Add error logging middleware | 🔴 | Enhanced error context with request ID |

### Dependencies
- Phase 2 completed (DTOs)
- Phase 3 completed (Services)
- Phase 4 completed (ChatService)

### Acceptance Criteria
- [ ] All routes return correct status codes
- [ ] Invalid requests are rejected with 400
- [ ] Errors are handled correctly
- [ ] Sessions can be created via POST /api/sessions
- [ ] Chat messages can be sent via POST /api/chat/message
- [ ] All tests pass with >80% coverage
- [ ] Swagger UI accessible at `/api-docs`
- [ ] At least 2 API endpoints documented with JSDoc
- [ ] All requests logged with unique request ID
- [ ] Request duration tracked in logs

### Testing Checklist
- [ ] Test session CRUD operations
- [ ] Test chat message endpoint
- [ ] Test validation errors
- [ ] Test error responses
- [ ] Test with Postman/cURL for manual verification
- [ ] Verify Swagger UI loads correctly
- [ ] Test request logging middleware captures request ID
- [ ] Verify error logging includes full context

### Notes
**🎯 Focus**: Get HTTP API working for testing. **No authentication required yet** - routes are open. We'll add auth middleware in Phase 8.

**Production Patterns**: Swagger/OpenAPI for documentation, request/error logging with unique request IDs based on production-patterns-research.md

---

## Phase 6: Socket.io Integration ⭐ CORE (No Auth Yet)

**Goal**: Implement real-time chat with streaming agent responses (open access for testing)
**Duration**: 5-6 days
**Priority**: **CRITICAL** (Primary user interface)

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 6.1 | Implement `src/sockets/chat.socket.ts` | 🔴 | Socket.io event handlers |
| 6.2 | Implement `chat:join_session` event handler | 🔴 | Join room for session (no auth yet) |
| 6.3 | Implement `chat:user_message` event handler | 🔴 | Process user message |
| 6.4 | Stream agent responses via `chat:assistant_token` | 🔴 | Token-by-token streaming |
| 6.5 | Implement `chat:phase_update` event | 🔴 | Notify phase changes |
| 6.6 | Implement `chat:tool_call` event | 🔴 | Notify when agent uses tools |
| 6.7 | Implement error handling for socket events | 🔴 | Emit `chat:error` on failures |
| 6.8 | Write unit tests for socket handlers | 🔴 | Mock socket and services |
| 6.9 | Write integration tests for socket flow | 🔴 | Socket.io test client |
| 6.10 | Load test socket server | 🔴 | Test concurrent connections |
| 6.11 | Build simple test client UI (optional) | 🔴 | HTML page for manual testing |

### Dependencies
- Phase 4 completed (ChatService with streaming)

### Acceptance Criteria
- [ ] Sockets connect successfully (no auth required yet)
- [ ] Users can join session rooms
- [ ] User messages trigger agent processing
- [ ] Agent responses stream in real-time
- [ ] Phase updates notify connected clients
- [ ] Tool calls are visible to client
- [ ] Errors are handled gracefully
- [ ] All tests pass with >80% coverage

### Testing Checklist
- [ ] Test socket connection
- [ ] Test joining a session room
- [ ] Test sending a user message
- [ ] Test receiving streamed agent response
- [ ] Test phase update notification
- [ ] Test error handling
- [ ] Test multiple concurrent users

### Notes
**🎯 PRIORITY**: This is the main user interface. Get streaming working smoothly. **No auth required yet** - connections are open for testing.

---

## Phase 7: Testing & Quality Assurance

**Goal**: Achieve comprehensive test coverage and quality standards for core features
**Duration**: 1 week
**Priority**: High (Before adding auth/payments)

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 7.1 | Review and fill test coverage gaps | 🔴 | Target >80% overall |
| 7.2 | Write E2E test for full agent flow | 🔴 | Intake → Checklist → Plan → Render |
| 7.3 | Run linter and fix all issues | 🔴 | `npm run lint` |
| 7.4 | Run type checker and fix all issues | 🔴 | `npm run build` |
| 7.5 | Test with Testcontainers for integration tests | 🔴 | Postgres container |
| 7.6 | Performance test agent response time | 🔴 | Should be <3s for simple queries |
| 7.7 | Load test Socket.io server | 🔴 | Handle 50+ concurrent connections |
| 7.8 | Security audit for SQL injection | 🔴 | Use parameterized queries |
| 7.9 | Security audit for XSS vulnerabilities | 🔴 | Sanitize user inputs |
| 7.10 | Document test procedures | 🔴 | How to run tests |
| 7.11 | Create test data fixtures | 🔴 | Sample products, contractors, etc. |
| 7.12 | Refactor server.ts for test-friendly architecture | 🔴 | Conditional start based on NODE_ENV |
| 7.13 | Export app/server for test integration | 🔴 | Allow tests to import without auto-start |
| 7.14 | Add integration tests using exported server | 🔴 | Test full HTTP/WebSocket flows |

### Dependencies
- Phases 1-6 completed

### Acceptance Criteria
- [ ] Overall test coverage >80%
- [ ] All linter rules pass
- [ ] No TypeScript errors
- [ ] No `any` types in codebase
- [ ] All security checks pass
- [ ] Performance benchmarks met
- [ ] E2E test covers full user journey
- [ ] Server doesn't auto-start when imported in tests
- [ ] Tests can control server lifecycle
- [ ] No port conflicts in CI/CD

### Testing Checklist
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E test covers full flow
- [ ] Load tests meet requirements
- [ ] Security audit clean
- [ ] Test server export works correctly
- [ ] Verify tests don't auto-start server

### Notes
**🎯 Focus**: Validate that core features work well before adding complexity of auth/payments.

**Production Patterns**: Test-friendly architecture with conditional server start and exports based on production-patterns-research.md

---

## Phase 8: Authentication & Authorization 🔐

**Goal**: Add Supabase JWT verification for HTTP and WebSocket
**Duration**: 3-4 days
**Priority**: High (Security layer)

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 8.1 | Install Supabase client packages | 🔴 | `@supabase/supabase-js` |
| 8.2 | Implement `src/config/supabase.ts` | 🔴 | Supabase admin client |
| 8.3 | Update `src/config/env.ts` to require Supabase vars | 🔴 | Make SUPABASE_* required |
| 8.4 | Implement `src/middleware/auth.middleware.ts` | 🔴 | Express JWT verification |
| 8.5 | Extend Express Request type with user property | 🔴 | Add `req.user` type |
| 8.6 | Implement `src/sockets/middleware/auth.socket-middleware.ts` | 🔴 | Socket.io auth |
| 8.7 | Implement `src/services/auth.service.ts` | 🔴 | Token verification, profile ops |
| 8.8 | Add auth middleware to API routes | 🔴 | Protect session, chat routes |
| 8.9 | Add auth middleware to Socket.io connection | 🔴 | Require token on connect |
| 8.10 | Update tests to include auth tokens | 🔴 | Mock/generate valid JWTs |
| 8.11 | Write unit tests for AuthService | 🔴 | Mock Supabase responses |
| 8.12 | Write integration test for auth middleware | 🔴 | Test valid/invalid tokens |
| 8.13 | Document authentication flow | 🔴 | Add to README |

### Dependencies
- Phase 7 completed (All tests pass without auth)
- Supabase Auth configured (Google OAuth)
- Test Supabase users created

### Acceptance Criteria
- [ ] Auth middleware correctly verifies valid Supabase JWTs
- [ ] Auth middleware rejects invalid/expired tokens
- [ ] `req.user` is populated with user ID and email
- [ ] Socket connections require valid auth token
- [ ] Authenticated sockets have `socket.userId` set
- [ ] AuthService can create/fetch user profiles
- [ ] All existing tests updated and passing

### Testing Checklist
- [ ] Test valid JWT passes auth
- [ ] Test expired JWT is rejected
- [ ] Test missing Authorization header is rejected
- [ ] Test malformed JWT is rejected
- [ ] Test socket auth with valid token
- [ ] Test socket auth rejects invalid token

### Notes
**🎯 Focus**: Layer authentication on top of working core features. Update all routes and socket handlers to require auth.

---

## Phase 9: Payment Integration (Stripe) 💳

**Goal**: Implement Stripe Checkout, webhooks, and subscription management
**Duration**: 5-6 days
**Priority**: High (Monetization)

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 9.1 | Install Stripe package | 🔴 | `stripe` |
| 9.2 | Implement `src/config/stripe.ts` | 🔴 | Stripe client & constants |
| 9.3 | Update `src/config/env.ts` to require Stripe vars | 🔴 | Make STRIPE_* required |
| 9.4 | Implement `src/services/billing.service.ts` | 🔴 | Checkout, webhooks, subscriptions |
| 9.5 | Implement `src/controllers/payment.controller.ts` | 🔴 | Checkout endpoint |
| 9.6 | Implement `src/controllers/webhook.controller.ts` | 🔴 | Stripe webhook handler |
| 9.7 | Create payment routes in `src/routes/payment.routes.ts` | 🔴 | POST /api/payments/checkout |
| 9.8 | Create webhook routes in `src/routes/webhook.routes.ts` | 🔴 | POST /api/stripe/webhook |
| 9.9 | Implement webhook signature verification | 🔴 | Use `STRIPE_WEBHOOK_SECRET` |
| 9.10 | Handle `checkout.session.completed` event | 🔴 | Mark session as paid |
| 9.11 | Handle `customer.subscription.updated` event | 🔴 | Update subscription status |
| 9.12 | Handle `customer.subscription.deleted` event | 🔴 | Cancel subscription |
| 9.13 | Create `src/models/subscription.model.ts` | 🔴 | Subscription data access |
| 9.14 | Add payment gate to PDF generation | 🔴 | Require payment before PDF |
| 9.15 | Write unit tests for BillingService | 🔴 | Mock Stripe SDK |
| 9.16 | Write integration tests for payment flow | 🔴 | Use Stripe test mode |
| 9.17 | Test webhooks using Stripe CLI | 🔴 | Forward webhooks to localhost |
| 9.18 | Document payment integration | 🔴 | Setup guide, testing guide |

### Dependencies
- Phase 8 completed (Auth for protected payment routes)
- Stripe account setup with test API keys
- Stripe products and prices created in dashboard

### Acceptance Criteria
- [ ] Checkout session creation returns valid Stripe URL
- [ ] Checkout session includes metadata (user ID, session ID)
- [ ] Webhooks are verified and processed correctly
- [ ] Completed payments mark `renovation_sessions.isPaid = true`
- [ ] Subscriptions are created/updated in database
- [ ] PDF generation requires payment
- [ ] Error handling for failed payments
- [ ] All tests pass with >80% coverage

### Testing Checklist
- [ ] Create checkout session with valid user
- [ ] Reject checkout for unauthenticated user
- [ ] Handle `checkout.session.completed` webhook
- [ ] Handle `customer.subscription.updated` webhook
- [ ] Handle invalid webhook signature
- [ ] Test full payment flow end-to-end (using Stripe test mode)
- [ ] Test payment gate blocks unpaid PDF generation

### Notes
**🎯 Focus**: Add monetization layer. Ensure payment flow is smooth and secure.

---

## Phase 10: Deployment & Documentation

**Goal**: Deploy to Backend Container and finalize documentation
**Duration**: 5-6 days
**Priority**: Medium (Final step)

### Tasks

| # | Task | Status | Notes |
|---|------|--------|-------|
| 10.1 | Create `Dockerfile` for Backend Container | 🔴 | Multi-stage build |
| 10.2 | Setup Backend Container service | 🔴 | Configure environment vars |
| 10.3 | Configure Supabase connection pooling | 🔴 | For Backend Container environment |
| 10.4 | Setup Supabase Storage buckets for production | 🔴 | Renders and style images |
| 10.5 | Configure CORS for production frontend | 🔴 | Update allowed origins |
| 10.6 | Setup logging and monitoring | 🔴 | Structured logging |
| 10.7 | Configure Stripe webhook endpoint | 🔴 | Point to production URL |
| 10.8 | Test deployment in staging | 🔴 | Verify all features work |
| 10.9 | Write deployment guide | 🔴 | Step-by-step deployment |
| 10.10 | Write API documentation | 🔴 | OpenAPI/Swagger spec |
| 10.11 | Write troubleshooting guide | 🔴 | Common issues and fixes |
| 10.12 | Create runbook for operations | 🔴 | How to handle incidents |

### Dependencies
- Phase 9 completed (All tests pass)

### Acceptance Criteria
- [ ] Backend deploys successfully to Backend Container
- [ ] All environment variables configured
- [ ] Database connections work from Backend Container
- [ ] Stripe webhooks route to production
- [ ] CORS allows production frontend
- [ ] Logs are viewable in logging dashboard
- [ ] Documentation is complete

### Deployment Checklist
- [ ] Dockerfile builds successfully
- [ ] Backend Container deployment succeeds
- [ ] Health check returns 200
- [ ] Auth works with production Supabase
- [ ] Stripe webhooks deliver successfully
- [ ] Agent responds to test queries
- [ ] Socket.io connections work

---

## Progress Tracking Dashboard

### Overall Progress
- **Phase 1**: 🔴 Not Started (0/17 tasks) - Database & Core Setup
- **Phase 2**: 🔴 Not Started (0/13 tasks) - Models & DTOs
- **Phase 3**: 🔴 Not Started (0/13 tasks) - Domain Services
- **Phase 4**: 🔴 Not Started (0/16 tasks) - ⭐ **LangChain Agent** (CORE)
- **Phase 5**: 🔴 Not Started (0/16 tasks) - API Routes (No Auth)
- **Phase 6**: 🔴 Not Started (0/11 tasks) - ⭐ **Socket.io** (CORE)
- **Phase 7**: 🔴 Not Started (0/14 tasks) - Testing & QA
- **Phase 8**: 🔴 Not Started (0/13 tasks) - 🔐 Authentication
- **Phase 9**: 🔴 Not Started (0/18 tasks) - 💳 Payment Integration
- **Phase 10**: 🔴 Not Started (0/12 tasks) - Deployment

**Total**: 0/143 tasks completed (0%)

### Critical Path (Prioritized)

**CORE FUNCTIONALITY FIRST:**
1. Phase 1 (DB & Core) → Phase 2 (Models) → Phase 3 (Services) → **Phase 4 (Agent)** → **Phase 6 (Socket.io)** → Phase 7 (Testing)

**THEN ADD SECURITY & MONETIZATION:**
2. Phase 8 (Auth) → Phase 9 (Payments) → Phase 10 (Deployment)

**Can Run in Parallel:**
- Phase 5 (API Routes) can develop alongside Phase 6 (Socket.io)

### New Timeline Strategy

**Weeks 1-3: Core Features**
- Week 1: Phases 1-2 (Setup, Models)
- Week 2: Phases 3-4 (Services, Agent) ⭐ Most critical
- Week 3: Phases 5-6 (API, Socket.io) ⭐ User-facing

**Weeks 4-5: Polish & Security**
- Week 4: Phase 7 (Testing/QA)
- Week 5: Phase 8 (Auth)

**Weeks 6-7: Monetization & Deployment**
- Week 6: Phase 9 (Payments)
- Week 7: Phase 10 (Deployment)

### Risk & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| LangChain breaking changes | High | Medium | Pin versions, monitor changelog, test thoroughly |
| Agent response time too slow | High | Medium | Optimize prompts, use caching, profile performance |
| Socket.io streaming issues | High | Low | Test with multiple clients, handle backpressure |
| Database migration conflicts | Medium | Low | Version control migrations, test on staging |
| Supabase Auth integration issues | Medium | Low | Use official examples, implement in Phase 8 (after core works) |
| Stripe webhook reliability | Medium | Low | Implement retry logic, test with Stripe CLI |
| Supabase Storage quota limits | Low | Low | Monitor usage, implement fallback |

### Key Benefits of This Approach

✅ **Faster Validation**: Core agent functionality works in 2-3 weeks
✅ **Easier Debugging**: Test agent without auth complexity
✅ **Flexible Pivoting**: Can change auth/payment approach if needed
✅ **Clearer Priorities**: Team focuses on innovation first
✅ **Better Testing**: Isolate agent issues from auth issues

---

## Next Steps

1. **Review this reorganized plan** - Confirm core-first approach
2. **Set up project tracking** (e.g., GitHub Projects, Linear)
3. **Begin Phase 1** - Database & core infrastructure
4. **Focus on Phase 4** - This is the heart of the product
5. **Update progress** daily in this document

---

## Notes & Learnings

*Use this section to document learnings, challenges, and decisions as you implement.*

### Week 1: Foundation
- [To be filled during implementation]

### Week 2: Core Agent (Critical)
- [To be filled during implementation]

### Week 3: User Interface
- [To be filled during implementation]

### Week 4: Testing & Refinement
- [To be filled during implementation]

### Week 5-7: Security & Launch
- [To be filled during implementation]

---

## Resources

### Documentation Links
- [Research Document](../research/backend-implementation-research.md)
- [Production Patterns Research](../research/production-patterns-research.md) ⭐ **NEW**
- [Full System Architecture](../Full%20System%20Architecture.md)
- [Agentic Architecture](../Agentic%20Architecture.md)
- [Authentication & Payments](../Authentication%20and%20Payments%20Architecture.md)

### External Resources
- [LangChain JS Docs](https://js.langchain.com/) ⭐ Priority
- [Gemini API Docs](https://ai.google.dev/gemini-api/docs) ⭐ Priority
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Socket.io Docs](https://socket.io/docs/v4/)
- [Vitest Docs](https://vitest.dev/)
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth) - For Phase 8
- [Stripe API Reference](https://stripe.com/docs/api) - For Phase 9

---

**Status**: ✅ Ready to begin implementation
**Strategy**: 🎯 Core functionality first, then layer in auth/payments
**Last Updated**: 2026-01-07
**Enhanced With**: Production patterns from production-patterns-research.md (graceful shutdown, health checks, API docs, logging, test-friendly architecture)
