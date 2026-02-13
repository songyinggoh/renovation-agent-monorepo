# Missing & Augmenting Integrations - Research Summary

**Project:** Renovation Agent Monorepo (AI-powered renovation planning assistant)
**Domain:** AI SaaS / Real-time Conversational Application
**Researched:** 2026-02-13
**Confidence:** HIGH (based on existing codebase analysis from 2026-02-09 + production SaaS best practices)

---

## Executive Summary

The renovation-agent monorepo has a solid foundation -- Next.js 16 frontend, Express backend with Socket.io real-time chat, LangChain/Gemini ReAct agent, Drizzle ORM on PostgreSQL, and Supabase for auth/storage. The core conversational AI pipeline works: users connect via WebSocket, messages flow through a phase-aware ReAct agent with tool calling, and responses stream back in real-time. However, the system was built feature-first and is missing nearly every production infrastructure integration that separates a working demo from a deployable SaaS product.

The most critical gaps are: **no error tracking** (production bugs are invisible), **no background job processing** (long-running AI tasks block the request thread), **no email/notification system** (users get no communication outside the chat), **no caching layer** (Redis is in docker-compose but unused in code), and **no observability** (structured JSON logs go to console with no aggregation, alerting, or tracing). The in-memory rate limiter, in-memory Socket.io adapter, and memory-mode LangGraph checkpointer all break under horizontal scaling. These are not future concerns -- they block any production deployment with real users.

The recommended approach is a phased integration strategy that prioritizes production safety first (observability, error tracking, security hardening), then operational efficiency (caching, background jobs, connection pooling), then growth enablers (email, analytics, media pipeline). Each integration should be added with the existing architecture patterns -- service classes, structured logging, Zod validation -- rather than bolted on as afterthoughts. The codebase conventions are strong enough that integrations can follow established patterns cleanly.

---

## Priority Matrix

### CRITICAL -- Blocks Production Readiness

| Integration | Current State | What's Needed | Why Critical |
|---|---|---|---|
| **Error Tracking (Sentry)** | None. Custom Logger to console only. | Sentry SDK for backend + frontend, source maps, performance monitoring | Production errors are invisible. No alerting. Cannot debug user-reported issues. |
| **Redis Integration (actual usage)** | Redis 7-alpine in docker-compose, zero code references | Rate limiting, Socket.io adapter, session cache, message history cache | In-memory rate limiter resets on restart. Socket.io cannot scale horizontally. Message history queries hit DB on every message. |
| **Distributed Socket.io** | In-memory adapter only | `@socket.io/redis-adapter` for cross-instance events | Cannot run more than one backend instance. Single point of failure. |
| **Connection Pool Tuning** | Default pg pool settings, no limits | Explicit max connections (20-50), idle timeout, pool metrics | Will exhaust DB connections under load. Checkpointer creates separate connections. |
| **LangGraph Postgres Checkpointer (enforced)** | Defaults to memory mode | Enforce `LANGGRAPH_CHECKPOINTER=postgres` in production, share connection pool | Conversation history lost on restart. Users lose context mid-renovation. |
| **Authentication Enforcement** | Optional (userId nullable, Phase 8+) | Mandatory auth middleware on all mutation routes, RLS policies | Anyone can access/modify any session. No user isolation. |

### HIGH -- Blocks Upcoming Phases (3-4)

| Integration | Current State | What's Needed | Why High |
|---|---|---|---|
| **Background Job Queue (BullMQ)** | None. All AI processing is synchronous in Socket.io handler. | BullMQ + Redis for async AI tasks, image analysis, PDF generation | Phase 3 (PLAN) and Phase 4 (RENDER) involve heavy AI workloads that will timeout WebSocket connections. |
| **Email/Transactional Notifications (Resend or SendGrid)** | None | Transactional email service for session summaries, payment receipts, plan delivery | Phase 6 (PAYMENT) and Phase 7 (COMPLETE) require user communication outside the chat. |
| **File Processing Pipeline** | Basic Supabase Storage upload in AssetService | Image optimization queue, virus scanning, format validation, thumbnail generation | Phase 2 (upload pipeline) works but has no post-processing. Phase 4 (RENDER) needs processed images. |
| **PDF/Document Generation** | None | Server-side PDF generation for renovation plans, checklists, contractor briefs | Phase 3 (PLAN) deliverable is a renovation plan document. No way to generate it. |
| **Stripe Webhooks (actual implementation)** | stripe package installed, no webhook handler | Webhook endpoint, signature verification, payment state machine | Phase 9 (PAYMENT) is listed in roadmap but has zero implementation. |

