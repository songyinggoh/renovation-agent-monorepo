import { Resend } from 'resend';
import { env, isEmailEnabled } from './env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'Email' });

/**
 * Resend email client singleton
 *
 * Initialized lazily on first use. No-ops gracefully when
 * RESEND_API_KEY is not configured.
 */
let _resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (!isEmailEnabled()) return null;
  if (!_resend) {
    _resend = new Resend(env.RESEND_API_KEY);
    logger.info('Resend client initialized');
  }
  return _resend;
}

export { getResendClient };
