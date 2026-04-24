---
phase: phase-4-payment
plan: "4-03"
subsystem: payments
tags: [stripe, rate-limiting, entitlement-gates, security, vitest, express, drizzle]

# Dependency graph
requires:
  - phase: phase-4-02
    provides: payment.service.ts (fulfillPayment/devCompletePayment), payment.controller.ts (handleCreateCheckout/handleStripeWebhook), payment.routes.ts, app.ts webhook mounting
  - phase: phase-3-renders-documents
    provides: render.service.ts (requestRender), document.service.ts (generateChecklist/generatePlan), RenderService class
provides:
  - backend/src/middleware/rate-limit.middleware.ts: checkoutLimiter export (5 req/10 min per IP)
  - backend/src/routes/payment.routes.ts: checkoutLimiter wired to POST /payments/checkout/:sessionId
  - backend/src/services/render.service.ts: isPaid entitlement gate in requestRender()
  - backend/src/services/document.service.ts: isPaid entitlement gate in generateChecklist() and generatePlan()
  - backend/tests/unit/payment/payment.service.test.ts: 7 unit tests for payment service
  - backend/tests/unit/payment/payment-security.test.ts: 11 security tests (phase gate, webhook, dev-complete, S3 audit, entitlement)
affects:
  - phase-4-04 (frontend hits the rate-limited checkout endpoint)
  - phase-4-05 (integration tests rely on gates implemented here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - checkoutLimiter follows createMiddleware(createLimiter()) pattern established in rate-limit.middleware.ts
    - Entitlement gate: PAID_REQUIRED_PHASES array check before enqueueing expensive operations
    - Static analysis tests: readFileSync + string analysis as regression guards for security properties
    - isPaid write-path audit: source-level scan proving only payment.service.ts sets isPaid=true

key-files:
  created:
    - backend/tests/unit/payment/payment.service.test.ts
    - backend/tests/unit/payment/payment-security.test.ts
  modified:
    - backend/src/middleware/rate-limit.middleware.ts (added checkoutLimiter)
    - backend/src/routes/payment.routes.ts (wired checkoutLimiter)
    - backend/src/services/render.service.ts (added session entitlement check + sessions schema import)
    - backend/src/services/document.service.ts (added isPaid gate to generateChecklist and generatePlan)
    - backend/tests/unit/services/render.service.test.ts (updated for new DB call order + mocks)
    - backend/tests/unit/config/app.test.ts (added checkoutLimiter + payment.routes mock + isAuthEnabled)

key-decisions:
  - "5 req/10 min for checkoutLimiter: stricter than authLimiter (10/15 min); prevents Stripe API cost abuse while allowing legitimate retry after cancellation"
  - "PAID_REQUIRED_PHASES = ['PAYMENT','COMPLETE','ITERATE']: PLAN/RENDER phases remain free (the preview experience); gate activates at transition to PAYMENT"
  - "Entitlement gate in service layer (not controller/middleware): ensures no bypass via frontend; consistent with S3 audit requirement"
  - "Dev-complete production guard test uses static analysis (readFileSync) not dynamic import: avoids vi.resetModules() polluting test isolation"
  - "isPaid write-path S3 audit: regex skips comment lines to avoid false positives from documentation strings"

patterns-established:
  - "Entitlement gate before expensive operation: query session.isPaid first, throw immediately if not paid in gated phases"
  - "Security tests as source-level assertions: verify code structure/patterns rather than requiring full app instantiation"

requirements-completed: [E1, B4, S3]

# Metrics
duration: 32min
completed: 2026-03-18
---

# Phase 4 Plan 03: Security Hardening Summary

**Checkout rate limiter (5/10 min), server-side entitlement gates on render and document services (PAID_REQUIRED_PHASES), and comprehensive unit tests for idempotency, phase gate, dev-complete production guard, isPaid write-path audit, and entitlement enforcement**

## Performance

- **Duration:** 32 min
- **Started:** 2026-03-18T20:16:29Z
- **Completed:** 2026-03-18T20:48:35Z
- **Tasks:** 3
- **Files created:** 2, **Files modified:** 6

## Accomplishments

### Task 4.3.1 — Add checkoutLimiter and wire to checkout route

- Added `checkoutLimiter` to `rate-limit.middleware.ts` using the existing `createMiddleware(createLimiter())` pattern
- Config: `keyPrefix: 'checkout'`, `points: 5`, `duration: 10 * 60` (5 requests per 10 minutes per IP)
- Wired to `POST /payments/checkout/:sessionId` in `payment.routes.ts` as the first middleware in the chain (before auth, before ownership — cheapest check first)
- Satisfies SECURITY-CHECKLIST E1

### Task 4.3.2 — Server-side entitlement gates on render and document services

- `render.service.ts requestRender()`: added session query before room check, throws `'Payment required to generate renders in this phase'` when `PAID_REQUIRED_PHASES.includes(session.phase) && !session.isPaid`
- `document.service.ts generateChecklist()` and `generatePlan()`: added same isPaid gate after session fetch in each method
- Entitlement model: `PLAN` and `RENDER` phases are the free preview; gate activates at `PAYMENT`, `COMPLETE`, `ITERATE`
- Comment in both service files documents the preview model and links to roadmap

### Task 4.3.3 — Unit tests for payment service and security controls

**payment.service.test.ts (7 tests):**
- `fulfillPayment` idempotency guard: verifies `db.update` NOT called when `isPaid: true` (W5)
- `fulfillPayment` successful fulfillment: verifies `isPaid: true`, `phase: 'COMPLETE'`, `stripePaymentIntentId`, and both Socket.io events
- `fulfillPayment` missing session ID: returns early when `client_reference_id` and `metadata` both null
- `fulfillPayment` session not found: returns early when DB returns empty array
- `createCheckoutSession`: returns `{ url, checkoutSessionId }` from Stripe mock
- `devCompletePayment` idempotency: returns `{ alreadyPaid: true }` without DB update
- `devCompletePayment` successful bypass: updates DB and emits Socket.io events

**payment-security.test.ts (11 tests):**
- Phase gate: `handleCreateCheckout` returns 400 when session is not in `PAYMENT` phase (E5)
- Phase gate: `handleCreateCheckout` returns 400 when session is already paid
- Webhook: `handleStripeWebhook` returns 400 when `stripe-signature` header missing (W3)
- Webhook: `fulfillPayment` NOT called when `payment_status === 'unpaid'` (W6)
- Dev-complete production guard: static analysis confirms `dev-complete` appears inside `NODE_ENV !== 'production'` block in `app.ts` (B1, B4)
- Dev-complete: controller has no handler-level production guard (B1 negative)
- isPaid write-path audit: source scan of all `src/**/*.ts` files confirms only `payment.service.ts` sets `isPaid: true` in non-comment lines (S3)
- Entitlement: `requestRender` throws `'Payment required'` in PAYMENT phase + unpaid
- Entitlement: `requestRender` succeeds in COMPLETE phase + paid
- Entitlement: `requestRender` succeeds in RENDER phase + unpaid (free preview)

## Task Commits

Each task committed atomically:

1. **Task 4.3.1: Add checkoutLimiter and wire to checkout route** — `208b11a` (feat)
2. **Task 4.3.2: Add server-side entitlement gates on render and document services** — `089f836` (feat)
3. **Task 4.3.3: Unit tests for payment service and security controls** — `36fe26c` (test)

## Files Created/Modified

- `backend/src/middleware/rate-limit.middleware.ts` — Added `checkoutLimiter` export
- `backend/src/routes/payment.routes.ts` — Wired `checkoutLimiter` to checkout route
- `backend/src/services/render.service.ts` — Added `renovationSessions` import + isPaid entitlement gate in `requestRender()`
- `backend/src/services/document.service.ts` — Added isPaid gate to `generateChecklist()` and `generatePlan()`
- `backend/tests/unit/payment/payment.service.test.ts` — NEW: 7 payment service unit tests
- `backend/tests/unit/payment/payment-security.test.ts` — NEW: 11 security-focused tests
- `backend/tests/unit/services/render.service.test.ts` — Updated: sessions schema mock, redis mock, adjusted DB call order
- `backend/tests/unit/config/app.test.ts` — Updated: `checkoutLimiter` in rate-limit mock, `payment.routes.js` stub, `isAuthEnabled` + `isPaymentsEnabled` in env mock

## Decisions Made

- **5 req/10 min checkout limit:** Stricter than auth limiter (10/15 min). A legitimate user clicks "Pay Now" at most 2-3 times. 10-minute window allows retry after Stripe cancellation. Per-IP (not per-session) to keep implementation simple and consistent with other limiters.
- **PAID_REQUIRED_PHASES = ['PAYMENT', 'COMPLETE', 'ITERATE']:** The PLAN and RENDER phase outputs are the free preview. Users can view Phase 3 renders/docs. New generation after entering PAYMENT requires `isPaid=true`.
- **Entitlement gate in service layer:** Not in controller or middleware. Service layer is the authoritative enforcement point that cannot be bypassed by alternative API paths or direct function calls.
- **Dev-complete production guard tested via static analysis:** Dynamic import approach (`vi.resetModules()` + supertest) caused test isolation pollution. Source-level `readFileSync` + string analysis provides the same correctness guarantee without side effects.
- **S3 audit regex skips comment lines:** Pattern `/isPaid\s*[:=]\s*true/` was matching comments like `// requires isPaid=true`. Updated to check `trimStart()` line doesn't begin with `//` or `*`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing render.service tests broke due to new DB select call**

- **Found during:** Task 4.3.3
- **Issue:** Adding the session entitlement check as the first DB call in `requestRender()` shifted all subsequent mock call indices in the existing tests (call 1=room, call 2=rate-limit became call 1=session, call 2=room, call 3=rate-limit)
- **Fix:** Updated `render.service.test.ts` to add sessions schema mock, redis mock, and corrected the `mockDbSelect.mockImplementation()` call counters in all affected tests
- **Files modified:** `backend/tests/unit/services/render.service.test.ts`
- **Commit:** `36fe26c`

**2. [Rule 1 - Bug] app.test.ts broke due to missing checkoutLimiter in rate-limit mock**

- **Found during:** Task 4.3.3
- **Issue:** `app.test.ts` mocked `rate-limit.middleware.js` with only `apiLimiter` and `chatLimiter`. Adding `checkoutLimiter` import to `payment.routes.ts` caused `payment.routes.js` loading to fail with undefined middleware
- **Fix:** Added `checkoutLimiter: passthrough` to rate-limit mock, added `payment.routes.js` stub, added `isAuthEnabled` + `isPaymentsEnabled` to env mock (needed by auth.middleware transitive import)
- **Files modified:** `backend/tests/unit/config/app.test.ts`
- **Commit:** `36fe26c`

**3. [Rule 2 - Missing Critical] isPaid write-path S3 audit regex needed comment-line exclusion**

- **Found during:** Task 4.3.3
- **Issue:** The initial S3 audit regex `/isPaid\s*[:=]\s*true/` matched documentation comments in `render.service.ts` and `document.service.ts` (`// requires isPaid=true`) and produced false positives
- **Fix:** Updated regex logic to skip lines beginning with `//` or `*` before matching
- **Commit:** `36fe26c`

## Security Controls Satisfied

| Control | Status | Implementation |
|---------|--------|----------------|
| E1 | DONE | `checkoutLimiter` (5 req/10 min) on POST /payments/checkout |
| B4 | DONE | Static analysis test + source-level audit confirms NODE_ENV gate |
| S3 | DONE | Write-path audit test confirms only payment.service.ts sets isPaid=true |
| (Entitlement) | DONE | render.service + document.service isPaid gates (roadmap Phase 4 DoD) |

## Test Results

- **Test files:** 65 passed (0 failed)
- **Total tests:** 974 passed (0 failed)
- **New payment tests:** 18 (7 service + 11 security)

## Next Phase Readiness

- Phase 4-04 (frontend) can proceed: checkout endpoint has rate limiter, entitlement gates in place
- Phase 4-05 (integration tests) can proceed: all security controls implemented and verified by unit tests
- Known limitation: isPaid audit test covers non-comment lines only; test schema files and migration files excluded from src/ scan

---
*Phase: phase-4-payment*
*Completed: 2026-03-18*