### MEDIUM -- Improves Quality Significantly

| Integration | Current State | What's Needed | Why Medium |
|---|---|---|---|
| **APM / Distributed Tracing** | None | OpenTelemetry or Sentry Performance for request tracing across services | Cannot identify slow endpoints, trace AI latency, or debug cross-service issues. |
| **Log Aggregation** | Console JSON output only | Ship logs to Datadog/Loki/CloudWatch, add structured query and alerting | Logs vanish when containers restart. Cannot search historical logs. |
| **Rate Limiting (proper)** | In-memory token bucket per socket | `rate-limiter-flexible` with Redis backend, per-user and per-IP limits | Current rate limiter is per-socket (not per-user), not distributed, resets on restart. |
| **Database Migrations (safety)** | Forward-only Drizzle migrations, no rollback | Migration testing on staging, down migrations, backup-before-migrate script | One bad migration could corrupt production data with no rollback path. |
| **Input Sanitization** | Zod validation at API boundaries | DOMPurify for user content, SQL injection protection beyond ORM, XSS prevention | User messages go directly into AI prompts. Prompt injection is a real attack vector. |
| **Health Check Completeness** | DB check only, no AI readiness | Add Gemini API ping, checkpointer status, Redis connectivity to `/health/ready` | K8s may route traffic before AI agent is initialized (TODO already noted in code). |

### LOW -- Future Enhancements for Scale and Polish

| Integration | Current State | What's Needed | Why Low |
|---|---|---|---|
| **Analytics / Business Intelligence** | None | PostHog or Mixpanel for user behavior, session funnel, phase completion rates | Important for product decisions but not blocking functionality. |
| **CDN / Edge Caching** | Vercel handles frontend CDN | CloudFront or similar for uploaded assets, plan documents | Only matters at scale when asset serving becomes a bottleneck. |
| **Search (Elasticsearch/Typesense)** | Simple DB queries in search-products tool | Full-text search for products, contractors, materials | Current approach works for small catalogs. Replace when data grows. |
| **Feature Flags (LaunchDarkly/Flagsmith)** | None | Gradual rollout of phases, A/B testing prompts | Nice for iteration but not blocking launch. |
| **Webhook System (outgoing)** | None | Event webhooks for third-party integrations | Only needed when the platform opens to external developers/partners. |
| **AI Cost Tracking** | None | Per-session Gemini API usage tracking, cost allocation | Important for unit economics but not for functionality. |

---

## Detailed Recommendations

### 1. Observability & Monitoring

**Current state:** Custom `Logger` class writes structured JSON to console. No external log aggregation, no error tracking, no APM, no alerting. The `/health/ready` endpoint checks only DB connectivity (missing AI readiness -- noted as TODO in source).

**Recommended additions:**

| Tool | Purpose | Priority | Effort |
|---|---|---|---|
| **Sentry** (backend + frontend) | Error tracking, performance monitoring, session replay | CRITICAL | 2-3 hours |
| **OpenTelemetry** | Distributed tracing for HTTP + Socket.io + AI calls | MEDIUM | 4-6 hours |
| **Log shipping** (stdout to Datadog/Loki) | Log aggregation with search and alerting | MEDIUM | 2-4 hours (infra config) |
| **Uptime monitoring** (Better Uptime/Checkly) | External health check pinging | MEDIUM | 1 hour |

**Architecture notes:**
- Sentry integrates as Express middleware (`@sentry/node`) and Next.js plugin (`@sentry/nextjs`). Add to `backend/src/app.ts` as first middleware. Source maps upload during CI build.
- OpenTelemetry wraps the existing Logger output. Instrument Drizzle queries, LangChain calls, and Socket.io events.
- Log shipping requires zero code changes -- configure container runtime to forward stdout to aggregator.
- Complete the health check TODO: add Gemini API ping and checkpointer status to `/health/ready` in `backend/src/routes/health.routes.ts`.

### 2. Background Job Processing

**Current state:** All processing is synchronous. When a user sends a message, the Socket.io handler calls `chatService.processMessage()` which blocks until the AI responds. No queue, no retry, no dead letter handling.

**Recommended additions:**

| Tool | Purpose | Priority | Effort |
|---|---|---|---|
| **BullMQ** + Redis | Async job queue for AI tasks, image processing, PDF generation | HIGH | 6-8 hours |
| **Job types needed** | `ai:process-message`, `media:optimize-image`, `doc:generate-plan`, `email:send-notification` | HIGH | Per-job |

