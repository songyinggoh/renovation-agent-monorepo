# Codebase Concerns

**Analysis Date:** 2026-03-01

## Tech Debt

**Global Socket.io Instance via `(global).io`:**
- Issue: Socket.io server stored on Node.js `global` object in `backend/src/server.ts` (line 598: `(global as Record<string, unknown>).io = io;`) and retrieved via `backend/src/utils/socket-emitter.ts`. This bypasses TypeScript's type system and creates a hidden dependency.
- Files: `backend/src/server.ts`, `backend/src/utils/socket-emitter.ts`
- Impact: No compile-time safety for Socket.io access. Workers and services depend on a global side-effect. Makes testing harder since the global must be set up manually. The code itself acknowledges this: "In Phase 6, we'll create a proper Socket service."
- Fix approach: Create a `SocketService` singleton that holds the io instance, is initialized in `server.ts`, and is imported by workers/services. This removes the `global` cast and provides type-safe access.

**Docker-Compose Hardcoded Supabase Keys:**
- Issue: `docker-compose.yml` contains a real Supabase anon key and URL in plaintext (lines 33-34). While anon keys are meant to be public, embedding them in committed config is poor practice and makes key rotation harder.
- Files: `docker-compose.yml`
- Impact: Key rotation requires editing committed files. Developers may accidentally use these keys in non-local environments.
- Fix approach: Replace hardcoded keys with environment variable references (`${NEXT_PUBLIC_SUPABASE_URL:-placeholder}`) and document required `.env` setup for docker-compose.

**Coverage Threshold Mismatch:**
- Issue: Backend vitest thresholds (50% lines, 70% functions) and frontend thresholds (30% lines, 20% functions) are significantly lower than the Codecov project target (80%). The vitest thresholds are effectively non-blocking while Codecov enforces the real standard only on PR.
- Files: `backend/vitest.config.ts`, `frontend/vitest.config.ts`, `codecov.yml`
- Impact: Developers can add code locally that passes `pnpm test:unit` but fails the Codecov check in CI, creating a frustrating feedback loop.
- Fix approach: Raise vitest thresholds to match or approach Codecov targets (at minimum 60% lines for backend, 50% for frontend) to catch coverage regressions earlier.

**Dev-Agents Framework Imports from Non-Existent Package:**
- Issue: `backend/src/dev-agents/middleware.ts` imports from `'langchain'` directly (line 1-5: `import { toolCallLimitMiddleware, modelCallLimitMiddleware, modelFallbackMiddleware } from 'langchain'`). These exports do not exist in the `langchain` package -- the middleware API appears to be aspirational or based on a different version.
- Files: `backend/src/dev-agents/middleware.ts`, `backend/src/dev-agents/types.ts`
- Impact: The dev-agents module would fail at runtime if actually invoked. It compiles only because `skipLibCheck: true` is set and these paths are mocked in tests. The entire dev-agents framework (~20 files) is effectively dead code.
- Fix approach: Either implement working middleware using actual LangChain/LangGraph APIs, or remove the dev-agents directory entirely until the framework is needed. Guard with `isDevAgentEnabled()` feature flag at entry points.

**Server.ts Monolith:**
- Issue: `backend/src/server.ts` is 746 lines and handles server startup, Socket.io initialization, auth middleware, rate limiting, chat message handling, room joining, and graceful shutdown all in one file.
- Files: `backend/src/server.ts`
- Impact: Hard to test individual concerns. Changes to rate limiting require reading through Socket.io handlers. The in-memory rate limiter (lines 302-328) is defined inline rather than as a reusable module.
- Fix approach: Extract Socket.io event handlers into `backend/src/handlers/socket.handlers.ts`. Extract rate limiter into its own module. Keep `server.ts` as pure orchestration (~100 lines).

## Known Bugs

**No active TODO/FIXME/HACK comments found in source code.** The codebase has been cleaned of inline debt markers. Known issues are tracked in planning docs instead.

## Security Considerations

**Prompt Injection Detection - Pattern-Based Only:**
- Risk: The prompt injection detection in `backend/src/validators/socket.validators.ts` uses regex patterns (7 high, 5 medium, 3 low severity). Sophisticated attacks using encoding, unicode, or novel phrasing can bypass pattern matching entirely.
- Files: `backend/src/validators/socket.validators.ts`
- Current mitigation: 3-tier severity classification. High severity blocks the message. Medium severity warns but allows. Low severity logs only.
- Recommendations: Consider adding an LLM-based injection classifier as a secondary check for medium/low severity messages. Add rate limiting specifically for messages that trigger any pattern match.

