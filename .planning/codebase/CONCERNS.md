# Codebase Concerns

**Analysis Date:** 2026-02-09

## Tech Debt

**In-Memory Rate Limiting:**
- Issue: Socket.io rate limiting uses in-memory Map, not distributed-safe
- Files: `backend/src/server.ts` (lines 165-191)
- Impact: Rate limits reset on server restart, not shared across multiple instances in production
- Fix approach: Migrate to Redis-backed rate limiting with sliding window algorithm (use ioredis + rate-limiter-flexible library)

**Global Socket.io Instance:**
- Issue: Socket.io stored in `global` object for cross-module access
- Files: `backend/src/server.ts` (line 342: `(global as Record<string, unknown>).io = io;`)
- Impact: Poor testability, tight coupling, type-unsafe access
- Fix approach: Create SocketService class, inject via dependency injection or service locator pattern

**Hardcoded Secret in Docker Compose:**
- Issue: Supabase anon key exposed in docker-compose.yml
- Files: `docker-compose.yml` (line 33)
- Impact: Security risk if docker-compose.yml is committed with production credentials
- Fix approach: Use `.env` file for secrets, reference via `${NEXT_PUBLIC_SUPABASE_ANON_KEY}` in docker-compose

**Missing Integration Tests:**
- Issue: Only 1 integration test file (`socket.test.ts`), no API endpoint tests
- Files: `backend/tests/integration/` directory
- Impact: API contract changes may break frontend without detection
- Fix approach: Add integration tests for all REST endpoints using supertest library, test full request/response cycle

**Frontend Test Coverage:**
- Issue: No frontend tests detected, Vitest configured but not used
- Files: `frontend/` directory, `frontend/vitest.config.ts` exists
- Impact: React components untested, risk of regressions during UI changes
- Fix approach: Add component tests using @testing-library/react, start with critical paths (chat interface, phase transitions)

## Known Bugs

**TODO in Health Check:**
- Symptoms: Comment indicates missing LangChain agent readiness check
- Files: `backend/src/routes/health.routes.ts` (line 81: `// TODO Phase 4: Check LangChain agent readiness`)
- Trigger: `/health/ready` endpoint does not verify AI agent is initialized
- Workaround: Manual verification required before traffic routing in production
- Fix: Add checkpointer connection test and Gemini API ping to readiness probe

## Security Considerations

**Authentication Optional:**
- Risk: UserId nullable in database schemas, authentication not enforced in Phases 1-7
- Files: `backend/src/db/schema/sessions.schema.ts` (line 15), `backend/src/middleware/auth.middleware.ts`
- Current mitigation: Documented as Phase 8+ feature, anonymous sessions supported by design
- Recommendations: Add row-level security policies when Supabase auth is enabled, validate session ownership before mutations

**No Request Size Limits (Beyond Body Parser):**
- Risk: Large Socket.io payloads could cause memory exhaustion
- Files: `backend/src/server.ts` (line 142: `maxHttpBufferSize: 10e6` for Socket.io, line 51: `limit: '10mb'` for Express)
- Current mitigation: 10MB limit configured for both HTTP and WebSocket
- Recommendations: Add per-message size validation in `chat:user_message` handler, log oversized payloads

**Error Messages May Leak Info:**
- Risk: Stack traces and detailed errors exposed in development mode
- Files: `backend/src/middleware/errorHandler.ts` (returns generic "Internal Server Error" in production)
- Current mitigation: Custom AppError class with controlled messages, full errors only logged server-side
- Recommendations: Add NODE_ENV check to ensure no stack traces in production responses

**Supabase Service Role Key in Env:**
- Risk: Service role key has admin privileges, should be rotated regularly
- Files: `backend/src/config/env.ts` (SUPABASE_SERVICE_ROLE_KEY)
- Current mitigation: Optional in Phases 1-7, loaded only if present
- Recommendations: Use secret manager (GCP Secret Manager) in production, never commit to version control

## Performance Bottlenecks

**Message History Loading:**
- Problem: ChatService loads last 20 messages on every user message
- Files: `backend/src/services/chat.service.ts` (line 162: `getRecentMessages(sessionId, 20)`)
- Cause: Database query on every message, no caching
- Improvement path: Implement Redis cache for message history, invalidate on new messages, reduce DB queries by 90%

**No Connection Pooling Limits:**
- Problem: Drizzle connection pool has no explicit max connections configured
- Files: `backend/src/db/index.ts` (uses default pg pool settings)
- Cause: Could exhaust database connections under high load
- Improvement path: Configure pool max (20-50 connections), set idle timeout, add connection metrics

**Streaming Response Accumulation:**
- Problem: ChatService accumulates full response in memory while streaming
- Files: `backend/src/services/chat.service.ts` (line 173: `let fullResponse = ''`)
- Cause: Long AI responses consume memory, stored again in database after streaming
- Improvement path: Consider storing only tokens, reconstruct response from database or checkpointer

**LangGraph Checkpointer Mode:**
- Problem: Default mode is 'memory', loses conversation history on restart
- Files: `backend/src/config/env.ts` (line 53: `LANGGRAPH_CHECKPOINTER` defaults to 'memory')
- Cause: Development convenience, not production-ready
- Improvement path: Set to 'postgres' in production, document requirement in deployment guide

## Fragile Areas

**Socket.io Authentication Middleware:**
- Files: `backend/src/server.ts` (lines 145-160)
- Why fragile: Token verification async, error handling returns generic "Authentication error", no retry logic
- Safe modification: Ensure Supabase client is initialized before Socket.io middleware runs, add detailed error codes
- Test coverage: Integration test exists (`socket.test.ts`), add unit test for auth middleware

