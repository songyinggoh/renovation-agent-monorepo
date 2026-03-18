---
plan: "4.2"
wave: 2
depends_on: ["4.1"]
title: "Backend core: payment service, controller, routes, webhook mounting"
files_modified:
  - backend/src/services/payment.service.ts
  - backend/src/controllers/payment.controller.ts
  - backend/src/routes/payment.routes.ts
  - backend/src/app.ts
autonomous: true
must_haves:
  truths:
    - "POST /api/payments/checkout/:sessionId creates a Stripe Checkout Session and returns { url, checkoutSessionId }"
    - "POST /api/webhooks/stripe receives raw Buffer body and verifies Stripe signature"
    - "checkout.session.completed webhook event triggers fulfillPayment() which sets isPaid=true, stripePaymentIntentId, phase=COMPLETE atomically"
    - "Webhook returns 200 immediately before async processing"
    - "fulfillPayment() emits payment:completed and session:phase_changed via Socket.io"
    - "When isPaymentsEnabled()===false, checkout returns { url: null, devBypass: true }"
    - "GET /api/payments/status/:sessionId returns current isPaid status"
  artifacts:
    - path: "backend/src/services/payment.service.ts"
      provides: "createCheckoutSession(), fulfillPayment(), devCompletePayment(), getPaymentStatus()"
      exports: ["createCheckoutSession", "fulfillPayment", "devCompletePayment", "getPaymentStatus"]
    - path: "backend/src/controllers/payment.controller.ts"
      provides: "HTTP request handlers for payment routes"
      exports: ["handleCreateCheckout", "handleStripeWebhook", "handleDevComplete", "handleGetPaymentStatus"]
    - path: "backend/src/routes/payment.routes.ts"
      provides: "Express router with payment routes"
      exports: ["default"]
    - path: "backend/src/app.ts"
      provides: "Webhook route mounted BEFORE express.json(), payment routes mounted after"
      contains: "express.raw"
  key_links:
    - from: "backend/src/services/payment.service.ts"
      to: "backend/src/config/stripe.ts"
      via: "getStripe() import"
      pattern: "import.*getStripe.*stripe"
    - from: "backend/src/services/payment.service.ts"
      to: "backend/src/utils/socket-emitter.ts"
      via: "emitToSession() for real-time events"
      pattern: "emitToSession"
    - from: "backend/src/app.ts"
      to: "backend/src/controllers/payment.controller.ts"
      via: "webhook route mounted before express.json()"
      pattern: "express\\.raw.*handleStripeWebhook"
---

<objective>
Build the payment service layer, controller, routes, and wire the webhook into app.ts with correct middleware ordering. This is the core backend payment pipeline: checkout creation, webhook fulfillment, dev bypass, and status check.

Purpose: This is the authoritative payment flow -- the service creates Stripe sessions, the webhook fulfills them, and the Socket.io events drive the frontend. Every security control in Wave 3 builds on this foundation.

Output: Four new files (service, controller, routes, updated app.ts) implementing the complete Stripe Checkout + webhook fulfillment pipeline.
</objective>

<context>
@.planning/phases/phase-4-payment/4-01-SUMMARY.md
@backend/src/config/stripe.ts (from Wave 1)
@backend/src/config/env.ts
@backend/src/app.ts
@backend/src/db/schema/sessions.schema.ts
@backend/src/utils/socket-emitter.ts
@backend/src/middleware/auth.middleware.ts
@backend/src/middleware/ownership.middleware.ts
@.planning/phases/phase-4-payment/RESEARCH.md (Patterns 2-5)
@.planning/phases/phase-4-payment/SECURITY-CHECKLIST.md (W1-W8, E4-E6, B1)
</context>

<tasks>

