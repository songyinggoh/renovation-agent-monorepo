# Phase 4: Payment / Stripe Integration - Research

**Researched:** 2026-03-19
**Domain:** Stripe Checkout Sessions, Express webhooks, phase gate enforcement
**Confidence:** HIGH (core Stripe patterns verified against official docs; codebase patterns verified by direct file reads)

---

## Summary

Phase 4 adds Stripe payment gating before the session transitions from PAYMENT → COMPLETE. The
established pattern for this product type is a **Stripe Checkout Session (hosted redirect)** with a
**backend webhook** as the authoritative fulfillment trigger. The frontend redirects users to the
Stripe-hosted payment page; after payment, Stripe POSTs a `checkout.session.completed` event to the
backend webhook, which atomically sets `isPaid = true` and `stripePaymentIntentId` on the session,
then emits a Socket.io `payment:completed` event so the frontend transitions in real time.

Payment gating is enforced at the **session state machine level** (before any agent action is processed),
not as a route-level middleware, because the PAYMENT phase is a chat-first flow where the AI agent
guides the user to click "Pay Now". The AI agent does NOT need a tool for this — payment is a
backend-webhook → DB → Socket.io concern.

The Stripe package is not yet installed in the backend. It must be added. Version 20.x is current.
The `isPaymentsEnabled()` helper and the `isPaid` / `stripePaymentIntentId` columns on
`renovation_sessions` already exist and are ready to use.

**Primary recommendation:** Use Stripe Checkout Sessions (hosted redirect, mode: "payment") with a
single flat-fee `price_data` line item, fulfill exclusively via webhook on `checkout.session.completed`,
enforce the gate in the chat message handler by checking `session.isPaid` before processing PAYMENT-phase
messages, and emit `payment:completed` via Socket.io from the webhook handler.

---

## Decision: Payment Model

**One-time charge per session.** This is a renovation planning SaaS where each session produces a
deliverable (renders + documents). Per-session pricing is the natural model — the user pays once to
"unlock" the completed plan package. Subscriptions would require recurring billing infrastructure and
do not match the project's session-based flow.

**Charge amount:** To be decided by product (set as env var `STRIPE_PRICE_AMOUNT_CENTS`, default e.g.
`4900` for $49.00 USD). Do NOT hardcode the price in application code.

---

## Decision: Checkout UI Mode

**Use Stripe Checkout hosted redirect (default mode), NOT embedded Payment Element.** Rationale:

- Hosted redirect is complexity 2/5 vs embedded at 3-4/5.
- No PCI scope — Stripe hosts the payment form entirely.
- Works without installing `@stripe/stripe-js` on the frontend.
- Returns the user to `success_url` after payment; the webhook handles DB fulfillment.
- `ui_mode: "custom"` (embedded) requires `return_url` and a frontend `EmbeddedCheckout` component — unnecessary complexity for this phase.

---

## Decision: Phase Gate Location

**Enforce `isPaid` check in the chat message handler (agent supervisor layer), not as Express middleware.**

Rationale: PAYMENT phase is a chat-first UX where the AI guides the user. The user interacts via
Socket.io chat messages, not HTTP routes. Blocking at Socket.io message handler (before the
LangGraph agent runs) is the correct interception point. HTTP routes for fetching session data
must remain unblocked so the frontend can poll `isPaid` status.

The gate logic:
1. If `session.phase === 'PAYMENT'` AND `session.isPaid === false`, the agent should only respond with
   "here is the payment link" guidance, NOT advance to COMPLETE.
2. After webhook sets `isPaid = true`, the backend emits `session:phase_changed` with `COMPLETE`,
   letting the agent's next run use the COMPLETE prompt.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` | ^20.x (latest ~20.4.0) | Stripe Node.js SDK — Checkout Sessions, webhook `constructEvent`, TypeScript types | Official Stripe SDK; includes full TS types; ESM compatible |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `express` | ^4.22.1 | Already used for all routes | Webhook route uses `express.raw()` middleware |
| `drizzle-orm` | ^0.38.4 | Already used for DB | Update `isPaid` + `stripePaymentIntentId` atomically |
| `socket.io` | ^4.8.3 | Already used for real-time events | Emit `payment:completed` from webhook handler |
| `bullmq` | ^5.71.0 | Already used for job queues | Enqueue `email:send-notification` for receipt |

