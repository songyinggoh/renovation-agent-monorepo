# Planning State

## Current Position

Phase: phase-4-payment (PLANNED)
Status: Research complete, 5 plans created across 5 waves. Ready for execution.
Last activity: 2026-03-19 - Created Phase 4 plans (PLAN-4-01 through PLAN-4-05).

Progress: ░░░░░░░░░░░░░░░░ (0% Phase 4 execution)

## Completed (Recent)

- **Phase 4 Research:**
  - RESEARCH.md: Full Stripe Checkout Session architecture, 6 code patterns, anti-patterns, pitfalls
  - SECURITY-CHECKLIST.md: 28 MUST-HAVE + 19 SHOULD-HAVE security requirements
  - 5 PLAN files created covering infrastructure, backend, security, frontend, hardening

## Next Steps

- Execute Phase 4 plans in wave order (Wave 1 through Wave 5)
- Wave 4 has a human-verify checkpoint (visual payment flow verification)

## Accumulated Decisions

| Decision | Context | Rationale |
|----------|---------|-----------|
| One-time payment per session (not subscription) | Phase 4 payment model | isPaid column already exists; session-based pricing matches product; subscriptions deferred to future |
| Stripe Checkout hosted redirect (not embedded) | Phase 4 checkout UI | Complexity 2/5 vs 3-4/5; no PCI scope; no @stripe/stripe-js needed |
| price_data inline (not pre-created Stripe Price) | Phase 4 checkout | Simpler dev setup; no Stripe Dashboard config required |
| Phase gate in controller (not HTTP middleware) | Phase 4 payment enforcement | PAYMENT phase is chat-first; HTTP routes for session data must remain unblocked |
| Dev bypass mirrors isAuthEnabled() pattern | Phase 4 development | isPaymentsEnabled()===false returns mock response; POST dev-complete bypasses Stripe |
| One migration: unique constraint on stripePaymentIntentId | Schema (SECURITY-CHECKLIST D4) | Prevents duplicate payment claims; PostgreSQL allows multiple NULLs so existing sessions unaffected |
| Preview = Phase 3 output; gate = PAYMENT phase | Entitlement model | Renders/docs from PLAN/RENDER phases are the free preview; new generation after PAYMENT requires isPaid=true |
| Webhook route before express.json() | app.ts ordering | Stripe signature verification requires raw Buffer body; express.json() destroys it |
| Job name 'doc:generate-plan' in queue.add() | generate-document.tool.ts | Matches JobTypes key pattern, consistent with render.service.ts |
| Skip supervisor.ts type errors | Pre-existing in codebase | Not introduced by 3A work, separate dev-agents concern |
| documentService singleton exported from doc.worker.ts | server.ts shutdown | Avoids creating second DocumentService instance; server.ts imports and calls close() |
| DocumentService Browser Pool shutdown before Workers & Queues | server.ts graceful shutdown | Ensures Chromium killed before BullMQ worker closes, preventing orphaned processes |
| 400 on invalid type query param (not empty results) | GET /documents endpoint | Explicit validation fail-fast; empty results would silently mislead callers |

## Blockers / Concerns

- `supervisor.ts` has pre-existing TypeScript errors (AgentGraph type mismatch) - does not affect Phase 4
- Supabase Storage (SUPABASE_DOCUMENTS_BUCKET) must be configured for signed download URLs
- Stripe test-mode keys required for full E2E payment testing (dev bypass works without them)

## Session Continuity

Last session: 2026-03-19
Stopped at: Phase 4 plans created, ready for execution
Resume file: None

## Completed Plans

| Plan | Summary |
|------|---------|
| 3A-01 | Schema foundation: planData JSONB column, RenovationPlanSchema, doc:generate-plan queue, env var |
| 3A-02 | DocumentService + Handlebars templates for checklist and plan PDFs |
| 3A-03 | LangGraph tools: save_plan_state + generate_document, ALLOWED_TOOLS, phase prompts |
| 3A-04 | Doc worker (Puppeteer), REST API (generate/list/download), graceful shutdown browser pool |

## Phase 4 Plans

| Plan | Wave | Title | Depends On |
|------|------|-------|------------|
| 4-01 | 1 | Infrastructure: Stripe SDK, env schema, shared types, config singleton | - |
| 4-02 | 2 | Backend core: payment service, controller, routes, webhook mounting | 4-01 |
| 4-03 | 3 | Security hardening: rate limiter, entitlement gates, tests, production guard | 4-02 |
| 4-04 | 4 | Frontend: payment hook, PAYMENT phase UI, Socket.io listener | 4-02 |
| 4-05 | 5 | Hardening: integration tests, prompt, CSP, runbook, verification | 4-03, 4-04 |

## Deferred from Phase 4 (future phase)

- `subscriptions` table with `remaining_credits` (roadmap 4.2 — replaced by one-time `isPaid`)
- Multiple plan tiers: `RENOVATION_SINGLE`, `RENOVATION_PRO_MONTHLY`
- `customer.subscription.updated` and `invoice.payment_failed` webhook handlers
- Pricing page (standalone route)
- Account page showing plan/credits/billing history
- `processedWebhookEvents` table for event-ID-level idempotency (SECURITY-CHECKLIST W12 SHOULD-HAVE)
- `stripeCheckoutSessionId` column (SECURITY-CHECKLIST D5 SHOULD-HAVE)

## Closed Phases

- **Phase 1**: Chat MVP
- **Phase 2**: Images, Style & Products
- **Phase 3**: Renders & Documents (committed 2026-03-19)
