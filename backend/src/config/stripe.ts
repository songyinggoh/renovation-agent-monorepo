import Stripe from 'stripe';
import { env, isPaymentsEnabled } from './env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'StripeConfig' });

let _stripe: Stripe | null = null;

/**
 * Get the lazy-initialized Stripe client.
 *
 * Throws if Stripe keys are not configured. Guard with
 * isPaymentsEnabled() before calling in optional-payment codepaths.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!isPaymentsEnabled()) {
      throw new Error(
        'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in your environment.'
      );
    }
    if (!env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is required when payments are enabled');
    }
    _stripe = new Stripe(env.STRIPE_SECRET_KEY);
    logger.info('Stripe client initialized');
  }
  return _stripe;
}