**Anonymous Mode Auth Bypass:**
- Risk: When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not set, all auth is skipped. Sessions created anonymously have `userId: null` and any client can join any session by knowing the UUID.
- Files: `backend/src/middleware/auth.middleware.ts`, `backend/src/server.ts`
- Current mitigation: Session IDs are UUIDs (hard to guess). This is intentional for Phases 1-7.
- Recommendations: Add session-scoped tokens or short-lived join codes before production launch. Ensure `isAuthEnabled()` returns true in production environments.

**Redis Connection String in BullMQ:**
- Risk: If `REDIS_URL` contains authentication credentials, they are parsed and passed to BullMQ connection options in `backend/src/config/queue.ts`. Password is extracted from URL but could appear in error logs if connection fails.
- Files: `backend/src/config/queue.ts`
- Current mitigation: Logger does not log connection strings. Redis errors caught in server startup.
- Recommendations: Ensure Redis connection errors redact password from error messages.

## Performance Bottlenecks

**System Prompt Rebuilt on Every Message:**
- Problem: `ChatService.processMessage()` calls `getSystemPrompt(phase, sessionId)` on every message, and passes the full system prompt + message history as input to the LangGraph agent. As conversation grows, token count increases linearly.
- Files: `backend/src/services/chat.service.ts`, `backend/src/config/prompts.ts`
- Cause: Message history loaded fresh from DB each time (last 20 messages). System prompt is phase-aware so must be dynamic. No summarization or pruning of old messages.
- Improvement path: Implement message summarization for conversations exceeding a threshold (e.g., summarize messages older than 10 turns). Consider caching the compiled system prompt per phase.

**Image Upload Processing:**
- Problem: Image optimization worker (`backend/src/workers/image.worker.ts`) generates thumbnails, WebP, and AVIF variants synchronously within a single job. Large images can consume significant memory with Sharp.
- Files: `backend/src/workers/image.worker.ts`
- Cause: All variants generated in one pass. Sharp buffers entire image in memory.
- Improvement path: Stream-based processing, or split into separate sub-jobs for each variant.

## Fragile Areas

**Socket.io Event Contract:**
- Files: `packages/shared-types/src/socket-events.ts`, `backend/src/server.ts`, `frontend/hooks/useChat.ts`
- Why fragile: Socket.io events are defined as TypeScript interfaces in shared-types, but the actual emit calls in `server.ts` use string literals for event names (e.g., `'render:started'`, `'render:progress'`). Worker files use `emitToSession()` which takes `event: string` -- no compile-time check that the event name matches the type contract.
- Safe modification: Always grep for event name strings across backend + frontend before renaming. Add integration tests that verify event payloads match shared-types.
- Test coverage: Socket.io integration test exists (`backend/tests/integration/socket.test.ts`) but may not cover all event types.

**LangGraph Agent Iteration Guard:**
- Files: `backend/src/utils/agent-guards.ts`, `backend/src/services/chat.service.ts`
- Why fragile: The ReAct agent has two guard mechanisms: `createSafeShouldContinue()` (secondary, tool whitelist + logging) and `recursionLimit` (primary, hard cap at `MAX_REACT_ITERATIONS * 2`). If both are misconfigured, the agent could loop indefinitely, consuming API credits and blocking the Socket.io connection.
- Safe modification: Never change `MAX_REACT_ITERATIONS` without updating both the `recursionLimit` and the `shouldContinue` guard. Always test with a tool that triggers multiple iterations.
- Test coverage: `backend/tests/unit/utils/agent-guards.test.ts` covers the guard logic. `GraphRecursionError` catch tested in `chat.service.test.ts`.

## Scaling Limits

**In-Memory Rate Limiter:**
- Current capacity: 10 messages per 60 seconds per socket connection
- Limit: State stored in a `Map<string, bucket>` in `backend/src/server.ts` (line 304). This is per-process only -- multiple backend instances each have independent rate limits, effectively multiplying the limit.
- Scaling path: Move rate limiting to Redis using `rate-limiter-flexible` (already used for HTTP rate limiting) for cross-instance consistency. The HTTP rate limiter in `backend/src/middleware/rate-limit.middleware.ts` already uses a shared store pattern.