<task id="4.2.1" title="Create payment service with createCheckoutSession, fulfillPayment, devComplete, getStatus">
  <read_first>
    - backend/src/config/stripe.ts -- getStripe() singleton
    - backend/src/config/env.ts -- env.STRIPE_PRICE_AMOUNT_CENTS, env.FRONTEND_URL, isPaymentsEnabled()
    - backend/src/db/schema/sessions.schema.ts -- renovationSessions table shape, isPaid column
    - backend/src/db/index.ts -- db import, how other services use Drizzle
    - backend/src/utils/socket-emitter.ts -- emitToSession() for broadcasting events
    - .planning/phases/phase-4-payment/RESEARCH.md -- Pattern 2 (createCheckoutSession), Pattern 5 (fulfillPayment)
    - .planning/phases/phase-4-payment/SECURITY-CHECKLIST.md -- W5 (idempotency), W6 (payment_status), D1 (never log paymentIntentId), S3 (only fulfillPayment sets isPaid)
  </read_first>
  <action>
    Create `backend/src/services/payment.service.ts` with four exported functions:

    **1. `createCheckoutSession(sessionId: string, userEmail?: string)`**

    - Calls `getStripe().checkout.sessions.create()` with:
      - `mode: 'payment'`
      - `line_items`: single item using `price_data` (NOT a pre-created Stripe Price ID):
        ```typescript
        price_data: {
          currency: 'usd',
          unit_amount: env.STRIPE_PRICE_AMOUNT_CENTS,
          product_data: {
            name: 'Renovation Plan Package',
            description: 'AI-generated renovation plan with renders and documents',
          },
        },
        quantity: 1,
        ```
      - `client_reference_id: sessionId` (primary tie-back to our session)
      - `metadata: { renovationSessionId: sessionId }` (redundant backup)
      - `customer_email: userEmail` (only if truthy)
      - `success_url: \`${env.FRONTEND_URL}/sessions/${sessionId}?payment=success\``
      - `cancel_url: \`${env.FRONTEND_URL}/sessions/${sessionId}?payment=cancelled\``
    - Returns `{ url: string; checkoutSessionId: string }`
    - Throws if `checkoutSession.url` is null

    **2. `fulfillPayment(session: Stripe.Checkout.Session)`**

    SECURITY-CRITICAL function. This is the ONLY code path that sets `isPaid = true`.

    - Recover `renovationSessionId` from `session.client_reference_id ?? session.metadata?.renovationSessionId`
    - If missing, log error and return (don't throw -- webhook already returned 200)
    - IDEMPOTENCY CHECK: Query `db.select({ isPaid }).from(renovationSessions).where(eq(id, renovationSessionId))`
      - If not found, log error and return
      - If `existing.isPaid === true`, log info "already fulfilled (idempotent skip)" and return
    - Extract `paymentIntentId`: `typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null`
    - ATOMIC DB UPDATE (single `.update().set()` call):
      ```typescript
      await db.update(renovationSessions).set({
        isPaid: true,
        stripePaymentIntentId: paymentIntentId,
        phase: 'COMPLETE',
        updatedAt: new Date(),
      }).where(eq(renovationSessions.id, renovationSessionId));
      ```
    - Emit Socket.io events via `emitToSession()`:
      - `emitToSession(renovationSessionId, 'payment:completed', { sessionId: renovationSessionId })`
      - `emitToSession(renovationSessionId, 'session:phase_changed', { sessionId: renovationSessionId, phase: 'COMPLETE' })`
    - Log: `logger.info('Payment fulfilled', { renovationSessionId, stripeSessionId: session.id })` -- do NOT log paymentIntentId (SECURITY-CHECKLIST D1)

    **3. `devCompletePayment(sessionId: string)`**

    Dev-only function that bypasses Stripe for local testing.

    - Same idempotency check as fulfillPayment (query isPaid first)
    - If already paid, return `{ alreadyPaid: true }`
    - Atomic DB update: `isPaid: true, phase: 'COMPLETE', updatedAt: new Date()` (no stripePaymentIntentId)
    - Emit same Socket.io events as fulfillPayment
    - Return `{ devBypass: true, warning: 'THIS ENDPOINT DOES NOT EXIST IN PRODUCTION', sessionId }`

    **4. `getPaymentStatus(sessionId: string)`**

    - Query `db.select({ isPaid, phase }).from(renovationSessions).where(eq(id, sessionId))`
    - If not found, throw with 404 message
    - Return `{ isPaid: boolean, phase: string }`

    IMPORTANT implementation notes:
    - Import `Stripe` type with `import type Stripe from 'stripe'` for the fulfillPayment parameter type
    - Import `getStripe` from `'../config/stripe.js'`
    - Import `env` from `'../config/env.js'`
    - Import `db` from `'../db/index.js'`
    - Import `renovationSessions` from `'../db/schema/sessions.schema.js'`
    - Import `eq` from `'drizzle-orm'`
    - Import `emitToSession` from `'../utils/socket-emitter.js'`
    - Import `Logger` from `'../utils/logger.js'`
    - Never log `session.customer_details?.email` (GDPR -- SECURITY-CHECKLIST D2)
    - Never pass the raw Stripe event/session object to the logger (SECURITY-CHECKLIST D3)
  </action>
  <acceptance_criteria>
    - `test -f backend/src/services/payment.service.ts && echo "exists"` outputs "exists"
    - `grep "createCheckoutSession" backend/src/services/payment.service.ts` shows the export
    - `grep "fulfillPayment" backend/src/services/payment.service.ts` shows the export
    - `grep "devCompletePayment" backend/src/services/payment.service.ts` shows the export
    - `grep "getPaymentStatus" backend/src/services/payment.service.ts` shows the export
    - `grep "client_reference_id" backend/src/services/payment.service.ts` shows the Stripe session tie-back
    - `grep "isPaid: true" backend/src/services/payment.service.ts` shows only in fulfillPayment and devCompletePayment
    - `grep -c "emitToSession" backend/src/services/payment.service.ts` returns at least 4 (2 in fulfill, 2 in devComplete)
    - `grep "paymentIntentId" backend/src/services/payment.service.ts | grep -v "logger"` confirms paymentIntentId is NOT logged (only used in DB set)
    - `cd backend && npx tsc --noEmit` passes
  </acceptance_criteria>
</task>

<task id="4.2.2" title="Create payment controller, routes, and mount in app.ts with correct middleware ordering">
  <read_first>
    - backend/src/services/payment.service.ts -- the service functions from task 4.2.1
    - backend/src/app.ts -- CRITICAL: note express.json() at line 82, route mounting at lines 107-119, Bull Board dev guard at lines 124-139
    - backend/src/middleware/auth.middleware.ts -- optionalAuthMiddleware pattern
    - backend/src/middleware/ownership.middleware.ts -- verifySessionOwnership middleware
    - backend/src/middleware/rate-limit.middleware.ts -- createLimiter/createMiddleware pattern
    - backend/src/controllers/session.controller.ts -- controller pattern reference (how other controllers are structured)
    - .planning/phases/phase-4-payment/RESEARCH.md -- Pattern 3 (webhook handler), Pattern 4 (route registration order)
    - .planning/phases/phase-4-payment/SECURITY-CHECKLIST.md -- W1-W4 (webhook security), E4 (ownership), E5 (phase gate), E6 (dev-complete gate), B1 (NODE_ENV guard)
  </read_first>
  <action>
    **1. Create `backend/src/controllers/payment.controller.ts`:**

    Four handler functions:

    **a) `handleCreateCheckout(req, res)`**
    - Extract `sessionId` from `req.params.sessionId`
    - Extract `userEmail` from `req.user?.email` (may be undefined in anonymous mode)
    - If `!isPaymentsEnabled()`, return: `res.json({ url: null, devBypass: true, message: 'Stripe not configured — use POST /api/payments/dev-complete/:sessionId to bypass' })`
    - Phase gate check (SECURITY-CHECKLIST E5):
      - Query the session's current phase from DB
      - If `session.phase !== 'PAYMENT'`, return `res.status(400).json({ error: 'Session is not in PAYMENT phase' })`
      - If `session.isPaid`, return `res.status(400).json({ error: 'Session is already paid' })`
    - Call `createCheckoutSession(sessionId, userEmail)`
    - Return `res.json({ url, checkoutSessionId })`
    - Wrap in try/catch, log errors, return 500

    **b) `handleStripeWebhook(req, res)`**
    - If `!isPaymentsEnabled()`, return 400
    - Extract `sig` from `req.headers['stripe-signature']` -- if missing, return 400 (SECURITY-CHECKLIST W3)
    - Call `getStripe().webhooks.constructEvent(req.body as Buffer, sig, env.STRIPE_WEBHOOK_SECRET!)` in try/catch (SECURITY-CHECKLIST W1)
      - NOTE: The `!` assertion on STRIPE_WEBHOOK_SECRET is safe here because `isPaymentsEnabled()` already checked both keys exist
    - On catch: log "Webhook signature verification failed", return 400
    - Return `res.json({ received: true })` IMMEDIATELY (SECURITY-CHECKLIST W4)
    - THEN process async with `.catch()`:
      ```typescript
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.payment_status !== 'unpaid') {  // SECURITY-CHECKLIST W6
            fulfillPayment(session).catch(err => {
              logger.error('fulfillPayment failed', err as Error, {
                stripeSessionId: session.id,
              });
            });
          }
          break;
        }
        case 'checkout.session.async_payment_failed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const renovationSessionId = session.client_reference_id;
          logger.warn('Async payment failed', undefined, { stripeSessionId: session.id });
          if (renovationSessionId) {
            emitToSession(renovationSessionId, 'payment:failed', {
              sessionId: renovationSessionId,
              reason: 'Payment method failed',
            });
          }
          break;
        }
        default:
          logger.info('Unhandled Stripe event', { type: event.type, eventId: event.id });
      }
      ```

    **c) `handleDevComplete(req, res)`**
    - Extract `sessionId` from `req.params.sessionId`
    - Call `devCompletePayment(sessionId)`
    - Return the result as JSON
    - Wrap in try/catch

    **d) `handleGetPaymentStatus(req, res)`**
    - Extract `sessionId` from `req.params.sessionId`
    - Call `getPaymentStatus(sessionId)`
    - Return `res.json(result)`
    - Wrap in try/catch

    **2. Create `backend/src/routes/payment.routes.ts`:**

    ```typescript
    import { Router } from 'express';
    import {
      handleCreateCheckout,
      handleDevComplete,
      handleGetPaymentStatus,
    } from '../controllers/payment.controller.js';
    import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
    import { verifySessionOwnership } from '../middleware/ownership.middleware.js';

    const router = Router();

    // Checkout session creation
    // optionalAuthMiddleware: extracts user if auth is enabled (Phase 8+ ready)
    // verifySessionOwnership: ensures caller owns the session (SECURITY-CHECKLIST E4, S4)
    router.post(
      '/payments/checkout/:sessionId',
      optionalAuthMiddleware,
      verifySessionOwnership,
      handleCreateCheckout
    );

    // Payment status check
    router.get(
      '/payments/status/:sessionId',
      optionalAuthMiddleware,
      verifySessionOwnership,
      handleGetPaymentStatus
    );

    export default router;
    ```

    NOTE: The webhook route is NOT in this router -- it is mounted directly in app.ts with express.raw() (see step 3). The dev-complete route is also mounted conditionally in app.ts (see step 3).

    **3. Update `backend/src/app.ts`:**

    This is the MOST CRITICAL change in the entire Phase 4 integration. The ordering must be exact.

    **a) Add imports at the top:**
    ```typescript
    import { handleStripeWebhook } from './controllers/payment.controller.js';
    import { handleDevComplete } from './controllers/payment.controller.js';
    import paymentRoutes from './routes/payment.routes.js';
    import { optionalAuthMiddleware } from './middleware/auth.middleware.js';
    import { verifySessionOwnership } from './middleware/ownership.middleware.js';
    ```
    (Combine the controller imports into a single import statement. optionalAuthMiddleware and verifySessionOwnership may already be imported -- check first.)

    **b) BEFORE the "Body Parsing Middleware" section (before line 82's `app.use(express.json(...))`), add:**

    ```typescript
    // ============================================
    // Stripe Webhook Route (MUST be before express.json())
    // The webhook route needs the raw Buffer body for signature
    // verification. express.json() would parse it and break
    // constructEvent(). See SECURITY-CHECKLIST W2.
    // ============================================
    app.post(
      '/api/webhooks/stripe',
      express.raw({ type: 'application/json' }),
      handleStripeWebhook
    );
    ```

    This MUST be before `app.use(express.json({ limit: '10mb' }))` on the current line 82. This is the #1 integration failure mode (SECURITY-CHECKLIST W2, RESEARCH Pitfall 1).

    **c) After the existing API Routes section, add the payment routes:**
    ```typescript
    app.use('/api', paymentRoutes);
    ```

    **d) Inside the existing `if (env.NODE_ENV !== 'production')` block (Bull Board section, currently lines 124-139), add the dev-complete route:**
    ```typescript
    // Dev-only payment bypass (SECURITY-CHECKLIST B1)
    // This route MUST NOT be registered in production.
    app.post(
      '/api/payments/dev-complete/:sessionId',
      optionalAuthMiddleware,
      verifySessionOwnership,
      handleDevComplete
    );
    logger.warn('DEV BYPASS: /api/payments/dev-complete is mounted. DO NOT USE IN PRODUCTION.');
    ```

    The key constraint: dev-complete is gated at ROUTE REGISTRATION time (inside the `NODE_ENV !== 'production'` if-block), not at handler level. This means the route literally does not exist in the routing table in production (SECURITY-CHECKLIST B1).
  </action>
  <acceptance_criteria>
    - `test -f backend/src/controllers/payment.controller.ts && echo "exists"` outputs "exists"
    - `test -f backend/src/routes/payment.routes.ts && echo "exists"` outputs "exists"
    - `grep "handleStripeWebhook" backend/src/controllers/payment.controller.ts` shows the export
    - `grep "handleCreateCheckout" backend/src/controllers/payment.controller.ts` shows the export
    - `grep "express.raw" backend/src/app.ts` shows the webhook route with raw body parser
    - Verify ordering: the line number of `express.raw` in app.ts is LESS than the line number of `express.json` -- confirm with:
      `grep -n "express.raw\|express.json" backend/src/app.ts` -- raw must come first
    - `grep "dev-complete" backend/src/app.ts` shows the route inside a NODE_ENV guard
    - `grep "verifySessionOwnership" backend/src/routes/payment.routes.ts` shows ownership check on checkout route
    - `grep "payment_status.*unpaid" backend/src/controllers/payment.controller.ts` shows the payment_status check
    - `grep "res.json.*received.*true" backend/src/controllers/payment.controller.ts` shows immediate 200 response
    - `cd backend && npx tsc --noEmit` passes
    - `cd backend && npm run lint` passes
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

