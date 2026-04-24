---
plan: "4.3"
wave: 3
depends_on: ["4.2"]
title: "Security hardening: rate limiter, phase gate, idempotency tests, production guard test"
files_modified:
  - backend/src/middleware/rate-limit.middleware.ts
  - backend/src/routes/payment.routes.ts
  - backend/src/services/render.service.ts
  - backend/src/services/document.service.ts
  - backend/src/controllers/payment.controller.ts
  - backend/src/__tests__/payment/payment.service.test.ts
  - backend/src/__tests__/payment/payment-security.test.ts
autonomous: true
must_haves:
  truths:
    - "POST /api/payments/checkout has a dedicated rate limiter (stricter than global apiLimiter)"
    - "fulfillPayment() skips if session is already paid (idempotency)"
    - "fulfillPayment() is the ONLY code path that sets isPaid=true (audit-verified)"
    - "render.service.ts requestRender() checks isPaid before allowing render generation for COMPLETE+ phases"
    - "document.service.ts generateDocument() checks isPaid before allowing PDF generation"
    - "Entitlements are enforced server-side — unpaid sessions cannot generate renders or documents"
    - "Unit tests cover: idempotency guard, phase gate, dev-complete production guard, ownership check, entitlement gates"
    - "Dev-complete returns 404 when NODE_ENV=production"
  artifacts:
    - path: "backend/src/middleware/rate-limit.middleware.ts"
      provides: "checkoutLimiter export"
      exports: ["checkoutLimiter"]
    - path: "backend/src/__tests__/payment/payment.service.test.ts"
      provides: "Unit tests for payment service logic"
      contains: "fulfillPayment"
    - path: "backend/src/__tests__/payment/payment-security.test.ts"
      provides: "Security-focused integration tests"
      contains: "dev-complete"
  key_links:
    - from: "backend/src/routes/payment.routes.ts"
      to: "backend/src/middleware/rate-limit.middleware.ts"
      via: "checkoutLimiter applied to checkout route"
      pattern: "checkoutLimiter"
---

<objective>
Add security controls that harden the payment pipeline: a dedicated checkout rate limiter, and comprehensive tests for the idempotency guard, phase gate, ownership enforcement, and dev-complete production guard.

Purpose: Without these controls and their tests, the payment system could be abused (rate flooding), double-fulfilled (idempotency failure), or bypassed in production (dev-complete leak). These are the MUST-HAVE security items from the SECURITY-CHECKLIST.

Output: Updated rate limiter file, updated routes file, two new test files covering payment service logic and security controls.
</objective>

<context>
@.planning/phases/phase-4-payment/4-02-SUMMARY.md
@backend/src/services/payment.service.ts (from Wave 2)
@backend/src/controllers/payment.controller.ts (from Wave 2)
@backend/src/routes/payment.routes.ts (from Wave 2)
@backend/src/app.ts (from Wave 2)
@backend/src/middleware/rate-limit.middleware.ts
@backend/src/middleware/ownership.middleware.ts
@.planning/phases/phase-4-payment/SECURITY-CHECKLIST.md (E1, W5, B1, B4, S3)
</context>

<tasks>