**Architecture notes:**
- BullMQ uses the Redis instance already in docker-compose.
- Create `backend/src/jobs/` directory following existing service pattern.
- `backend/src/jobs/queue.ts` -- Queue configuration and connection.
- `backend/src/jobs/workers/` -- Worker implementations per job type.
- Socket.io handler enqueues job, job worker emits results back via Socket.io (using Redis adapter for cross-instance).
- Critical for Phase 4 (RENDER) where image generation/analysis can take 10-30 seconds.

### 3. AI Infrastructure Enhancements

**Current state:** Four Gemini model configurations (chat, vision, structured, streaming). ReAct agent with 4 tools. No cost tracking, no fallback models, no prompt versioning, no response caching.

**Recommended additions:**

| Enhancement | Purpose | Priority | Effort |
|---|---|---|---|
| **AI response caching** | Cache identical queries (Redis) to reduce API costs and latency | MEDIUM | 3-4 hours |
| **Prompt versioning** | Track prompt changes, A/B test, rollback bad prompts | MEDIUM | 2-3 hours |
| **Model fallback** | Switch to backup model if Gemini is down | MEDIUM | 2-3 hours |
| **Cost tracking per session** | Log token usage, estimate cost per renovation session | LOW | 3-4 hours |
| **Guardrails / Content filtering** | Prevent prompt injection, filter inappropriate AI responses | MEDIUM | 4-6 hours |

**Architecture notes:**
- Response caching: Hash (session_phase + last_N_messages + user_message) as cache key. Short TTL (5 min). Saves money on repeated questions.
- Prompt versioning: Add version field to `backend/src/config/prompts.ts`, store active version in DB, log which version generated each response.
- Guardrails: Add pre/post processing middleware in `ChatService.processMessage()`. Pre: sanitize user input, check for injection patterns. Post: validate AI response format, filter harmful content.

### 4. Communication Layer (Email/Notifications)

**Current state:** Zero communication outside Socket.io chat. No email, no push notifications, no SMS.

**Recommended additions:**

| Tool | Purpose | Priority | Effort |
|---|---|---|---|
| **Resend** (or SendGrid) | Transactional email (welcome, plan delivery, payment receipt) | HIGH | 4-6 hours |
| **Push notifications** (web-push) | Session updates when user is away | LOW | 4-6 hours |
| **In-app notification system** | Persistent notifications for phase transitions, contractor responses | MEDIUM | 6-8 hours |

**Architecture notes:**
- Create `backend/src/services/email.service.ts` following existing service pattern.
- Use React Email for templates (shares component model with frontend).
- Trigger emails from phase transitions: PLAN complete -> send plan PDF. PAYMENT confirmed -> send receipt.
- Queue emails through BullMQ (never send synchronously in request path).

### 5. Security Hardening

**Current state:** Supabase JWT auth (optional), CORS restricted to frontend URL, 10MB payload limits, in-memory rate limiting. No CSRF, no content security policy, no input sanitization beyond Zod validation. Hardcoded Supabase anon key in docker-compose.

**Recommended additions:**

| Enhancement | Purpose | Priority | Effort |
|---|---|---|---|
| **Enforce authentication** | Mandatory auth on all mutation routes | CRITICAL | 3-4 hours |
| **Row-level security** | Users can only access their own sessions | CRITICAL | 2-3 hours |
| **Helmet.js** | Security headers (CSP, HSTS, X-Frame-Options) | MEDIUM | 1 hour |
| **CSRF protection** | Prevent cross-site request forgery | MEDIUM | 2 hours |
| **Secret management** | Move secrets to GCP Secret Manager / AWS Secrets Manager | MEDIUM | 3-4 hours (infra) |
| **Input sanitization** | DOMPurify + prompt injection prevention | MEDIUM | 3-4 hours |
| **Dependency scanning** | `npm audit` in CI, Snyk/Dependabot for vulnerability alerts | MEDIUM | 1-2 hours |

**Architecture notes:**
- Auth enforcement: Update `backend/src/middleware/auth.middleware.ts` to be non-optional. Add session ownership validation in controllers.
- RLS: Add Drizzle query filters `WHERE userId = currentUserId` in all service methods. Consider Supabase RLS policies at DB level.
- Helmet: Single line addition to `backend/src/app.ts` -- `app.use(helmet())`.
- Remove hardcoded key from `docker-compose.yml`, replace with `${SUPABASE_ANON_KEY}` env reference.

