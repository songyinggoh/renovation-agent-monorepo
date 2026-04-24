---
plan: "4.5"
wave: 5
depends_on: ["4.3", "4.4"]
title: "Hardening: integration tests, PAYMENT prompt, env docs, CSP, key rotation runbook, verification"
files_modified:
  - backend/src/__tests__/payment/webhook-ordering.test.ts
  - backend/src/config/prompts.ts
  - backend/.env.example
  - backend/src/app.ts
  - docs/runbooks/stripe-key-rotation.md
  - .planning/phases/phase-4-payment/VERIFICATION-4.md
autonomous: true
must_haves:
  truths:
    - "Integration test proves webhook route receives raw Buffer body (not parsed JSON)"
    - "PAYMENT phase prompt guides user to click Pay Now and explains what they are paying for"
    - "backend/.env.example documents all Stripe env vars with comments"
    - "Stripe key rotation runbook exists for operations handoff"
    - "VERIFICATION-4.md contains shell-runnable commands to verify the entire payment pipeline"
  artifacts:
    - path: "backend/src/__tests__/payment/webhook-ordering.test.ts"
      provides: "Integration test for raw body middleware ordering"
      contains: "express.raw"
    - path: "backend/src/config/prompts.ts"
      provides: "PAYMENT phase prompt with payment guidance"
      contains: "Pay Now"
    - path: "docs/runbooks/stripe-key-rotation.md"
      provides: "Operational runbook for Stripe key rotation"
      contains: "STRIPE_SECRET_KEY"
    - path: ".planning/phases/phase-4-payment/VERIFICATION-4.md"
      provides: "Shell-runnable verification commands"
      contains: "curl"
  key_links:
    - from: "backend/src/__tests__/payment/webhook-ordering.test.ts"
      to: "backend/src/app.ts"
      via: "supertest request to /api/webhooks/stripe verifying raw body"
      pattern: "supertest.*webhooks/stripe"
---

<objective>
Finalize the payment integration with an integration test proving the webhook raw-body ordering works, an updated PAYMENT phase prompt, complete env documentation, Helmet CSP update for Stripe domains, a key rotation runbook, and a verification checklist.

Purpose: This wave closes all remaining items from the SECURITY-CHECKLIST and ensures the payment system is production-ready with operational documentation. The webhook ordering test is the single most important regression guard (SECURITY-CHECKLIST W2 -- "the single highest-risk item in the entire integration").

Output: Integration test file, updated prompts, updated env docs, CSP config, runbook, verification document.
</objective>

<context>
@.planning/phases/phase-4-payment/4-02-SUMMARY.md
@.planning/phases/phase-4-payment/4-03-SUMMARY.md
@backend/src/app.ts (webhook route ordering from Wave 2)
@backend/src/config/prompts.ts (PAYMENT phase prompt placeholder)
@backend/.env.example (current env documentation)
@.planning/phases/phase-4-payment/SECURITY-CHECKLIST.md (P6 CSP, K4 runbook, W2 ordering test)
</context>

<tasks>