**LangGraph Checkpointer:**
- Current capacity: PostgreSQL-backed, stores full message state per thread
- Limit: Checkpoint table grows unbounded as conversations accumulate. No TTL or cleanup.
- Scaling path: Add scheduled cleanup of checkpoints for completed/abandoned sessions. Consider checkpoint compression for long conversations.

## Dependencies at Risk

**LangChain/LangGraph Rapid API Changes:**
- Risk: The LangChain ecosystem releases frequently with breaking changes. The project uses `@langchain/langgraph` 1.0.13 which recently stabilized, but `@langchain/google-genai` 2.1.20 may introduce breaking changes in tool calling APIs.
- Impact: Backend chat service (`backend/src/services/chat.service.ts`) and all 7 tools depend on LangChain abstractions. Agent graph compilation, streaming, and tool binding are tightly coupled.
- Migration plan: Pin exact versions in package.json. Run AI regression tests (`backend/tests/ai-regression/`) after any LangChain upgrade. The `TracedModel` wrapper in `backend/src/config/gemini.ts` provides a single point of change if the model API shifts.

**React 19 + Next.js 16:**
- Risk: Both are relatively new major versions. React 19 changed the async component model and Next.js 16 uses the latest App Router features. Some ecosystem libraries may not fully support them.
- Impact: Frontend component patterns (async params in `frontend/app/app/session/[sessionId]/page.tsx`) use Next.js 16 conventions. Third-party component libraries may lag behind.
- Migration plan: Monitor React 19 compatibility reports for shadcn/ui, TanStack Query, and react-hook-form.

## Missing Critical Features

**No Automated Session Cleanup:**
- Problem: Abandoned sessions (no messages for X days) accumulate indefinitely in the database. LangGraph checkpoints for these sessions also persist.
- Blocks: Storage costs grow unbounded. Database query performance may degrade with millions of orphaned sessions.

**No File Storage Abstraction:**
- Problem: Asset service (`backend/src/services/asset.service.ts`) is tightly coupled to Supabase Storage. No adapter pattern for alternative storage providers (S3, GCS, local filesystem for development).
- Blocks: Cannot run full image upload pipeline without Supabase credentials. Local development of image features requires Supabase project.

**No API Versioning:**
- Problem: All REST routes are mounted under `/api/` with no version prefix. Breaking changes to API responses will affect all connected clients simultaneously.
- Blocks: Cannot evolve API without coordinated frontend+backend deploys.

## Test Coverage Gaps

**`backend/src/server.ts` (746 lines):**
- What's not tested: Server startup sequence, Socket.io event handlers, rate limiting logic, graceful shutdown sequence
- Files: `backend/src/server.ts`
- Risk: The most critical file in the backend is excluded from unit test coverage. Integration tests cover some HTTP paths but Socket.io handler logic (join, message, validation, streaming) is tested indirectly at best.
- Priority: High

**Frontend Components:**
- What's not tested: Most React components in `frontend/components/renovation/` (11 components), `frontend/components/dashboard/`, `frontend/components/session/`. Only chat components and hooks have tests.
- Files: `frontend/components/renovation/*.tsx`, `frontend/components/dashboard/*.tsx`
- Risk: UI regressions in domain-specific components go undetected. The 30% coverage threshold is very permissive.
- Priority: Medium

**Worker Error Paths:**
- What's not tested: While workers have test files, edge cases like `UnrecoverableError` handling, dead letter queue integration, and concurrent job processing under load are not comprehensively tested.
- Files: `backend/tests/unit/workers/*.test.ts`
- Risk: Job processing failures in production may not be handled as expected. The distinction between retriable and permanent errors is critical for BullMQ.
- Priority: Medium

**Dev-Agents Framework:**
- What's not tested: Tests exist (`backend/tests/unit/dev-agents/`) but they mock everything including the broken imports. No test verifies that the agents can actually be constructed and invoked.
- Files: `backend/src/dev-agents/`, `backend/tests/unit/dev-agents/`
- Risk: Low (feature is behind `isDevAgentEnabled()` flag and not used in production)
- Priority: Low

---

*Concerns audit: 2026-03-01*