<task id="4.3.1" title="Add checkoutLimiter and wire to checkout route">
  <read_first>
    - backend/src/middleware/rate-limit.middleware.ts -- existing createLimiter/createMiddleware pattern, apiLimiter/chatLimiter/authLimiter exports
    - backend/src/routes/payment.routes.ts -- current route definitions (from Wave 2)
  </read_first>
  <action>
    **1. Add `checkoutLimiter` to `backend/src/middleware/rate-limit.middleware.ts`:**

    After the existing `authLimiter` export, add:

    ```typescript
    /**
     * Strict rate limiter for payment checkout — 5 requests per 10 minutes per IP
     * Prevents Stripe API abuse (each call creates a Checkout Session on Stripe's servers).
     * SECURITY-CHECKLIST E1
     */
    export const checkoutLimiter: RequestHandler = createMiddleware(
      createLimiter({ keyPrefix: 'checkout', points: 5, duration: 10 * 60 }),
      'Too many checkout attempts, please try again later',
    );
    ```

    5 requests per 10 minutes is strict but reasonable -- a legitimate user would click "Pay Now" at most once or twice. The 10-minute window provides a buffer for retries after cancellation.

    **2. Wire `checkoutLimiter` to the checkout route in `backend/src/routes/payment.routes.ts`:**

    Add the import:
    ```typescript
    import { checkoutLimiter } from '../middleware/rate-limit.middleware.js';
    ```

    Update the checkout route to include it:
    ```typescript
    router.post(
      '/payments/checkout/:sessionId',
      checkoutLimiter,
      optionalAuthMiddleware,
      verifySessionOwnership,
      handleCreateCheckout
    );
    ```

    The order is: rate limit (cheapest check) -> auth -> ownership -> handler.
  </action>
  <acceptance_criteria>
    - `grep "checkoutLimiter" backend/src/middleware/rate-limit.middleware.ts` shows the export
    - `grep "checkoutLimiter" backend/src/routes/payment.routes.ts` shows it applied to checkout route
    - `grep "points: 5" backend/src/middleware/rate-limit.middleware.ts` shows the 5 req limit
    - `cd backend && npx tsc --noEmit` passes
  </acceptance_criteria>
</task>

<task id="4.3.2" title="Add server-side entitlement gates on render and document services">
  <read_first>
    - backend/src/services/render.service.ts -- requestRender() function
    - backend/src/services/document.service.ts -- generateDocument() or createPdf() function (if exists)
    - backend/src/db/schema/sessions.schema.ts -- isPaid column
    - docs/notion/Project roadmap and phases.md -- Phase 4 DoD: "entitlements enforced server-side"
  </read_first>
  <action>
    This task implements roadmap item 4.4 "Gating expensive actions" and satisfies three DoD criteria:
    - "Start free, reach a preview state" — Phase 3 renders/docs serve as the preview during PLAN/RENDER phases. Gating kicks in only when attempting to generate NEW renders/docs after the PAYMENT phase.
    - "After payment, can generate full PDF & final renders" — isPaid=true unlocks these operations.
    - "Entitlements enforced server-side (no bypass via frontend)" — the check is in the service layer.

    **1. Add isPaid gate to `render.service.ts`:**

    In the `requestRender()` function (or equivalent entry point that enqueues render jobs), add a check:

    ```typescript
    // Before enqueuing the render job, check payment status for post-PAYMENT sessions
    const [session] = await db
      .select({ phase: renovationSessions.phase, isPaid: renovationSessions.isPaid })
      .from(renovationSessions)
      .where(eq(renovationSessions.id, sessionId));

    if (!session) {
      throw new Error('Session not found');
    }

    // Renders are free during PLAN and RENDER phases (the preview).
    // After RENDER phase, renders require payment.
    const PAID_REQUIRED_PHASES = ['PAYMENT', 'COMPLETE', 'ITERATE'];
    if (PAID_REQUIRED_PHASES.includes(session.phase) && !session.isPaid) {
      throw new Error('Payment required to generate renders in this phase');
    }
    ```

    This allows free renders during PLAN/RENDER (the preview experience), but blocks them in PAYMENT/COMPLETE/ITERATE phases unless paid.

    **2. Add isPaid gate to document generation:**

    In the document service (or the `generate_document` tool handler), add the same pattern:

    ```typescript
    const PAID_REQUIRED_PHASES = ['PAYMENT', 'COMPLETE', 'ITERATE'];
    if (PAID_REQUIRED_PHASES.includes(session.phase) && !session.isPaid) {
      throw new Error('Payment required to generate documents in this phase');
    }
    ```

    **3. Document the preview model decision:**

    The "preview" that unpaid users see is the renders and documents generated during the PLAN and RENDER phases (Phase 3 output). No watermarking or degradation is needed — the phase gate IS the entitlement gate. Users can see their Phase 3 output, but generating NEW renders/docs after entering PAYMENT requires payment.

    Add this as a comment in the service files:
    ```typescript
    // Entitlement model: renders/docs generated during PLAN/RENDER phases are the "free preview".
    // After the session enters PAYMENT phase, new generation requires isPaid=true.
    // See docs/notion/Project roadmap and phases.md Phase 4 DoD.
    ```
  </action>
  <acceptance_criteria>
    - `grep "isPaid" backend/src/services/render.service.ts` shows the payment gate
    - `grep "Payment required" backend/src/services/render.service.ts` shows the error message
    - `grep "isPaid" backend/src/services/document.service.ts` OR in the generate_document tool handler shows the gate
    - `grep "PAID_REQUIRED_PHASES" backend/src/services/render.service.ts` shows the phase list
    - `cd backend && npx tsc --noEmit` passes
  </acceptance_criteria>