<task id="4.5.1" title="Write webhook ordering integration test and update PAYMENT prompt">
  <read_first>
    - backend/src/app.ts -- webhook route with express.raw() and its position relative to express.json()
    - backend/src/__tests__/ -- existing test patterns, how supertest is used if at all
    - backend/src/config/prompts.ts -- current PAYMENT phase prompt (line 136-144)
    - .planning/phases/phase-4-payment/SECURITY-CHECKLIST.md -- W2 (raw body ordering)
    - .planning/phases/phase-4-payment/RESEARCH.md -- Pitfall 1 (raw body destroyed)
  </read_first>
  <action>
    **1. Create `backend/src/__tests__/payment/webhook-ordering.test.ts`:**

    This integration test proves that the webhook route receives a raw Buffer body, not a parsed JSON object. This is the regression guard for the #1 highest-risk item (SECURITY-CHECKLIST W2).

    The test should:

    a) Import `createApp` from `'../../app.js'` (or the appropriate path)
    b) Create the Express app instance
    c) Use supertest (or a similar HTTP test utility) to POST to `/api/webhooks/stripe`
    d) Send a request with:
      - Content-Type: `application/json`
      - Body: a JSON string (raw)
      - A fake `stripe-signature` header (any string -- the test verifies raw body handling, not signature validity)
    e) The test does NOT need valid Stripe credentials. The expected behavior is:
      - If `isPaymentsEnabled()` is false, the handler returns 400 with "Payments not configured" -- this proves the route exists and received the request
      - OR if payments are enabled but the signature is invalid, it returns 400 with "Webhook Error" -- this proves `constructEvent` received a Buffer (not a parsed object which would throw a different error)
    f) The key assertion: the request does NOT hit the 404 handler (proving the route is registered)

    Alternative approach if supertest is not installed:

    Create a focused test that:
    - Imports `createApp` and creates the Express app
    - Uses Node's built-in `http` module to make a request
    - Asserts the response status is 400 (payments not configured) rather than 404 (route not found)

    Additional test: verify that the webhook route is registered BEFORE express.json() by:
    - Reading `app.ts` source file as a string in the test
    - Asserting that the line containing `express.raw` appears before the line containing `express.json`
    - This is a "source code structure" test -- it catches if someone reorders the middleware

    ```typescript
    import { describe, it, expect } from 'vitest';
    import { readFileSync } from 'fs';
    import { resolve } from 'path';

    describe('Webhook route ordering', () => {
      it('express.raw webhook route is registered before express.json()', () => {
        const appSource = readFileSync(
          resolve(__dirname, '../../app.ts'),
          'utf-8'
        );
        const rawIndex = appSource.indexOf('express.raw');
        const jsonIndex = appSource.indexOf('express.json');

        expect(rawIndex).toBeGreaterThan(-1); // express.raw exists
        expect(jsonIndex).toBeGreaterThan(-1); // express.json exists
        expect(rawIndex).toBeLessThan(jsonIndex); // raw comes first
      });
    });
    ```

    **2. Update PAYMENT phase prompt in `backend/src/config/prompts.ts`:**

    Replace the current PAYMENT prompt (lines 136-144) with a more helpful version:

    ```typescript
    PAYMENT: `${BASE_PERSONALITY}

    ## Current Phase: PAYMENT
    The renovation plan is ready! The user needs to complete payment to unlock the full package.

    ### What the user gets after payment:
    - Full AI-generated renovation renders for every room
    - Detailed PDF renovation plan with timelines, budgets, and contractor recommendations
    - Product shopping list with links and pricing
    - Before/after comparison views

    ### Instructions:
    - Explain what the user is paying for and the value they will receive
    - If the user asks about pricing, the exact amount is configured by the system — direct them to click the "Pay Now" button in the payment panel
    - If the user has concerns about the plan, offer to go back to a previous phase to make changes before paying
    - Do NOT process any new renders, documents, or expensive operations during this phase — those are gated behind payment
    - After payment is confirmed (the system will automatically transition to COMPLETE phase), congratulate the user
    - If the user mentions payment issues, suggest refreshing the page or contacting support
    - The session ID for tool calls is: {{SESSION_ID}}`,
    ```
  </action>
  <acceptance_criteria>
    - `test -f backend/src/__tests__/payment/webhook-ordering.test.ts && echo "exists"`
    - `grep "express.raw" backend/src/__tests__/payment/webhook-ordering.test.ts` shows the ordering check
    - `grep "Pay Now" backend/src/config/prompts.ts` shows the updated PAYMENT prompt
    - `grep "renders.*PDF\|PDF.*renders" backend/src/config/prompts.ts` shows the value proposition in the prompt
    - `cd backend && npm run test:unit -- --run --reporter=verbose 2>&1 | grep -i "webhook"` shows the webhook test running
    - `cd backend && npm run test:unit -- --run` passes
    - `cd backend && npx tsc --noEmit` passes
  </acceptance_criteria>
</task>