### Not needed
| Instead of | Why Not |
|------------|---------|
| `@stripe/stripe-js` (frontend) | Not needed for hosted-redirect Checkout; only required for embedded Payment Element |
| `stripe-webhook-middleware` (npm) | Hand-rolled raw body + constructEvent is the standard; no wrapper needed |

### Installation
```bash
# From repo root (pnpm monorepo)
pnpm --filter backend add stripe
```

---

## Architecture Patterns

### Recommended File Structure
```
backend/src/
├── config/
│   └── stripe.ts              # Lazy-initialized Stripe client + getStripe()
├── services/
│   └── payment.service.ts     # createCheckoutSession(), fulfillSession()
├── controllers/
│   └── payment.controller.ts  # createCheckoutSession handler, webhook handler
└── routes/
    └── payment.routes.ts      # POST /api/payments/checkout, POST /api/webhooks/stripe

packages/shared-types/src/
└── socket-events.ts           # Add PaymentCompletedPayload, PaymentFailedPayload
                               # Add 'payment:completed', 'payment:failed' to ServerToClientEvents
```

### Pattern 1: Stripe Client Initialization (Lazy Singleton)

**What:** Instantiate Stripe once, lazily, using `isPaymentsEnabled()` guard.
**When to use:** At module import time, guard against missing keys.

```typescript
// Source: Official stripe-node README + official docs guidance
// backend/src/config/stripe.ts
import Stripe from 'stripe';
import { env, isPaymentsEnabled } from './env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'StripeConfig' });

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!isPaymentsEnabled()) {
      throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.');
    }
    _stripe = new Stripe(env.STRIPE_SECRET_KEY!);
    logger.info('Stripe client initialized');
  }
  return _stripe;
}
```

**Key points:**
- No `apiVersion` option needed in v20 — stripe-node pins to the API version current at release time.
- ESM import: `import Stripe from 'stripe'` (default export).
- Lazy singleton matches the `isAuthEnabled()` / `isPaymentsEnabled()` pattern used throughout the codebase.

### Pattern 2: Checkout Session Creation

**What:** POST endpoint creates a Stripe Checkout Session and returns the redirect URL.
**When to use:** Frontend calls this when user clicks "Pay Now" in the PAYMENT phase UI.

```typescript
// Source: https://docs.stripe.com/payments/quickstart-checkout-sessions (official)
// backend/src/services/payment.service.ts
import Stripe from 'stripe';
import { getStripe } from '../config/stripe.js';
import { env } from '../config/env.js';

export async function createCheckoutSession(
  sessionId: string,
  userEmail?: string
): Promise<{ url: string; checkoutSessionId: string }> {
  const stripe = getStripe();

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: env.STRIPE_PRICE_AMOUNT_CENTS,  // e.g. 4900 = $49.00
          product_data: {
            name: 'Renovation Plan Package',
            description: 'AI-generated renovation plan with renders and documents',
          },
        },
        quantity: 1,
      },
    ],
    // client_reference_id ties the Stripe session back to our session record.
    // It appears on the checkout.session.completed webhook event.
    client_reference_id: sessionId,
    // Also store in metadata for redundancy
    metadata: { renovationSessionId: sessionId },
    ...(userEmail ? { customer_email: userEmail } : {}),
    success_url: `${env.FRONTEND_URL}/sessions/${sessionId}?payment=success`,
    cancel_url: `${env.FRONTEND_URL}/sessions/${sessionId}?payment=cancelled`,
    // Stripe automatic email receipts are sufficient — no need for custom receipt flow
    // unless RESEND_API_KEY is configured, in which case send a branded receipt via BullMQ
  });

  if (!checkoutSession.url) {
    throw new Error('Stripe did not return a checkout URL');
  }

  return {
    url: checkoutSession.url,
    checkoutSessionId: checkoutSession.id,
  };
}
```

