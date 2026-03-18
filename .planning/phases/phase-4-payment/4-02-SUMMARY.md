---
phase: phase-4-payment
plan: "4-02"
subsystem: payments
tags: [stripe, express, webhook, drizzle, socket-io, auth-middleware, phase-gate]

# Dependency graph
requires:
  - phase: phase-4-01
    provides: getStripe() singleton, isPaymentsEnabled(), STRIPE_PRICE_AMOUNT_CENTS, PaymentCompletedPayload shared-types, sessions.schema stripePaymentIntentId unique constraint
  - phase: phase-3-renders-documents
    provides: emitToSession() socket-emitter utility, optionalAuthMiddleware, verifySessionOwnership, db + renovationSessions schema
provides:
  - backend/src/services/payment.service.ts with createCheckoutSession, fulfillPayment, devCompletePayment, getPaymentStatus
  - backend/src/controllers/payment.controller.ts with handleCreateCheckout, handleStripeWebhook, handleDevComplete, handleGetPaymentStatus
  - backend/src/routes/payment.routes.ts wiring checkout + status routes with optionalAuthMiddleware + verifySessionOwnership
  - backend/src/app.ts: webhook route with express.raw() mounted BEFORE express.json(); paymentRoutes at /api; dev-complete inside NODE_ENV guard