### 6. Performance & Caching

**Current state:** No caching. Message history loaded from DB on every message (last 20). No connection pool tuning. Default pg pool settings. Streaming response accumulated in memory.

**Recommended additions:**

| Enhancement | Purpose | Priority | Effort |
|---|---|---|---|
| **Redis cache (message history)** | Cache recent messages per session, invalidate on new message | CRITICAL | 3-4 hours |
| **Redis cache (session/phase)** | Cache session phase to avoid DB lookup per message | MEDIUM | 2 hours |
| **Connection pool tuning** | Set max 20-50 connections, idle timeout, monitoring | CRITICAL | 1-2 hours |
| **Shared checkpointer pool** | LangGraph checkpointer shares connection pool with main DB | HIGH | 2-3 hours |
| **Response streaming optimization** | Stream to client without accumulating full response in memory | MEDIUM | 3-4 hours |
| **Database indexes** | Add composite indexes on (sessionId, createdAt) for message queries | MEDIUM | 1 hour |

**Architecture notes:**
- Create `backend/src/config/redis.ts` with ioredis client (reuse for BullMQ, Socket.io adapter, caching, rate limiting).
- Create `backend/src/services/cache.service.ts` with get/set/invalidate pattern.
- Pool tuning: Update `backend/src/db/index.ts` to set `max: 30, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000`.
- Index migration: `CREATE INDEX idx_messages_session_created ON chat_messages(session_id, created_at DESC)`.

### 7. Analytics & Business Intelligence

**Current state:** None. No user behavior tracking, no session funnel metrics, no phase completion rates.

**Recommended additions:**

| Tool | Purpose | Priority | Effort |
|---|---|---|---|
| **PostHog** (or Mixpanel) | User behavior analytics, session funnels, feature usage | LOW | 3-4 hours |
| **Custom metrics** | Phase completion rates, avg session duration, AI response times | LOW | 4-6 hours |
| **Business dashboards** | Admin panel for key metrics | LOW | 8-12 hours |

**Architecture notes:**
- PostHog has both frontend (JS SDK) and backend (Node SDK) libraries.
- Track key events: `session_created`, `phase_transitioned`, `message_sent`, `plan_generated`, `payment_completed`.
- Integrate with existing phase transition logic in session service.

### 8. Developer Experience

**Current state:** Strong TypeScript setup, Vitest testing, ESLint, pnpm workspaces. But: no frontend tests, no E2E tests, no pre-commit hooks, no CI quality gates.

**Recommended additions:**

| Enhancement | Purpose | Priority | Effort |
|---|---|---|---|
| **Husky + lint-staged** | Pre-commit hooks for lint, type-check, test | MEDIUM | 1-2 hours |
| **GitHub Actions CI** | Automated testing, coverage, lint on PR | MEDIUM | 3-4 hours |
| **Playwright E2E tests** | Full flow testing (frontend -> backend -> DB) | MEDIUM | 8-12 hours |
| **Frontend component tests** | @testing-library/react for critical components | MEDIUM | 6-8 hours |
| **API contract tests** | Supertest for all REST endpoints | HIGH | 4-6 hours |
| **Database seed script** | Consistent development data for testing | MEDIUM | 2-3 hours |

**Architecture notes:**
- CI pipeline: lint -> type-check -> unit tests -> integration tests (testcontainers) -> coverage check (80% threshold).
- Playwright tests: Cover the full renovation flow from session creation through chat interaction.
- The codebase already has testcontainers configured for integration tests -- extend this pattern.

### 9. Content & Media Pipeline

**Current state:** Basic file upload to Supabase Storage via AssetService. Client-side image compression (browser-image-compression). No server-side processing, no virus scanning, no thumbnails.

**Recommended additions:**

| Enhancement | Purpose | Priority | Effort |
|---|---|---|---|
| **Image optimization pipeline** | Server-side resize, format conversion (WebP/AVIF), thumbnail generation | HIGH | 4-6 hours |
| **Virus scanning** | ClamAV or cloud-based scanning for uploaded files | MEDIUM | 3-4 hours |
| **CDN for assets** | Serve uploaded images through CDN with caching headers | LOW | 2-3 hours (infra) |
| **PDF generation** | Renovation plans, checklists, contractor briefs as downloadable PDFs | HIGH | 6-8 hours |

**Architecture notes:**
- Image pipeline: BullMQ job triggered after upload. Worker resizes to standard dimensions, generates thumbnails, converts to WebP.
- PDF generation: Use `@react-pdf/renderer` (shares React component model) or Puppeteer for HTML-to-PDF.
- Store processed assets back to Supabase Storage with standardized naming: `sessions/{sessionId}/rooms/{roomId}/{size}_{filename}`.