**Key points:**
- `client_reference_id` is the primary tie-back — survives Stripe's internal routing reliably.
- `metadata.renovationSessionId` is a redundant backup.
- `success_url` includes `?payment=success` so the frontend can show a confirmation banner on return.
- No `payment_intent_data.metadata` needed — the `checkout.session.completed` event carries `client_reference_id` directly.

### Pattern 3: Webhook Handler — Raw Body + constructEvent

**What:** The authoritative payment fulfillment trigger. MUST use `express.raw()`, not `express.json()`.
**When to use:** Stripe POSTs to `/api/webhooks/stripe` after payment.

```typescript
// Source: https://docs.stripe.com/webhooks (official) + stripe-node express example
// backend/src/controllers/payment.controller.ts (webhook handler portion)
import { type Request, type Response } from 'express';
import { getStripe } from '../config/stripe.js';
import { env, isPaymentsEnabled } from '../config/env.js';
import { fulfillPayment } from '../services/payment.service.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'PaymentWebhook' });

export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  if (!isPaymentsEnabled()) {
    res.status(400).json({ error: 'Payments not configured' });
    return;
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  let event: Stripe.Event;
  try {
    // req.body is a Buffer because the route uses express.raw()
    event = getStripe().webhooks.constructEvent(
      req.body as Buffer,
      sig,
      env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    logger.error('Webhook signature verification failed', err as Error);
    res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    return;
  }

  // Return 200 immediately; process async to stay within Stripe's 20-second window
  res.json({ received: true });

  // Handle specific event types
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== 'unpaid') {
        await fulfillPayment(session).catch(err => {
          logger.error('fulfillPayment failed', err as Error, {
            stripeSessionId: session.id,
          });
        });
      }
      break;
    }
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      logger.warn('Async payment failed', undefined, { stripeSessionId: session.id });
      // Optionally emit payment:failed Socket.io event here
      break;
    }
    default:
      logger.info('Unhandled Stripe event', { type: event.type });
  }
}
```

### Pattern 4: Webhook Route Registration — CRITICAL ORDER

**What:** The webhook route MUST be registered BEFORE `express.json()` is applied globally.
**When to use:** In `app.ts`, the webhook route needs `express.raw()` at route level.

The current `app.ts` applies `express.json({ limit: '10mb' })` globally at line 82, BEFORE route
registration. This breaks Stripe webhook verification if the webhook route is registered after it.

**Solution:** Register the webhook route with inline `express.raw()` BEFORE the global `express.json()`
middleware, OR mount it separately before the body-parsing block. The cleanest approach given the
current app structure is a dedicated mounting point:

```typescript
// In app.ts, BEFORE the "Body Parsing Middleware" block:
import paymentRoutes from './routes/payment.routes.js';

// Webhook route — must use raw body parser (before global express.json())
app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

// ... then existing express.json() and other routes
```

OR register the webhook route in `payment.routes.ts` with inline middleware:

```typescript
// backend/src/routes/payment.routes.ts
import { Router } from 'express';
import express from 'express';
import { createCheckoutSession, handleStripeWebhook } from '../controllers/payment.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Webhook: raw body required for Stripe signature verification
// MUST be registered before express.json() runs on this request
router.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

// Checkout session creation
router.post(
  '/payments/checkout',
  optionalAuthMiddleware,
  createCheckoutSession
);

export default router;
```

And mount in `app.ts` BEFORE the global `express.json()` block.

### Pattern 5: Fulfillment — Idempotent DB Update

**What:** The fulfillment function is the authoritative transition: sets `isPaid`, records `stripePaymentIntentId`, advances phase to COMPLETE.
**When to use:** Called from webhook handler after `checkout.session.completed`.