</task>

<task id="4.3.3" title="Write unit tests for payment service and security controls">
  <read_first>
    - backend/src/services/payment.service.ts -- fulfillPayment idempotency logic, devCompletePayment
    - backend/src/controllers/payment.controller.ts -- handleCreateCheckout phase gate, handleStripeWebhook
    - backend/src/app.ts -- dev-complete route inside NODE_ENV guard
    - backend/src/__tests__/ -- existing test file patterns, vitest setup
    - backend/vitest.config.ts or backend/package.json -- test configuration
  </read_first>
  <action>
    Create two test files:

    **1. `backend/src/__tests__/payment/payment.service.test.ts`**

    Unit tests for the payment service logic. Mock Drizzle DB and Stripe SDK.

    Test cases:

    a) **fulfillPayment — idempotency guard (SECURITY-CHECKLIST W5)**
    - Mock DB select to return `{ isPaid: true }`
    - Call `fulfillPayment()` with a mock Stripe Checkout.Session
    - Assert: DB `.update()` is NOT called
    - Assert: Function returns without error (idempotent skip)

    b) **fulfillPayment — successful fulfillment**
    - Mock DB select to return `{ isPaid: false }`
    - Mock DB update to succeed
    - Call `fulfillPayment()` with a mock session containing `client_reference_id: 'test-uuid'` and `payment_intent: 'pi_test'`
    - Assert: DB `.update()` called once with `{ isPaid: true, stripePaymentIntentId: 'pi_test', phase: 'COMPLETE' }`
    - Assert: `emitToSession` called with `'payment:completed'` and `'session:phase_changed'`

    c) **fulfillPayment — missing session ID**
    - Call with a mock session where `client_reference_id` is null and `metadata` has no `renovationSessionId`
    - Assert: Returns without calling DB update
    - Assert: Error logged

    d) **fulfillPayment — session not found in DB**
    - Mock DB select to return empty array
    - Assert: Returns without calling DB update
    - Assert: Error logged

    e) **createCheckoutSession — returns URL and ID**
    - Mock `getStripe().checkout.sessions.create()` to return `{ url: 'https://checkout.stripe.com/test', id: 'cs_test_123' }`
    - Assert: Returns `{ url: 'https://checkout.stripe.com/test', checkoutSessionId: 'cs_test_123' }`

    f) **devCompletePayment — idempotency**
    - Mock DB select to return `{ isPaid: true }`
    - Assert: Returns `{ alreadyPaid: true }` without DB update

    g) **devCompletePayment — successful bypass**
    - Mock DB select to return `{ isPaid: false }`
    - Assert: DB update called with `{ isPaid: true, phase: 'COMPLETE' }`
    - Assert: emitToSession called

    **2. `backend/src/__tests__/payment/payment-security.test.ts`**

    Security-focused tests for controllers/app-level concerns.

    Test cases:

    a) **Phase gate — checkout rejected when session not in PAYMENT phase (SECURITY-CHECKLIST E5)**
    - Mock the session query to return `{ phase: 'INTAKE', isPaid: false }`
    - Call handleCreateCheckout (or supertest the route)
    - Assert: Returns 400 with "Session is not in PAYMENT phase"

    b) **Phase gate — checkout rejected when session already paid**
    - Mock session to return `{ phase: 'PAYMENT', isPaid: true }`
    - Assert: Returns 400 with "Session is already paid"

    c) **Webhook — rejects missing stripe-signature header (SECURITY-CHECKLIST W3)**
    - Send POST to /api/webhooks/stripe without the stripe-signature header
    - Assert: Returns 400

    d) **Webhook — payment_status unpaid check (SECURITY-CHECKLIST W6)**
    - Construct a valid event where `session.payment_status === 'unpaid'`
    - Assert: `fulfillPayment` is NOT called

    e) **Dev-complete production guard (SECURITY-CHECKLIST B1, B4)**
    - This test asserts that the dev-complete route does not exist when NODE_ENV=production
    - Create the app with `NODE_ENV=production` (set env before importing createApp)
    - Send POST to /api/payments/dev-complete/test-id
    - Assert: Returns 404 (route not found)

    f) **isPaid write path audit (SECURITY-CHECKLIST S3)**
    - This is a static analysis test:
    - Read all .ts files in backend/src/ that contain `isPaid`
    - Assert: The ONLY files that set `isPaid: true` are `payment.service.ts` (fulfillPayment and devCompletePayment)
    - Use a grep-like approach or simple string search in the test

    g) **Entitlement gate — render blocked when unpaid in PAYMENT phase**
    - Mock DB session query to return `{ phase: 'PAYMENT', isPaid: false }`
    - Call `requestRender()` (or the relevant entry point)
    - Assert: Throws with "Payment required" error

    h) **Entitlement gate — render allowed when paid in COMPLETE phase**
    - Mock DB session query to return `{ phase: 'COMPLETE', isPaid: true }`
    - Call `requestRender()`
    - Assert: Does NOT throw (proceeds to enqueue)

    i) **Entitlement gate — render allowed during RENDER phase (free preview)**
    - Mock DB session query to return `{ phase: 'RENDER', isPaid: false }`
    - Call `requestRender()`
    - Assert: Does NOT throw (free preview allowed)

    Implementation notes:
    - Use `vitest` (the project's test framework)
    - Use `vi.mock()` for Drizzle DB and Stripe SDK mocking
    - Follow the existing test patterns in `backend/src/__tests__/`
    - For the dev-complete production guard test, you may need to reset modules: `vi.resetModules()` and dynamically import `createApp` after setting NODE_ENV
    - For supertest tests, use `import supertest from 'supertest'` if available, otherwise test at the controller/function level
  </action>
  <acceptance_criteria>
    - `test -f backend/src/__tests__/payment/payment.service.test.ts && echo "exists"`
    - `test -f backend/src/__tests__/payment/payment-security.test.ts && echo "exists"`
    - `cd backend && npm run test:unit -- --run --reporter=verbose 2>&1 | grep -E "payment"` shows payment tests running
    - `cd backend && npm run test:unit -- --run` passes with 0 failures
    - `grep "idempotent" backend/src/__tests__/payment/payment.service.test.ts` shows the idempotency test
    - `grep "PAYMENT phase" backend/src/__tests__/payment/payment-security.test.ts` shows the phase gate test
    - `grep "production" backend/src/__tests__/payment/payment-security.test.ts` shows the dev-complete guard test
  </acceptance_criteria>
</task>

</tasks>

<verification>
```bash
cd backend

# Type check
npx tsc --noEmit

# Lint
npm run lint

# Run payment tests specifically
npm run test:unit -- --run --reporter=verbose 2>&1 | grep -E "PASS|FAIL|payment"

# Run full test suite
npm run test:unit -- --run

# Verify checkoutLimiter is wired
grep -n "checkoutLimiter" src/routes/payment.routes.ts
```
</verification>

<success_criteria>
- `checkoutLimiter` (5 req/10 min) exported from rate-limit.middleware.ts and applied to checkout route
- Payment service tests pass: idempotency guard, successful fulfillment, missing ID, session not found, dev-complete
- Payment security tests pass: phase gate, already-paid rejection, missing signature, payment_status check, dev-complete production guard
- All existing tests still pass (no regressions)
- TypeScript and lint pass cleanly
</success_criteria>

<output>
After completion, create `.planning/phases/phase-4-payment/4-03-SUMMARY.md`
</output>