---

## Integration Architecture Map

```
                                    [Frontend - Next.js 16]
                                           |
                              HTTP REST + Socket.io WebSocket
                                           |
                                    [Backend - Express]
                                           |
                    +----------+-----------+-----------+----------+
                    |          |           |           |          |
               [Sentry]  [Helmet]   [Auth MW]   [Rate Limit]  [CORS]
                    |          |           |        (Redis)       |
                    +----------+-----------+-----------+----------+
                                           |
                    +----------+-----------+-----------+----------+
                    |          |           |           |          |
              [Controllers] [Socket.io] [BullMQ]   [Cron]    [Webhooks]
                    |       (Redis       Workers             (Stripe)
                    |        Adapter)      |
                    +----------+-----------+-----------+
                               |                       |
                          [Services]              [Job Workers]
                               |                       |
                    +----------+-----------+-----------+----------+
                    |          |           |           |          |
              [ChatService] [Email]  [AssetService] [PDF Gen] [Cache]
              (LangChain    (Resend)  (Image         (React    (Redis)
               ReAct Agent)           Pipeline)       PDF)
                    |
              [Gemini AI] --- [Guardrails] --- [Cost Tracking]
                    |
              [LangGraph Checkpointer] --- (Postgres, shared pool)
                    |
              [PostgreSQL] --- [Drizzle ORM] --- [Connection Pool (tuned)]
                                                        |
                                                   [Redis 7]
                                            (cache, queue, pubsub,
                                             rate limit, socket adapter)
```

**Key integration point:** Redis becomes the central nervous system. It serves six purposes: caching, job queues (BullMQ), Socket.io adapter, rate limiting, session store, and pub/sub for real-time events. A single Redis instance (or Redis Cluster at scale) connects all these concerns through the existing docker-compose Redis service that currently sits unused.

---

## Implementation Roadmap

### Phase I: Production Safety (Week 1-2)
**Rationale:** Cannot deploy without these. Zero infrastructure visibility is unacceptable.
**Delivers:** Error tracking, distributed rate limiting, connection pool safety, auth enforcement.
**Addresses:** All CRITICAL items from priority matrix.
**Avoids:** "Flying blind in production" pitfall, data leakage between users.

Tasks:
1. Sentry integration (backend + frontend)
2. Redis client setup (`backend/src/config/redis.ts`)
3. Redis-backed rate limiting (replace in-memory)
4. Socket.io Redis adapter
5. Connection pool tuning (pg max connections, idle timeout)
6. Enforce LangGraph postgres checkpointer in production
7. Auth middleware enforcement on all mutation routes
8. Session ownership validation (RLS-like query filters)
9. Helmet.js security headers
10. Complete `/health/ready` endpoint (AI + Redis checks)

### Phase II: Operational Efficiency (Week 2-3)
**Rationale:** Needed before Phase 3-4 features which involve heavy AI workloads.
**Delivers:** Background jobs, caching, database performance.
**Uses:** Redis (from Phase I), existing service patterns.
**Implements:** Job queue architecture, cache layer.

Tasks:
1. BullMQ setup with Redis
2. Message history caching (Redis)
3. Session/phase caching (Redis)
4. Database index optimization
5. Shared checkpointer connection pool
6. Image processing job worker (for Phase 2 uploads)
7. API contract tests (supertest for all REST endpoints)
8. Pre-commit hooks (Husky + lint-staged)

### Phase III: Communication & Documents (Week 3-4)
**Rationale:** Phase 3 (PLAN) needs PDF generation. Phase 6 (PAYMENT) needs email.
**Delivers:** Email system, PDF generation, notification foundation.
**Depends on:** BullMQ from Phase II (emails and PDFs are async jobs).

Tasks:
1. Email service (Resend or SendGrid)
2. Email templates (React Email)
3. PDF generation service (renovation plans, checklists)
4. Triggered notifications on phase transitions
5. Stripe webhook handler implementation

### Phase IV: Observability & AI Hardening (Week 4-5)
**Rationale:** By now there are real users. Need deep visibility and AI safety.
**Delivers:** Distributed tracing, log aggregation, AI guardrails, prompt versioning.

Tasks:
1. OpenTelemetry instrumentation
2. Log aggregation pipeline
3. AI guardrails (input sanitization, output filtering)
4. Prompt versioning system
5. Model fallback configuration
6. AI cost tracking per session