```typescript
// Source: https://docs.stripe.com/checkout/fulfillment (official pattern)
// backend/src/services/payment.service.ts
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { getSocketServer } from '../server.js';  // or pass io as dependency
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'PaymentService' });

export async function fulfillPayment(session: Stripe.Checkout.Session): Promise<void> {
  // Recover our renovation session ID from client_reference_id (primary)
  // or metadata.renovationSessionId (fallback)
  const renovationSessionId =
    session.client_reference_id ??
    session.metadata?.renovationSessionId;

  if (!renovationSessionId) {
    logger.error('No renovationSessionId in Stripe session', new Error('Missing ID'), {
      stripeSessionId: session.id,
    });
    return;
  }

  // IDEMPOTENCY CHECK: skip if already fulfilled
  const [existing] = await db
    .select({ isPaid: renovationSessions.isPaid })
    .from(renovationSessions)
    .where(eq(renovationSessions.id, renovationSessionId));

  if (!existing) {
    logger.error('Renovation session not found', new Error('Not found'), { renovationSessionId });
    return;
  }

  if (existing.isPaid) {
    logger.info('Payment already fulfilled (idempotent skip)', { renovationSessionId });
    return;
  }

  // Extract payment intent ID — session.payment_intent may be string | PaymentIntent | null
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // Atomic update: isPaid + stripePaymentIntentId + phase transition
  await db
    .update(renovationSessions)
    .set({
      isPaid: true,
      stripePaymentIntentId: paymentIntentId,
      phase: 'COMPLETE',
      updatedAt: new Date(),
    })
    .where(eq(renovationSessions.id, renovationSessionId));

  logger.info('Payment fulfilled — session advanced to COMPLETE', {
    renovationSessionId,
    stripeSessionId: session.id,
    paymentIntentId,
  });

  // Emit real-time event so frontend transitions without polling
  const io = getSocketServer();
  io.to(renovationSessionId).emit('payment:completed', {
    sessionId: renovationSessionId,
  });
  io.to(renovationSessionId).emit('session:phase_changed', {
    sessionId: renovationSessionId,
    phase: 'COMPLETE',
  });

  // Enqueue branded receipt email if Resend is configured
  // (Stripe sends automatic receipts by default — only queue if custom branding needed)
}
```

**Key points:**
- Idempotency guard (`if (existing.isPaid)`) prevents double-fulfillment from Stripe retries.
- `phase: 'COMPLETE'` update is atomic with `isPaid` — no separate state machine transition call needed.
- The existing `session:phase_changed` Socket.io event (already in `ServerToClientEvents`) handles the frontend transition.
- `payment:completed` is a new event to add to `shared-types`.

### Pattern 6: New Socket.io Events

Add to `packages/shared-types/src/socket-events.ts`:

```typescript
// New payloads
export interface PaymentCompletedPayload {
  sessionId: string;
}

export interface PaymentFailedPayload {
  sessionId: string;
  reason?: string;
}

// Add to ServerToClientEvents:
'payment:completed': (data: PaymentCompletedPayload) => void;
'payment:failed': (data: PaymentFailedPayload) => void;
```

### Anti-Patterns to Avoid

- **Placing the webhook route AFTER global `express.json()` middleware.** The JSON parser will consume and parse the body buffer, causing `constructEvent` to throw `SignatureVerificationError`. The webhook route MUST receive the raw `Buffer`.
- **Fulfilling on success_url redirect only.** The customer may close the browser tab before reaching `success_url`. The webhook is the only reliable fulfillment signal.
- **Skipping `payment_status !== 'unpaid'` check.** For deferred payment methods (ACH, BACS), `checkout.session.completed` fires before funds are captured. Always check `payment_status`.
- **Hardcoding price amount.** Use `STRIPE_PRICE_AMOUNT_CENTS` env var — allows per-deployment pricing without code changes.
- **Using a Stripe Price ID without creating it in dashboard first.** Using `price_data` (inline) avoids the need to pre-create products in the Stripe dashboard, which simplifies dev setup.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature verification | Custom HMAC comparison | `stripe.webhooks.constructEvent()` | Stripe SDK handles timing-safe comparison, header parsing, and tolerance window |
| Payment form / card input UI | Custom `<input>` fields | Stripe Checkout hosted page | PCI DSS scope — self-hosting card inputs requires SAQ D compliance |
| Idempotency keys for API calls | UUID generation per call | Stripe SDK's built-in idempotency OR DB check before fulfillment | Stripe Checkout Sessions are already idempotent per session; fulfillment idempotency is a DB-level `isPaid` check |
| Retry logic for Stripe API calls | `while` retry loop | Stripe SDK has built-in retry with `maxNetworkRetries` option | Stripe SDK handles 429/503 with exponential backoff |
| Payment UI state machine | Custom React state | TanStack Query + Socket.io `payment:completed` event | Already established pattern in codebase for render/doc events |