affects:
  - phase-4-03 (security hardening adds rate limiters to routes built here)
  - phase-4-04 (frontend payment hook calls POST /api/payments/checkout/:sessionId)
  - phase-4-05 (integration tests verify the full pipeline built here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Webhook route with express.raw() mounted before global express.json() (prevents Stripe SignatureVerificationError)
    - Phase gate in controller (query session.phase before creating Stripe session — E5)
    - Idempotency guard in fulfillPayment (isPaid check before DB update — W5)
    - res.json({ received: true }) before async processing (W4 — avoid Stripe timeouts)
    - Dev bypass route gated at route registration time inside NODE_ENV !== 'production' block (B1 — not inside handler)
    - payment_status !== 'unpaid' check before fulfillPayment (W6 — deferred payment methods)

key-files:
  created:
    - backend/src/services/payment.service.ts
    - backend/src/controllers/payment.controller.ts
    - backend/src/routes/payment.routes.ts
  modified:
    - backend/src/app.ts (webhook route, payment routes, dev-complete guard)

key-decisions:
  - "Webhook route mounted directly on app (not in payment.routes.ts router) to guarantee BEFORE express.json() ordering"
  - "dev-complete route inside NODE_ENV !== 'production' block in app.ts (matches Bull Board pattern) — not a handler-level check"
  - "Phase gate check in controller, not middleware — consistent with existing pattern; HTTP routes for session data must remain unblocked"
  - "emitToSession() used for Socket.io events (matches render/doc pattern in codebase)"
  - "paymentIntentId never logged — only written to DB (SECURITY-CHECKLIST D1)"

patterns-established:
  - "Payment service as the single write path for isPaid=true (S3 audit compliance)"
  - "Webhook handler: verify sig → return 200 → process async (Stripe best practice)"

requirements-completed: [W1, W2, W3, W4, W5, W6, W7, W8, E4, E5, E6, B1, B3, B5, B6, D1, D2, D3, S3, S4]

# Metrics
duration: 5min
completed: 2026-03-18
---

# Phase 4 Plan 02: Backend Core Summary

**Stripe Checkout + webhook fulfillment pipeline: payment service (createCheckoutSession/fulfillPayment/devCompletePayment/getPaymentStatus), controller with phase gate + idempotency + raw-body webhook handler, routes with ownership middleware, and express.raw webhook mounting BEFORE express.json in app.ts**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-18T19:48:31Z
- **Completed:** 2026-03-18T19:53:30Z
- **Tasks:** 2
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

### Task 4.2.1 — Payment Service (`payment.service.ts`)

- `createCheckoutSession()`: Stripe Checkout Session with `price_data` inline (no dashboard setup), `client_reference_id` as primary session tie-back, `metadata.renovationSessionId` as redundant backup, conditional `customer_email`
- `fulfillPayment()`: idempotency guard (query `isPaid` first), atomic single-call DB update (`isPaid + stripePaymentIntentId + phase=COMPLETE + updatedAt`), Socket.io events via `emitToSession()`, no `paymentIntentId` in logs (D1), no customer email logged (D2)
- `devCompletePayment()`: mirrors `fulfillPayment()` without Stripe, same idempotency guard, returns `{ devBypass: true, warning: 'THIS ENDPOINT DOES NOT EXIST IN PRODUCTION', sessionId }` (B5)
- `getPaymentStatus()`: query `isPaid + phase`, throws with `statusCode: 404` on missing session
- Security controls satisfied: D1, D2, D3, S3, W5

### Task 4.2.2 — Controller, Routes, and app.ts wiring

- `payment.controller.ts`: four handler functions with proper Express async patterns; `handleStripeWebhook` returns 200 immediately then processes async (W4); payment_status !== 'unpaid' guard (W6); handles `checkout.session.async_payment_succeeded` (W8); unhandled events logged with type + id (W11)
- `payment.routes.ts`: checkout + status routes with `optionalAuthMiddleware` + `verifySessionOwnership` (E4, E7, S4); clear comments explaining why webhook and dev-complete are NOT in this router
- `app.ts`: webhook route with `express.raw({ type: 'application/json' })` at line 100, global `express.json()` at line 107 (raw line < json line — critical ordering W2); `paymentRoutes` mounted at `/api`; `dev-complete` route inside `if (env.NODE_ENV !== 'production')` block with `optionalAuthMiddleware` + `verifySessionOwnership` (B1, B3) and a `logger.warn` startup message (B6)

## Task Commits

Each task was committed atomically:

1. **Task 4.2.1: Create payment service** — `f5b9cab` (feat)
2. **Task 4.2.2: Create payment controller, routes, and wire webhook in app.ts** — `4801365` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `backend/src/services/payment.service.ts` — Payment service: createCheckoutSession, fulfillPayment, devCompletePayment, getPaymentStatus
- `backend/src/controllers/payment.controller.ts` — HTTP handlers: handleCreateCheckout (phase gate), handleStripeWebhook (sig verify + async fulfill), handleDevComplete, handleGetPaymentStatus
- `backend/src/routes/payment.routes.ts` — Express router: POST /payments/checkout/:sessionId, GET /payments/status/:sessionId (both with optionalAuthMiddleware + verifySessionOwnership)
- `backend/src/app.ts` — Webhook route (express.raw, before express.json), paymentRoutes mount, dev-complete inside NODE_ENV guard

## Decisions Made

- **Webhook route on app directly (not in router)**: Ensures it is always registered before `express.json()`. If mounted in the router with `app.use('/api', paymentRoutes)`, the global `express.json()` could run first on the request.
- **Dev-complete in app.ts NODE_ENV block (not handler-level check)**: Matches the Bull Board gate pattern already in the codebase. Route registration-time gating means the route literally does not exist in production routing table (B1).
- **Phase gate in controller, not middleware**: PAYMENT phase is a chat-first flow; HTTP routes for fetching session data must remain unblocked. Controller gate only fires on the POST /checkout endpoint.
- **emitToSession() over getSocketServer().to().emit()**: `emitToSession()` is the established pattern in the codebase (render.service, doc.worker), handles null io gracefully.

## Deviations from Plan

None — plan executed exactly as written.

## Security Controls Satisfied

| Control | Status | Implementation |
|---------|--------|----------------|
| W1 | DONE | `getStripe().webhooks.constructEvent()` (timing-safe HMAC) |
| W2 | DONE | `express.raw()` at line 100, `express.json()` at line 107 |
| W3 | DONE | sig header presence check before constructEvent |
| W4 | DONE | `res.json({ received: true })` before async fulfillment |
| W5 | DONE | `existing.isPaid` check in `fulfillPayment()` |
| W6 | DONE | `session.payment_status !== 'unpaid'` guard |
| W7 | DONE | SDK default tolerance (300s) — not overridden |
| W8 | DONE | `checkout.session.async_payment_succeeded` handled |
| E4 | DONE | `verifySessionOwnership` on checkout route |
| E5 | DONE | `session.phase !== 'PAYMENT'` check in controller |
| E6 | DONE | dev-complete mounted only in `NODE_ENV !== 'production'` block |
| B1 | DONE | Route registration-time gate (not handler-level) |
| B3 | DONE | `optionalAuthMiddleware` + `verifySessionOwnership` on dev-complete |
| B5 | DONE | Response includes `warning: 'THIS ENDPOINT DOES NOT EXIST IN PRODUCTION'` |
| B6 | DONE | `logger.warn('DEV BYPASS: ...')` on startup |
| D1 | DONE | paymentIntentId not logged (DB write only) |
| D2 | DONE | customer.email not logged |
| D3 | DONE | Raw Stripe session object never passed to logger |
| S3 | DONE | Only fulfillPayment + devCompletePayment set isPaid=true |
| S4 | DONE | verifySessionOwnership on checkout + status + dev-complete |

## Next Phase Readiness

- Phase 4-03 (security hardening) can proceed: routes exist for rate limiter application
- Phase 4-04 (frontend) can proceed: `POST /api/payments/checkout/:sessionId` and `GET /api/payments/status/:sessionId` are live; `POST /api/payments/dev-complete/:sessionId` available for dev testing
- Phase 4-05 (integration tests) can proceed: full pipeline built; webhook fulfillment logic ready to test with Stripe CLI

---
*Phase: phase-4-payment*
*Completed: 2026-03-18*