<task id="4.5.2" title="Update env docs, CSP for Stripe, create key rotation runbook and VERIFICATION-4.md">
  <read_first>
    - backend/.env.example -- current documentation
    - backend/src/app.ts -- Helmet CSP config (lines 57-60)
    - .planning/phases/phase-4-payment/SECURITY-CHECKLIST.md -- P6 (CSP), K4-K5 (key rotation)
  </read_first>
  <action>
    **1. Verify `backend/.env.example` has all Stripe vars documented (from Wave 1):**

    Ensure the Stripe section reads:
    ```
    # --- Stripe (Optional - Phase 4) ---
    # STRIPE_SECRET_KEY=sk_test_your-key
    # STRIPE_WEBHOOK_SECRET=whsec_your-secret
    # STRIPE_PRICE_AMOUNT_CENTS=4900
    ```

    If already correct from Wave 1, no change needed.

    **2. Update Helmet CSP in `backend/src/app.ts` for Stripe domains (SECURITY-CHECKLIST P6):**

    The current CSP config (line 57-60):
    ```typescript
    app.use(helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }));
    ```

    Update to include Stripe domains when in production:
    ```typescript
    app.use(helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production' ? {
        directives: {
          defaultSrc: ["'self'"],
          connectSrc: ["'self'", 'https://checkout.stripe.com', 'https://api.stripe.com'],
          frameSrc: ["'self'", 'https://checkout.stripe.com', 'https://js.stripe.com'],
          scriptSrc: ["'self'", 'https://js.stripe.com'],
          imgSrc: ["'self'", 'data:', 'https://*.stripe.com'],
        },
      } : false,
      crossOriginEmbedderPolicy: false,
    }));
    ```

    NOTE: The backend serves the API, not the frontend. CSP on the backend primarily protects any server-rendered pages (like the Bull Board admin UI). The frontend (Next.js on Vercel) manages its own headers. However, setting it here establishes the pattern and protects any direct API responses that browsers might render. If the existing `undefined` (Helmet defaults) is preferred, at minimum add a comment documenting the Stripe domains that the frontend must allow.

    Simpler alternative: If changing the production CSP risks breaking existing functionality, add a comment instead:
    ```typescript
    // NOTE: When deploying to production, ensure CSP allows:
    // connect-src: https://checkout.stripe.com, https://api.stripe.com
    // frame-src: https://checkout.stripe.com, https://js.stripe.com
    // These are needed for Stripe Checkout hosted redirect.
    ```

    **3. Create `docs/runbooks/stripe-key-rotation.md` (SECURITY-CHECKLIST K4, K5):**

    ```markdown
    # Stripe Key Rotation Runbook

    ## When to rotate
    - Scheduled: Every 12 months
    - Emergency: If a key is suspected compromised (leaked in logs, git, etc.)

    ## Rotating STRIPE_SECRET_KEY

    1. Go to Stripe Dashboard -> Developers -> API keys
    2. Click "Create restricted key" or "Roll key" on the existing key
    3. Copy the new key value (starts with `sk_live_` or `sk_test_`)
    4. Update the production environment variable:
       - Vercel: Project Settings -> Environment Variables -> STRIPE_SECRET_KEY
       - Docker: Update the .env file or secrets manager
    5. Redeploy the backend service
    6. Verify: check `/health/ready` returns 200
    7. Test: create a test checkout session to verify the new key works
    8. REVOKE the old key in Stripe Dashboard (keys do NOT auto-expire)

    ## Rotating STRIPE_WEBHOOK_SECRET

    The webhook secret (`whsec_...`) is bound to a specific webhook endpoint URL.

    1. Go to Stripe Dashboard -> Developers -> Webhooks
    2. Click the webhook endpoint (e.g., `https://your-domain.com/api/webhooks/stripe`)
    3. Click "Reveal" on the signing secret, or delete and recreate the endpoint
    4. Copy the new `whsec_...` value
    5. Update the production environment variable: STRIPE_WEBHOOK_SECRET
    6. Redeploy the backend service
    7. Test: trigger a test event from Stripe CLI or Dashboard

    IMPORTANT: If you change the webhook endpoint URL (e.g., new domain), you MUST
    create a new webhook endpoint in Stripe Dashboard and get a new signing secret.
    The old secret will not work with the new URL.

    ## Rotating in staging/development

    For local development:
    ```bash
    stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
    # The CLI prints the signing secret: whsec_...
    # Update STRIPE_WEBHOOK_SECRET in backend/.env
    ```

    The Stripe CLI signing secret is stable across restarts (same machine).

    ## Verification after rotation

    ```bash
    # 1. Health check
    curl https://your-domain.com/health/ready

    # 2. Test checkout (replace session-id with a real PAYMENT-phase session)
    curl -X POST https://your-domain.com/api/payments/checkout/SESSION_ID

    # 3. Test webhook (via Stripe CLI)
    stripe trigger checkout.session.completed
    ```
    ```

    **4. Create `.planning/phases/phase-4-payment/VERIFICATION-4.md`:**

    Shell-runnable commands that verify the entire payment pipeline end-to-end.

    ```markdown
    # Phase 4: Payment Integration — Verification

    ## Prerequisites
    - Backend running at localhost:3000
    - Frontend running at localhost:3001
    - PostgreSQL accessible
    - Redis running (for BullMQ)

    ## 1. Infrastructure (Wave 1)

    ```bash
    # Stripe SDK installed
    grep '"stripe"' backend/package.json && echo "PASS: stripe installed" || echo "FAIL"

    # Env schema has STRIPE_PRICE_AMOUNT_CENTS
    grep "STRIPE_PRICE_AMOUNT_CENTS" backend/src/config/env.ts && echo "PASS" || echo "FAIL"

    # stripe.ts config exists
    test -f backend/src/config/stripe.ts && echo "PASS: stripe.ts exists" || echo "FAIL"

    # Shared types have payment events
    grep "PaymentCompletedPayload" packages/shared-types/src/socket-events.ts && echo "PASS" || echo "FAIL"
    grep "payment:completed" packages/shared-types/src/socket-events.ts && echo "PASS" || echo "FAIL"
    ```

    ## 2. Backend Core (Wave 2)

    ```bash
    # Service exists with all functions
    grep "export.*function.*createCheckoutSession" backend/src/services/payment.service.ts && echo "PASS" || echo "FAIL"
    grep "export.*function.*fulfillPayment" backend/src/services/payment.service.ts && echo "PASS" || echo "FAIL"

    # Webhook route ordering (CRITICAL)
    RAW_LINE=$(grep -n "express.raw" backend/src/app.ts | head -1 | cut -d: -f1)
    JSON_LINE=$(grep -n "express.json" backend/src/app.ts | head -1 | cut -d: -f1)
    [ "$RAW_LINE" -lt "$JSON_LINE" ] && echo "PASS: express.raw before express.json" || echo "FAIL: WRONG ORDER"

    # Dev-complete is gated
    grep -B5 "dev-complete" backend/src/app.ts | grep -q "NODE_ENV.*production" && echo "PASS: dev-complete gated" || echo "FAIL"
    ```

    ## 3. Security (Wave 3)

    ```bash
    # Checkout rate limiter exists
    grep "checkoutLimiter" backend/src/middleware/rate-limit.middleware.ts && echo "PASS" || echo "FAIL"
    grep "checkoutLimiter" backend/src/routes/payment.routes.ts && echo "PASS" || echo "FAIL"

    # Tests pass
    cd backend && npm run test:unit -- --run 2>&1 | tail -5
    ```

    ## 4. Frontend (Wave 4)

    ```bash
    # Payment hook exists
    test -f frontend/hooks/usePayment.ts && echo "PASS" || echo "FAIL"

    # Payment panel exists
    test -f frontend/components/payment/payment-panel.tsx && echo "PASS" || echo "FAIL"

    # Socket.io listener added
    grep "payment:completed" frontend/hooks/useSocketQuerySync.ts && echo "PASS" || echo "FAIL"

    # Type check
    cd frontend && npm run type-check 2>&1 | tail -3
    ```

    ## 5. Live API Tests (requires running server)

    ```bash
    # Create a test session in PAYMENT phase
    SESSION_ID=$(curl -s -X POST http://localhost:3000/api/sessions \
      -H "Content-Type: application/json" \
      -d '{"title":"Payment Test"}' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    echo "Created session: $SESSION_ID"

    # Advance to PAYMENT phase (direct DB)
    # psql $DATABASE_URL -c "UPDATE renovation_sessions SET phase='PAYMENT' WHERE id='$SESSION_ID'"

    # Test checkout endpoint (should return devBypass if Stripe not configured)
    curl -s -X POST http://localhost:3000/api/payments/checkout/$SESSION_ID | python3 -m json.tool

    # Test payment status
    curl -s http://localhost:3000/api/payments/status/$SESSION_ID | python3 -m json.tool

    # Test dev-complete (only works when NODE_ENV !== production)
    curl -s -X POST http://localhost:3000/api/payments/dev-complete/$SESSION_ID | python3 -m json.tool

    # Verify session is now COMPLETE
    curl -s http://localhost:3000/api/sessions/$SESSION_ID | python3 -m json.tool | grep phase
    ```
    ```
  </action>
  <acceptance_criteria>
    - `test -f docs/runbooks/stripe-key-rotation.md && echo "exists"` outputs "exists"
    - `test -f .planning/phases/phase-4-payment/VERIFICATION-4.md && echo "exists"` outputs "exists"
    - `grep "Stripe" backend/src/app.ts` shows CSP comment or config for Stripe domains
    - `grep "STRIPE_PRICE_AMOUNT_CENTS" backend/.env.example` shows documentation
    - `cd backend && npx tsc --noEmit` passes
    - `cd backend && npm run lint` passes
    - `cd backend && npm run test:unit -- --run` passes
  </acceptance_criteria>
</task>

</tasks>

<verification>
```bash
# Full backend quality gate
cd backend && npx tsc --noEmit && npm run lint && npm run test:unit -- --run

# Full frontend quality gate
cd frontend && npm run type-check && npm run lint

# Docs exist
test -f docs/runbooks/stripe-key-rotation.md && echo "Runbook exists"
test -f .planning/phases/phase-4-payment/VERIFICATION-4.md && echo "Verification exists"
```
</verification>

<success_criteria>
- Webhook ordering integration test passes and catches if express.raw is moved after express.json
- PAYMENT phase prompt explains value proposition and guides user to Pay Now button
- .env.example fully documents all Stripe variables
- Helmet CSP includes Stripe domains (or documents them in comments)
- Stripe key rotation runbook exists at docs/runbooks/stripe-key-rotation.md
- VERIFICATION-4.md exists with shell-runnable verification commands
- All backend tests pass (including all new payment tests from Wave 3 and 5)
- TypeScript and lint pass in both backend and frontend
</success_criteria>

<output>
After completion, create `.planning/phases/phase-4-payment/4-05-SUMMARY.md`
</output>