**Key insight:** The Stripe SDK handles the hard cryptographic and network problems. The only custom code is: (1) route the raw body correctly, (2) idempotent DB update, (3) emit Socket.io events.

---

## Common Pitfalls

### Pitfall 1: Raw Body Destroyed by express.json()
**What goes wrong:** `constructEvent` throws `No signatures found matching the expected signature for payload`. Webhook verification fails for every request.
**Why it happens:** `express.json()` is registered globally in `app.ts` at line 82, before route handlers. If the webhook route is added after this point in the middleware chain, `req.body` is already a parsed JS object, not the raw `Buffer` that Stripe's HMAC verification needs.
**How to avoid:** Register `/api/webhooks/stripe` with `express.raw({ type: 'application/json' })` at route level AND mount this route BEFORE the global `express.json()` middleware in `app.ts`.
**Warning signs:** `SignatureVerificationError` in logs; all other routes work fine.

### Pitfall 2: Stripe Session ID vs Internal Session ID Confusion
**What goes wrong:** The webhook handler tries to look up a Stripe Checkout Session ID (e.g. `cs_test_...`) in the `renovation_sessions` table.
**Why it happens:** `event.data.object.id` is the Stripe-side session ID, not the renovation session UUID. These are different.
**How to avoid:** Always recover the renovation session ID from `session.client_reference_id` (or `session.metadata.renovationSessionId`), not from `session.id`.
**Warning signs:** DB lookup returning 0 rows; no errors but session never marked paid.

### Pitfall 3: Timing — Return 2xx Before Heavy Processing
**What goes wrong:** Stripe marks webhook delivery as failed and retries repeatedly. Duplicate fulfillments attempted.
**Why it happens:** Webhook handler awaits the entire DB update + Socket.io emit chain before calling `res.json()`. If this takes >20 seconds, Stripe considers it failed.
**How to avoid:** Call `res.json({ received: true })` first, then process asynchronously with `.catch()` error logging (see Pattern 3 above).
**Warning signs:** Stripe dashboard shows repeated delivery attempts; `isPaid` toggled multiple times.

### Pitfall 4: Double-Fulfillment from Stripe Retries
**What goes wrong:** The session is advanced to COMPLETE twice; duplicate emails sent.
**Why it happens:** Stripe retries webhook delivery on any non-2xx response (or timeout). The idempotency guard is missing.
**How to avoid:** Check `existing.isPaid` before executing the DB update. The guard must be present EVEN IF you return 2xx immediately, because concurrent requests can race.
**Warning signs:** `stripePaymentIntentId` being overwritten; duplicate receipt emails.

### Pitfall 5: `STRIPE_PRICE_AMOUNT_CENTS` Missing from env schema
**What goes wrong:** TypeScript build fails, or env validation rejects the app startup.
**Why it happens:** The new env var is used in `payment.service.ts` but not declared in `env.ts` Zod schema.
**How to avoid:** Add `STRIPE_PRICE_AMOUNT_CENTS: z.coerce.number().int().positive().default(4900)` to `envSchema` in `env.ts` alongside the existing Stripe keys.
**Warning signs:** `Property 'STRIPE_PRICE_AMOUNT_CENTS' does not exist on type 'Env'` TypeScript error.

### Pitfall 6: Dev Without Stripe Keys
**What goes wrong:** `getStripe()` throws at startup; backend crashes before even reaching the payment routes.
**Why it happens:** Stripe client is initialized eagerly at module import time.
**How to avoid:** Use lazy initialization (Pattern 1). `getStripe()` is only called when a payment route is actually hit. When `isPaymentsEnabled() === false`, the checkout route returns a mock response (dev bypass — see below).
**Warning signs:** Backend fails to start with "STRIPE_SECRET_KEY is required".

---

## Dev Bypass Strategy

When `isPaymentsEnabled() === false` (i.e., no Stripe keys in `.env`):

1. The `POST /api/payments/checkout` endpoint returns a **mock bypass response** instead of creating a real Stripe session:
   ```json
   {
     "url": null,
     "devBypass": true,
     "message": "Stripe not configured — use POST /api/payments/dev-complete to bypass"
   }
   ```

