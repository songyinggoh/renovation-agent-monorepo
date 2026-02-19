import { type Job, UnrecoverableError } from 'bullmq';
import { createWorker, type JobTypes } from '../config/queue.js';
import { getResendClient } from '../config/email.js';
import { isEmailEnabled, env } from '../config/env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'EmailWorker' });

type EmailJobData = JobTypes['email:send-notification'];

/**
 * Permanent error codes that should NOT be retried
 * These indicate configuration or data problems that won't resolve with retries
 */
const PERMANENT_ERROR_CODES = new Set([
  'invalid_from_address',
  'invalid_to_address',
  'validation_error',
  'missing_required_field',
  'invalid_parameter',
]);

/**
 * Check if an error message indicates a permanent failure
 */
function isPermanentError(errorMessage: string): boolean {
  const lowerMsg = errorMessage.toLowerCase();

  // Check for known permanent error patterns
  if (PERMANENT_ERROR_CODES.has(lowerMsg)) return true;
  if (lowerMsg.includes('invalid') && lowerMsg.includes('email')) return true;
  if (lowerMsg.includes('validation')) return true;
  if (lowerMsg.includes('missing required')) return true;

  return false;
}

/**
 * Process an email job from the BullMQ queue
 *
 * The job data contains `to`, `subject`, `template`, and `data.html`.
 * The worker sends the email via Resend and logs the result.
 *
 * Error handling:
 * - Validates job data before processing
 * - Distinguishes between retriable (network) and permanent (validation) errors
 * - Uses UnrecoverableError for permanent failures to prevent futile retries
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { to, subject, data } = job.data;

  // Validate job data (Issue #3 fix)
  if (!to || typeof to !== 'string') {
    throw new UnrecoverableError('Invalid job data: "to" must be a string');
  }
  if (!subject || typeof subject !== 'string') {
    throw new UnrecoverableError('Invalid job data: "subject" must be a string');
  }
  if (!data || typeof data !== 'object') {
    throw new UnrecoverableError('Invalid job data: "data" must be an object');
  }

  const dataObj = data as Record<string, unknown>;
  if (!dataObj.html || typeof dataObj.html !== 'string') {
    throw new UnrecoverableError('Invalid job data: "data.html" must be a string');
  }

  const html = dataObj.html;

  logger.info('Processing email job', { jobId: job.id, to, subject });

  if (!isEmailEnabled()) {
    logger.info('Email disabled — skipping job', { jobId: job.id });
    return;
  }

  const resend = getResendClient();
  if (!resend) {
    throw new UnrecoverableError('Resend client not available - check RESEND_API_KEY configuration');
  }

  try {
    // Wrap Resend call in try/catch to capture network errors (Issue #2 fix)
    const { data: result, error } = await resend.emails.send({
      from: env.FROM_EMAIL,
      to: [to],
      subject,
      html,
    });

    if (error) {
      const errorMsg = error.message || 'Unknown Resend error';
      logger.error('Resend API error in worker', new Error(errorMsg), {
        jobId: job.id,
        to,
        subject,
        errorName: error.name,
      });

      // Issue #4 fix: Distinguish retriable from permanent errors
      if (isPermanentError(errorMsg)) {
        throw new UnrecoverableError(`Permanent Resend error: ${errorMsg}`);
      }

      // Retriable error (rate limit, temporary API issue)
      throw new Error(`Resend error: ${errorMsg}`);
    }

    logger.info('Email sent by worker', { jobId: job.id, emailId: result?.id, to });
  } catch (err) {
    // If it's already an UnrecoverableError, re-throw as-is
    if (err instanceof UnrecoverableError) {
      throw err;
    }

    // Network/timeout errors - these should be retried
    const error = err as Error;
    logger.error('Network/exception error sending email', error, {
      jobId: job.id,
      to,
      subject,
      errorType: error.constructor.name,
    });

    // Re-throw for BullMQ retry
    throw new Error(`Email send failed: ${error.message}`);
  }
}

/**
 * Start the email worker.
 * Concurrency, rate limiting, and timeouts derived from WORKER_PROFILES.
 */
export function startEmailWorker() {
  const worker = createWorker('email:send-notification', processEmailJob);
  logger.info('Email worker started');
  return worker;
}
