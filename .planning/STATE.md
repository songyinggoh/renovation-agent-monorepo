# Planning State

## Current Position

Phase: phase-5 (NOT STARTED)
Plan: —
Status: Phase 4 complete. All 5 plans executed and verified. Ready to begin Phase 5.
Last activity: 2026-04-18 - Closed Phase 4, committed remaining deliverables

Progress: ░░░░░░░░░░░░░ (Phase 5 not started)

## Completed (Recent)

- **Phase 4 Plan 4-04 (Wave 4 — Frontend):**
  - frontend/hooks/usePayment.ts: useCreateCheckout, useDevComplete mutation hooks
  - frontend/components/payment/payment-panel.tsx: Multi-state payment UI component
  - frontend/hooks/useSocketQuerySync.ts: payment:completed/failed Socket.io listeners
  - frontend/components/session/session-page-client.tsx: PaymentPanel integration
  - Summary: .planning/phases/phase-4-payment/4-04-SUMMARY.md

- **Phase 4 Plan 4-03 (Wave 3 — Security Hardening):**
  - backend/src/middleware/rate-limit.middleware.ts: checkoutLimiter (5 req/10 min per IP)
  - backend/src/routes/payment.routes.ts: checkoutLimiter wired to POST /payments/checkout
  - backend/src/services/render.service.ts: isPaid entitlement gate in requestRender()
  - backend/src/services/document.service.ts: isPaid gate in generateChecklist() + generatePlan()
  - backend/tests/unit/payment/payment.service.test.ts: 7 tests (idempotency, fulfillment, dev bypass)
  - backend/tests/unit/payment/payment-security.test.ts: 11 tests (phase gate, webhook, B1/B4, S3 audit, entitlement)
  - 974 total tests passing (65 test files)
  - Summary: .planning/phases/phase-4-payment/4-03-SUMMARY.md

- **Phase 4 Plan 4-02 (Wave 2 — Backend Core):**
  - backend/src/services/payment.service.ts: createCheckoutSession, fulfillPayment (idempotent), devCompletePayment, getPaymentStatus
  - backend/src/controllers/payment.controller.ts: handleCreateCheckout (phase gate), handleStripeWebhook (raw body + async), handleDevComplete, handleGetPaymentStatus
  - backend/src/routes/payment.routes.ts: checkout + status with optionalAuthMiddleware + verifySessionOwnership
  - backend/src/app.ts: express.raw webhook (line 100) BEFORE express.json (line 107), paymentRoutes at /api, dev-complete inside NODE_ENV guard
  - All SECURITY-CHECKLIST controls W1-W8, E4-E6, B1, B3, B5, B6, D1-D3, S3-S4 satisfied
  - Summary: .planning/phases/phase-4-payment/4-02-SUMMARY.md

- **Phase 4 Plan 4-01 (Wave 1 — Infrastructure):**
  - stripe ^18.5.0 installed in backend
  - STRIPE_PRICE_AMOUNT_CENTS added to env Zod schema (default 4900)
  - backend/src/config/stripe.ts: lazy getStripe() singleton with isPaymentsEnabled() guard
  - PaymentCompletedPayload + PaymentFailedPayload added to shared-types socket-events
  - payment:completed + payment:failed added to ServerToClientEvents
  - Migration 0009: UNIQUE constraint on stripe_payment_intent_id
  - Summary: .planning/phases/phase-4-payment/4-01-SUMMARY.md

- **Phase 4 Research:**
  - RESEARCH.md: Full Stripe Checkout Session architecture, 6 code patterns, anti-patterns, pitfalls
  - SECURITY-CHECKLIST.md: 28 MUST-HAVE + 19 SHOULD-HAVE security requirements
  - 5 PLAN files created covering infrastructure, backend, security, frontend, hardening

## Next Steps

- Plan and execute Phase 5

## Accumulated Decisions

| Decision | Context | Rationale |
|----------|---------|-----------|
| Webhook route on app directly (not in payment router) | Plan 4-02 app.ts | Ensures it is always registered before global express.json(); router mounting order not guaranteed |
| Dev-complete gated at route registration in NODE_ENV block | Plan 4-02 app.ts (B1) | Route does not exist in production routing table — not just guarded in handler |
| emitToSession() for Socket.io events in payment service | Plan 4-02 | Matches render/doc pattern; handles null io gracefully |
| checkoutLimiter: 5 req/10 min per IP | Plan 4-03 (E1) | Stricter than authLimiter; limits Stripe API cost abuse; allows retry after cancellation |
| PAID_REQUIRED_PHASES = ['PAYMENT','COMPLETE','ITERATE'] | Plan 4-03 entitlement | PLAN/RENDER are free preview; gate activates at PAYMENT transition |
| Entitlement gate in service layer not controller | Plan 4-03 | Cannot be bypassed via alternative API paths; consistent with S3 audit |
| Dev-complete B4 test via static analysis not dynamic import | Plan 4-03 | vi.resetModules() caused test isolation pollution; readFileSync is reliable |
| Stripe v18.5.0 installed (not v20.x) | Plan 4-01 execution | npm registry serves v18 as current major; v18 pins API version automatically, same behavior as v20 described in plan |
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

Last session: 2026-03-18
Stopped at: Completed Plan 4-03 (security hardening: checkoutLimiter, entitlement gates, 18 tests)
Resume file: None

## Completed Plans

| Plan | Summary |
|------|---------|
| 3A-01 | Schema foundation: planData JSONB column, RenovationPlanSchema, doc:generate-plan queue, env var |
| 3A-02 | DocumentService + Handlebars templates for checklist and plan PDFs |
| 3A-03 | LangGraph tools: save_plan_state + generate_document, ALLOWED_TOOLS, phase prompts |
| 3A-04 | Doc worker (Puppeteer), REST API (generate/list/download), graceful shutdown browser pool |
| 4-01 | Stripe SDK v18, getStripe() lazy singleton, STRIPE_PRICE_AMOUNT_CENTS env var, PaymentCompletedPayload shared-types, DB unique constraint |
| 4-02 | Payment service (createCheckoutSession/fulfillPayment/devCompletePayment/getPaymentStatus), controller (4 handlers), routes (checkout+status), app.ts (webhook raw body before json, dev-complete NODE_ENV gate) |
| 4-03 | checkoutLimiter (5/10 min, E1), isPaid entitlement gates in render.service + document.service, 18 new unit tests (idempotency/phase gate/B1B4/S3 audit/entitlement), 974 tests passing |

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
- **Phase 4**: Payment Integration — Stripe Checkout, webhook fulfillment, entitlement gates, frontend PaymentPanel (committed 2026-04-18)