# Verify webhook route ordering in app.ts
grep -n "express.raw\|express.json" src/app.ts
# express.raw line number MUST be lower than express.json line number

# Verify dev-complete is inside NODE_ENV guard
# (manual check: grep context around dev-complete)
grep -B 5 "dev-complete" src/app.ts | grep "NODE_ENV"

# Verify all service functions exist
grep "export.*function" src/services/payment.service.ts
# Should show: createCheckoutSession, fulfillPayment, devCompletePayment, getPaymentStatus

# Verify controller handlers exist
grep "export.*function" src/controllers/payment.controller.ts
# Should show: handleCreateCheckout, handleStripeWebhook, handleDevComplete, handleGetPaymentStatus
```
</verification>

<success_criteria>
- `payment.service.ts` exports createCheckoutSession, fulfillPayment, devCompletePayment, getPaymentStatus
- `payment.controller.ts` exports handleCreateCheckout, handleStripeWebhook, handleDevComplete, handleGetPaymentStatus
- `payment.routes.ts` wires checkout + status routes with optionalAuthMiddleware + verifySessionOwnership
- Webhook route in app.ts uses `express.raw({ type: 'application/json' })` and is mounted BEFORE `express.json()`
- Dev-complete route is mounted inside `if (env.NODE_ENV !== 'production')` block in app.ts
- Webhook handler returns `res.json({ received: true })` before async processing
- fulfillPayment uses client_reference_id (not session.id) to recover renovation session ID
- fulfillPayment performs atomic single-call DB update (isPaid + stripePaymentIntentId + phase)
- TypeScript and lint pass cleanly
</success_criteria>

<output>
After completion, create `.planning/phases/phase-4-payment/4-02-SUMMARY.md`
</output>
