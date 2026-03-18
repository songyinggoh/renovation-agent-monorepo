import { type Request, type Response } from 'express';
import type Stripe from 'stripe';
import { getStripe } from '../config/stripe.js';
import { env, isPaymentsEnabled } from '../config/env.js';
import {
  createCheckoutSession,
  fulfillPayment,
  devCompletePayment,
  getPaymentStatus,
} from '../services/payment.service.js';
import { emitToSession } from '../utils/socket-emitter.js';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { eq } from 'drizzle-orm';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'PaymentController' });

/**
 * POST /api/payments/checkout/:sessionId
 *
 * Creates a Stripe Checkout Session and returns the redirect URL.
 * When Stripe is not configured, returns a dev-bypass response.
 *
 * Security:
 * - optionalAuthMiddleware (upstream): extracts req.user if auth is enabled
 * - verifySessionOwnership (upstream): ensures caller owns the session (SECURITY-CHECKLIST E4, S4)
 * - Phase gate (E5): rejects if session is not in PAYMENT phase
 * - isPaid check: rejects if session is already paid
 */
export async function handleCreateCheckout(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const userEmail = req.user?.email;

  // Dev bypass: return mock response when Stripe is not configured
  if (!isPaymentsEnabled()) {
    res.json({
      url: null,
      devBypass: true,
      message:
        'Stripe not configured — use POST /api/payments/dev-complete/:sessionId to bypass',
    });
    return;
  }

  try {
    // Phase gate check (SECURITY-CHECKLIST E5): verify session is in PAYMENT phase
    const [session] = await db
      .select({ phase: renovationSessions.phase, isPaid: renovationSessions.isPaid })
      .from(renovationSessions)
      .where(eq(renovationSessions.id, sessionId))
      .limit(1);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.phase !== 'PAYMENT') {
      res.status(400).json({ error: 'Session is not in PAYMENT phase' });
      return;
    }

    if (session.isPaid) {
      res.status(400).json({ error: 'Session is already paid' });
      return;
    }

    const { url, checkoutSessionId } = await createCheckoutSession(sessionId, userEmail);
    logger.info('Checkout session created', { sessionId, checkoutSessionId });
    res.json({ url, checkoutSessionId });
  } catch (err) {
    logger.error('Failed to create checkout session', err as Error, { sessionId });
    res.status(500).json({ error: 'Failed to create payment session' });
  }
}

/**
 * POST /api/webhooks/stripe
 *
 * Authoritative payment fulfillment trigger.
 * MUST be mounted with express.raw({ type: 'application/json' }) BEFORE express.json()
 * so req.body is a raw Buffer for Stripe signature verification.
 *
 * Security:
 * - W1: Uses stripe.webhooks.constructEvent() — never hand-rolls HMAC
 * - W2: Requires raw Buffer body (mounted before express.json() in app.ts)
 * - W3: Validates stripe-signature header presence
 * - W4: Returns 200 immediately, processes fulfillment asynchronously
 * - W5: fulfillPayment() implements idempotency guard
 * - W6: Checks payment_status !== 'unpaid' before fulfilling
 * - W8: Handles checkout.session.async_payment_succeeded in addition to .completed
 */
export async function handleStripeWebhook(req: Request, res: Response): Promise<void> {
  if (!isPaymentsEnabled()) {
    res.status(400).json({ error: 'Payments not configured' });
    return;
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    // SECURITY-CHECKLIST W3: reject requests without signature header
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  let event: Stripe.Event;
  try {
    // SECURITY-CHECKLIST W1: use constructEvent (timing-safe HMAC comparison)
    // req.body is a Buffer because the route uses express.raw() (W2)
    // The ! assertion on STRIPE_WEBHOOK_SECRET is safe: isPaymentsEnabled() already
    // confirmed both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set.
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

  // SECURITY-CHECKLIST W4: return 200 immediately before async processing
  // Stripe retries on non-2xx or timeout (>20s). Synchronous processing risks duplicate delivery.
  res.json({ received: true });

  // Process event asynchronously — errors are logged but cannot affect the 200 already sent
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      // SECURITY-CHECKLIST W8: handle async payment methods (ACH, BACS)
      const session = event.data.object as Stripe.Checkout.Session;
      // SECURITY-CHECKLIST W6: deferred payment methods fire .completed before funds captured
      if (session.payment_status !== 'unpaid') {
        fulfillPayment(session).catch((err: Error) => {
          logger.error('fulfillPayment failed', err, {
            stripeSessionId: session.id,
          });
        });
      }
      break;
    }
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const renovationSessionId = session.client_reference_id;
      // SECURITY-CHECKLIST W11: log event type + id; do NOT log customer details (D2)
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
      // SECURITY-CHECKLIST W11: log all unhandled event types for post-incident analysis
      logger.info('Unhandled Stripe event', { type: event.type, eventId: event.id });
  }
}

/**
 * POST /api/payments/dev-complete/:sessionId  (dev/staging only)
 *
 * Dev-only payment bypass. Mounted ONLY when NODE_ENV !== 'production' in app.ts.
 * The NODE_ENV guard is at route registration time (SECURITY-CHECKLIST B1).
 */
export async function handleDevComplete(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  try {
    const result = await devCompletePayment(sessionId);
    res.json(result);
  } catch (err) {
    logger.error('Dev complete payment failed', err as Error, { sessionId });
    res.status(500).json({ error: (err as Error).message });
  }
}

/**
 * GET /api/payments/status/:sessionId
 *
 * Returns the current payment status for a session.
 */
export async function handleGetPaymentStatus(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  try {
    const result = await getPaymentStatus(sessionId);
    res.json(result);
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    const status = error.statusCode ?? 500;
    logger.error('Failed to get payment status', error, { sessionId });
    res.status(status).json({ error: error.message });
  }
}