### Phase V: Growth & Polish (Week 5+)
**Rationale:** Product-market fit features. Only after core is solid.
**Delivers:** Analytics, E2E tests, feature flags, admin dashboard.

Tasks:
1. PostHog analytics integration
2. Playwright E2E test suite
3. Feature flags system
4. Admin metrics dashboard
5. CDN for uploaded assets
6. Frontend component test coverage

### Phase Ordering Rationale

- **Phase I before everything** because you cannot safely add features to a system you cannot observe or secure.
- **Phase II before III** because email and PDF generation require the job queue infrastructure.
- **Phase III before IV** because users need communication before you need deep tracing.
- **Phase IV after real users** because observability investment pays off when there is traffic to observe.
- **Phase V is ongoing** and can be parallelized with other work once the foundation is solid.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase II (BullMQ):** Socket.io + BullMQ + Redis adapter interaction patterns need careful design to avoid race conditions. Research LangChain async streaming with job queues.
- **Phase III (PDF generation):** Evaluate `@react-pdf/renderer` vs Puppeteer vs Playwright PDF for renovation plan documents. Template complexity matters.
- **Phase IV (AI Guardrails):** Prompt injection is an active research area. Review latest techniques (2025-2026) for LLM safety layers.

Phases with standard patterns (skip deep research):
- **Phase I (Production Safety):** Sentry, Redis, Helmet are well-documented with Express.js. Follow official docs.
- **Phase V (Analytics):** PostHog/Mixpanel have straightforward Next.js + Express integrations.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing codebase analysis from 2026-02-09 provides exact versions, file locations, and patterns |
| Integration Gaps | HIGH | Cross-referenced current INTEGRATIONS.md (zero error tracking, zero caching code, zero email) against production SaaS requirements |
| Architecture | HIGH | Existing ARCHITECTURE.md maps all layers, data flows, and entry points clearly |
| Pitfalls | HIGH | CONCERNS.md explicitly lists tech debt, security issues, performance bottlenecks, and scaling limits |
| Implementation Effort | MEDIUM | Estimates based on typical Express/Next.js integration complexity, but actual effort depends on edge cases |
| Phase 3-4 Requirements | MEDIUM | PDF generation and advanced AI workloads are inferred from phase descriptions, not from implemented code |

**Overall confidence:** HIGH

### Gaps to Address

- **Redis configuration for production:** docker-compose has Redis but no persistence config, no password, no maxmemory policy. Need production Redis configuration (or managed Redis service selection).
- **Deployment target unclear:** Backend runs in Docker but target platform (AWS ECS, GCP Cloud Run, Railway, Fly.io) affects infrastructure integration choices (log shipping, secret management, Redis hosting).
- **Stripe implementation depth:** The payment phase is listed but has zero implementation. Need full Stripe webhook flow design, not just the library installation.
- **Multi-tenancy model:** Current schema supports nullable userId. The transition to mandatory auth needs careful migration planning for existing anonymous sessions.
- **AI model costs at scale:** No data on Gemini API costs per session. Need to estimate before committing to caching strategy and cost tracking granularity.
- **Frontend test strategy:** Vitest is configured for frontend but zero tests exist. Need to decide on testing boundaries (component vs integration vs E2E) before investing effort.

---

## Sources

### Primary (HIGH confidence)
- `.planning/codebase/INTEGRATIONS.md` -- Complete integration audit dated 2026-02-09
- `.planning/codebase/ARCHITECTURE.md` -- Full architecture analysis with data flows
- `.planning/codebase/STACK.md` -- Exact dependency versions and configurations
- `.planning/codebase/CONCERNS.md` -- Tech debt, security issues, performance bottlenecks, scaling limits

### Secondary (HIGH confidence)
- `.planning/codebase/STRUCTURE.md` -- Directory layout and where to add new code
- `.planning/codebase/TESTING.md` -- Test patterns, coverage config, gaps
- `.planning/codebase/CONVENTIONS.md` -- Code style, patterns, module design
- `CLAUDE.md` -- Project overview, commands, architecture summary

### Tertiary (MEDIUM confidence)
- Production SaaS best practices for Node.js/Express applications (industry standard patterns)
- LangChain/LangGraph documentation for async processing patterns
- BullMQ, Sentry, Resend official documentation for integration patterns

---
*Research completed: 2026-02-13*
*Ready for roadmap: yes*
*5 parallel research agents spawned -- findings synthesized from codebase analysis files*