2. A **dev-only endpoint** `POST /api/payments/dev-complete` is mounted only when `NODE_ENV !== 'production'`. It directly calls `fulfillPayment()` (same DB update + Socket.io emit) without Stripe, allowing E2E testing of the PAYMENT → COMPLETE transition locally.

3. The frontend detects `devBypass: true` and shows a "Skip Payment (Dev Mode)" button instead of the Stripe redirect.

This pattern mirrors how auth works: `isAuthEnabled()` returns false → anonymous mode. `isPaymentsEnabled()` returns false → dev bypass mode.

---

## Code Examples

### Create Checkout Session — Controller
```typescript
// Source: Official Stripe docs pattern + codebase service/controller pattern
// backend/src/controllers/payment.controller.ts
import { type Request, type Response } from 'express';
import { createCheckoutSession as createSession } from '../services/payment.service.js';
import { isPaymentsEnabled } from '../config/env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'PaymentController' });

export async function createCheckoutSession(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const userEmail = req.user?.email; // from optionalAuthMiddleware

  if (!isPaymentsEnabled()) {
    res.json({ url: null, devBypass: true, message: 'Stripe not configured' });
    return;
  }

  try {
    const { url, checkoutSessionId } = await createSession(sessionId, userEmail);
    logger.info('Checkout session created', { sessionId, checkoutSessionId });
    res.json({ url, checkoutSessionId });
  } catch (err) {
    logger.error('Failed to create checkout session', err as Error, { sessionId });
    res.status(500).json({ error: 'Failed to create payment session' });
  }
}
```

### Stripe CLI Local Testing
```bash
# Install Stripe CLI (macOS/Windows/Linux — see https://docs.stripe.com/stripe-cli)
# Then:

# 1. Log in (once)
stripe login

# 2. Forward webhooks to local backend
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
# Output: Ready! Your webhook signing secret is whsec_... (use this in STRIPE_WEBHOOK_SECRET)

# 3. Trigger test checkout completion (in a separate terminal)
stripe trigger checkout.session.completed

# 4. Test card numbers (Stripe test mode)
# Success: 4242 4242 4242 4242
# Decline: 4000 0000 0000 0002
# Auth required: 4000 0025 0000 3155
```

**The CLI signing secret (`whsec_...`) is stable across restarts — set it as `STRIPE_WEBHOOK_SECRET` in `backend/.env` for local dev.**

### Frontend Payment Hook Pattern
```typescript
// frontend/hooks/usePayment.ts
// Pattern matches useRequestRender.ts exactly
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';
import { sessionQueryKey } from './useSession';

export function useCreateCheckout(sessionId: string) {
  return useMutation({
    mutationFn: async () => {
      return fetchWithAuth<{ url: string | null; devBypass?: boolean }>(
        `/api/payments/checkout/${sessionId}`,
        { method: 'POST' }
      );
    },
    onSuccess: ({ url, devBypass }) => {
      if (devBypass) {
        // Show dev bypass UI
        return;
      }
      if (url) {
        // Redirect to Stripe hosted page
        window.location.href = url;
      }
    },
  });
}
```

