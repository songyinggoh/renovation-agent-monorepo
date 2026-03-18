import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { getStripe } from '../config/stripe.js';
import { env, isPaymentsEnabled } from '../config/env.js';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { emitToSession } from '../utils/socket-emitter.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'PaymentService' });

/**
 * Create a Stripe Checkout Session for a renovation session.
 *
 * Only call this after verifying isPaymentsEnabled() === true.
 * The caller (controller) is responsible for the isPaymentsEnabled guard.
 */
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
          unit_amount: env.STRIPE_PRICE_AMOUNT_CENTS,
          product_data: {
            name: 'Renovation Plan Package',
            description: 'AI-generated renovation plan with renders and documents',
          },
        },
        quantity: 1,
      },
    ],
    // client_reference_id is the primary tie-back to our session record.
    // It appears on the checkout.session.completed webhook event.
    client_reference_id: sessionId,
    // metadata is a redundant backup in case client_reference_id is ever absent
    metadata: { renovationSessionId: sessionId },
    ...(userEmail ? { customer_email: userEmail } : {}),
    success_url: `${env.FRONTEND_URL}/sessions/${sessionId}?payment=success`,
    cancel_url: `${env.FRONTEND_URL}/sessions/${sessionId}?payment=cancelled`,
  });

  if (!checkoutSession.url) {
    throw new Error('Stripe did not return a checkout URL');
  }

  return {
    url: checkoutSession.url,
    checkoutSessionId: checkoutSession.id,
  };
}

/**
 * Fulfill a payment after a confirmed Stripe Checkout.
 *
 * SECURITY-CRITICAL: This is the ONLY code path that sets isPaid = true.
 * Implements idempotency to handle Stripe webhook retries safely.
 *
 * Do NOT log paymentIntentId (SECURITY-CHECKLIST D1).
 * Do NOT log customer email (SECURITY-CHECKLIST D2).
 * Do NOT pass the raw Stripe session object to logger (SECURITY-CHECKLIST D3).
 */
export async function fulfillPayment(session: Stripe.Checkout.Session): Promise<void> {
  // Recover our renovation session ID from client_reference_id (primary),
  // or metadata.renovationSessionId (fallback backup)
  const renovationSessionId =
    session.client_reference_id ?? session.metadata?.renovationSessionId;

  if (!renovationSessionId) {
    logger.error(
      'No renovationSessionId in Stripe session — cannot fulfill',
      new Error('Missing renovationSessionId'),
      { stripeSessionId: session.id }
    );
    return;
  }

  // IDEMPOTENCY CHECK: skip if already fulfilled (handles Stripe webhook retries)
  const [existing] = await db
    .select({ isPaid: renovationSessions.isPaid })
    .from(renovationSessions)
    .where(eq(renovationSessions.id, renovationSessionId));

  if (!existing) {
    logger.error(
      'Renovation session not found during fulfillment',
      new Error('Session not found'),
      { renovationSessionId }
    );
    return;
  }

  if (existing.isPaid) {
    logger.info('Payment already fulfilled (idempotent skip)', { renovationSessionId });
    return;
  }

  // Extract payment intent ID safely — may be string | PaymentIntent | null
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  // ATOMIC DB UPDATE: isPaid + stripePaymentIntentId + phase transition in one call
  await db
    .update(renovationSessions)
    .set({
      isPaid: true,
      stripePaymentIntentId: paymentIntentId,
      phase: 'COMPLETE',
      updatedAt: new Date(),
    })
    .where(eq(renovationSessions.id, renovationSessionId));

  // Log safe fields only — do NOT log paymentIntentId (SECURITY-CHECKLIST D1)
  logger.info('Payment fulfilled', {
    renovationSessionId,
    stripeSessionId: session.id,
  });

  // Emit real-time events so the frontend transitions without polling
  emitToSession(renovationSessionId, 'payment:completed', {
    sessionId: renovationSessionId,
  });
  emitToSession(renovationSessionId, 'session:phase_changed', {
    sessionId: renovationSessionId,
    phase: 'COMPLETE',
  });
}

/**
 * Dev-only payment bypass — directly fulfills a session without Stripe.
 *
 * This function mirrors fulfillPayment() but does not set stripePaymentIntentId.
 * The route that calls this MUST be mounted only in NODE_ENV !== 'production' (SECURITY-CHECKLIST B1).
 */
export async function devCompletePayment(
  sessionId: string
): Promise<{ devBypass: true; warning: string; sessionId: string } | { alreadyPaid: true }> {
  // IDEMPOTENCY CHECK: same guard as fulfillPayment
  const [existing] = await db
    .select({ isPaid: renovationSessions.isPaid })
    .from(renovationSessions)
    .where(eq(renovationSessions.id, sessionId));

  if (!existing) {
    throw new Error(`Session ${sessionId} not found`);
  }

  if (existing.isPaid) {
    return { alreadyPaid: true };
  }

  // ATOMIC DB UPDATE (no stripePaymentIntentId — dev bypass)
  await db
    .update(renovationSessions)
    .set({
      isPaid: true,
      phase: 'COMPLETE',
      updatedAt: new Date(),
    })
    .where(eq(renovationSessions.id, sessionId));

  logger.info('Dev payment bypass completed', { sessionId });

  // Emit same Socket.io events as fulfillPayment
  emitToSession(sessionId, 'payment:completed', { sessionId });
  emitToSession(sessionId, 'session:phase_changed', {
    sessionId,
    phase: 'COMPLETE',
  });

  return {
    devBypass: true,
    warning: 'THIS ENDPOINT DOES NOT EXIST IN PRODUCTION',
    sessionId,
  };
}

/**
 * Get the current payment status for a session.
 */
export async function getPaymentStatus(
  sessionId: string
): Promise<{ isPaid: boolean; phase: string }> {
  const [session] = await db
    .select({ isPaid: renovationSessions.isPaid, phase: renovationSessions.phase })
    .from(renovationSessions)
    .where(eq(renovationSessions.id, sessionId));

  if (!session) {
    throw Object.assign(new Error('Session not found'), { statusCode: 404 });
  }

  return {
    isPaid: session.isPaid ?? false,
    phase: session.phase,
  };
}

// Re-export guard for convenience (used in controller)
export { isPaymentsEnabled };