**Phase Prompt Configuration:**
- Files: `backend/src/config/prompts.ts` (not read, but referenced in chat.service.ts line 159)
- Why fragile: System prompts are phase-aware, changes affect AI behavior across all sessions
- Safe modification: Version prompts, test with representative user queries before deployment, log prompt changes
- Test coverage: No tests detected for prompt generation

**ReAct Agent Graph Construction:**
- Files: `backend/src/services/chat.service.ts` (lines 63-102)
- Why fragile: LangGraph StateGraph with conditional edges, tool binding, checkpointer integration
- Safe modification: Write integration tests for full agent flow, mock Gemini API responses, verify tool calls
- Test coverage: Unit test exists (`chat.service.test.ts`), but may mock too aggressively

**Database Migration Strategy:**
- Files: `backend/drizzle/` directory
- Why fragile: Migrations are sequential, no rollback strategy documented
- Safe modification: Test migrations on staging database first, backup before applying, add down migrations
- Test coverage: No migration tests detected

## Scaling Limits

**Single-Instance Rate Limiting:**
- Current capacity: 10 messages per socket per 60 seconds
- Limit: Not shared across server instances, horizontal scaling breaks rate limits
- Scaling path: Migrate to Redis with distributed rate limiter, enforce limits at load balancer

**LangGraph Checkpointer Connections:**
- Current capacity: One PostgreSQL connection per checkpointer instance
- Limit: Each server instance creates new checkpointer connection, could exhaust DB connections
- Scaling path: Implement connection pooling for checkpointer, share pool with main database connection

**WebSocket Connection State:**
- Current capacity: Socket.io in-memory adapter, not distributed
- Limit: Sticky sessions required for horizontal scaling, no cross-instance messaging
- Scaling path: Use Redis adapter for Socket.io (`@socket.io/redis-adapter`), enable cross-instance events

**Message History Storage:**
- Current capacity: Unbounded message storage, no pagination or archival
- Limit: Old sessions accumulate messages forever, slow queries at scale
- Scaling path: Add message retention policy (e.g., archive after 90 days), paginate history queries, add indexes on sessionId + createdAt

## Dependencies at Risk

**Zod Version Mismatch:**
- Risk: Backend uses zod@3.24.1, frontend uses zod@4.3.6 (major version difference)
- Impact: Shared validation schemas may behave differently, type incompatibilities
- Migration plan: Upgrade backend to Zod v4, test all env validation and API schemas, update type assertions

**LangChain Rapid Evolution:**
- Risk: LangChain ecosystem is pre-1.0 for some packages (@langchain/langgraph 1.0.13 just released)
- Impact: Breaking changes in minor versions possible, tools API may change
- Migration plan: Pin versions aggressively, test upgrades in staging, subscribe to LangChain changelogs

**Next.js 16 (Canary):**
- Risk: Next.js 16.1.6 may have stability issues (released Jan 2025, recent)
- Impact: Build failures, React 19 compatibility issues
- Migration plan: Monitor Next.js GitHub issues, have rollback plan to Next.js 15 stable

## Missing Critical Features

**Pagination:**
- Problem: No pagination on message history, product search, or session lists
- Blocks: Large datasets will cause slow API responses and UI freezes
- Implementation: Add limit/offset or cursor-based pagination to all list endpoints

**Authentication in Production:**
- Problem: Supabase auth is optional, no user management in Phases 1-7
- Blocks: Cannot deploy to production without user authentication and authorization
- Implementation: Enforce auth middleware on all protected routes, add userId validation

**Error Tracking/Monitoring:**
- Problem: No error tracking service (Sentry, Rollbar, etc.)
- Blocks: Cannot debug production errors, no alerting on failures
- Implementation: Integrate Sentry for backend and frontend, add performance monitoring

**Backup Strategy:**
- Problem: No database backup documented, no disaster recovery plan
- Blocks: Data loss risk in production
- Implementation: Configure automated PostgreSQL backups (Cloud SQL, RDS), test restore process

## Test Coverage Gaps

**Frontend Components:**
- What's not tested: All React components (renovation, chat, UI)
- Files: `frontend/components/**/*.tsx`
- Risk: UI regressions undetected, prop changes break parent components
- Priority: High (add component tests before production deployment)

**Express Route Handlers:**
- What's not tested: Most API endpoints (health routes partially tested)
- Files: `backend/src/routes/*.routes.ts`, `backend/src/controllers/*.controller.ts`
- Risk: API contract changes break frontend, validation errors not caught
- Priority: High (add supertest integration tests for all endpoints)

**Socket.io Event Handlers:**
- What's not tested: Tool call events, error events, edge cases (rate limiting, disconnections)
- Files: `backend/src/server.ts` (lines 194-338)
- Risk: Real-time chat failures in production, poor error UX
- Priority: Medium (integration test exists but limited coverage)

**Database Migrations:**
- What's not tested: Migration rollbacks, data integrity after migrations
- Files: `backend/drizzle/*.sql`
- Risk: Production migrations fail, data corruption
- Priority: Medium (test migrations on staging before production)

**LangChain Tools:**
- What's not tested: Only 2 of 4 tools have tests (get-style-examples, save-checklist-state tested)
- Files: `backend/src/tools/*.tool.ts`
- Risk: Tool execution failures cause AI agent errors, poor user experience
- Priority: Medium (add tests for save-intake-state and search-products tools)

---

*Concerns audit: 2026-02-09*