### Socket.io Payment Event Handler (Frontend)
```typescript
// In useSocketQuerySync.ts — add alongside existing render/doc event handlers
socket.on('payment:completed', ({ sessionId: sid }) => {
  if (sid === sessionId) {
    // Invalidate session query so phase shows COMPLETE
    queryClient.invalidateQueries({ queryKey: sessionQueryKey(sessionId) });
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `stripe.webhooks.constructEvent` + `bodyParser.raw` (v2 express) | `stripe.webhooks.constructEvent` + `express.raw({ type: 'application/json' })` inline on route | Express 4.x | Inline middleware per-route is cleaner than global `bodyParser` |
| Manual `apiVersion` string in `new Stripe(key, { apiVersion })` | No `apiVersion` option in v17+ — SDK pins to release-time API version automatically | stripe-node v17 | Don't pass `apiVersion` option — it causes TypeScript errors in v17+ |
| `price` parameter (requires pre-created Stripe Price object) | `price_data` (inline, no dashboard setup required) | Always available, now preferred for simple products | Dev setup is easier — no Stripe dashboard required |
| Checking `payment_intent.succeeded` event | `checkout.session.completed` + `payment_status !== 'unpaid'` | Checkout Sessions API | Checkout Sessions are the higher-level abstraction; PaymentIntent events are redundant when using Checkout |

**Deprecated/outdated:**
- Passing `apiVersion` to `new Stripe()` constructor in v17+: now unnecessary and causes TS errors.
- `bodyParser.raw()` (separate package): superseded by `express.raw()` built into Express 4.x.
- `payment_intent.succeeded` as primary fulfillment event for Checkout: use `checkout.session.completed` instead.

---

## Open Questions

1. **Price amount / pricing strategy**
   - What we know: Env var pattern is established; default of 4900 ($49) is a placeholder.
   - What's unclear: Actual product price and whether to support multiple tiers.
   - Recommendation: Add `STRIPE_PRICE_AMOUNT_CENTS` to env.ts with default 4900; let the operator configure it. Do not implement tiered pricing in Phase 4.

2. **`getSocketServer()` export pattern**
   - What we know: The webhook handler needs the `io` Socket.io server instance to emit events. The current `server.ts` may not export `io`.
   - What's unclear: Whether `server.ts` already exports a `getSocketServer()` function.
   - Recommendation: Check `server.ts` during planning. If not exported, add a singleton export matching the `getStripe()` pattern.

3. **Success URL handling — race condition**
   - What we know: When the user returns to `success_url`, the webhook may not have fired yet. If the frontend immediately queries `session.isPaid`, it will still be `false`.
   - What's unclear: Should the frontend poll for a few seconds on `?payment=success`, or rely purely on the Socket.io `payment:completed` event?
   - Recommendation: On `?payment=success` query param present, show a "Completing payment..." spinner and listen for `payment:completed` Socket.io event (max 10s timeout). Do NOT poll the REST endpoint.

---

## Sources

### Primary (HIGH confidence)
- Official Stripe docs: `https://docs.stripe.com/payments/checkout/how-checkout-works` — Checkout Session flow
- Official Stripe docs: `https://docs.stripe.com/webhooks` — raw body requirement, constructEvent, idempotency
- Official Stripe docs: `https://docs.stripe.com/checkout/fulfillment` — payment_status check, concurrent fulfillment guard
- Official Stripe docs: `https://docs.stripe.com/payments/quickstart-checkout-sessions` — Node.js session creation example
- Official Stripe docs: `https://docs.stripe.com/cli/listen` — webhook signing secret persistence
- stripe-node GitHub README: `https://github.com/stripe/stripe-node` — ESM import pattern, TypeScript initialization

### Secondary (MEDIUM confidence)
- WebSearch result: stripe-node v20.4.0 is current latest (2026-03-19)
- WebSearch result: Stripe API version 2026-02-25.clover is current
- stripe-node Express webhook example: `https://github.com/stripe/stripe-node/blob/master/examples/webhook-signing/express/main.ts`

### Tertiary (LOW confidence)
- N/A — all critical claims verified against official documentation.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Stripe SDK is the only library; version from npm search result (v20.4.0)
- Architecture (Checkout Session hosted redirect): HIGH — verified against official docs
- Webhook raw body requirement: HIGH — explicitly stated in official Stripe docs
- Phase gate location (chat handler, not HTTP middleware): HIGH — follows established codebase pattern; PAYMENT phase is chat-first
- Idempotency pattern: HIGH — explicitly documented in official Stripe fulfillment guide
- Dev bypass strategy: MEDIUM — pattern inferred from `isAuthEnabled()` precedent in codebase; not a Stripe-documented pattern
- Socket.io event names (`payment:completed`): MEDIUM — names follow existing codebase conventions (`render:complete`, `doc:generation_complete`); not external source
- Success URL race condition handling: MEDIUM — recommendation is based on architectural reasoning, not a documented Stripe pattern

**Research date:** 2026-03-19
**Valid until:** 2026-06-19 (Stripe API is stable; stripe-node major version unlikely to change in 90 days)
