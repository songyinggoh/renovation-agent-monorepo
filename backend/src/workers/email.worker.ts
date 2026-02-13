import { type Job } from 'bullmq';
import { createWorker, type JobTypes } from '../config/queue.js';
import { getResendClient } from '../config/email.js';
import { isEmailEnabled, env } from '../config/env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'EmailWorker' });

type EmailJobData = JobTypes['email:send-notification'];

/**
 * Process an email job from the BullMQ queue
 *
 * The job data contains `to`, `subject`, `template`, and `data.html`.
 * The worker sends the email via Resend and logs the result.
 */
async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { to, subject, data } = job.data;
  const html = (data as Record<string, unknown>).html as string;

  logger.info('Processing email job', { jobId: job.id, to, subject });

  if (!isEmailEnabled()) {
    logger.info('Email disabled — skipping job', { jobId: job.id });
    return;
  }

  const resend = getResendClient();
  if (!resend) {
    throw new Error('Resend client not available');
  }

  const { data: result, error } = await resend.emails.send({
    from: env.FROM_EMAIL,
    to: [to],
    subject,
    html,
  });

  if (error) {
    logger.error('Resend API error in worker', new Error(error.message), {
      jobId: job.id,
      to,
      subject,
    });
    throw new Error(`Resend error: ${error.message}`);
  }

  logger.info('Email sent by worker', { jobId: job.id, emailId: result?.id, to });
}

/**
 * Start the email worker
 *
 * Returns the worker instance for shutdown registration.
 * Concurrency is kept low (2) to respect Resend rate limits.
 */
export function startEmailWorker() {
  const worker = createWorker('email:send-notification', processEmailJob, 2);

  logger.info('Email worker started');
  return worker;
}
