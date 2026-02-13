import { getResendClient } from '../config/email.js';
import { isEmailEnabled, env } from '../config/env.js';
import { getEmailQueue } from '../config/queue.js';
import { renderTemplate, type TemplateName, type TemplateDataMap } from '../emails/templates.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'EmailService' });

/**
 * Email service for the Renovation Agent system
 *
 * Supports two modes:
 * - **Sync**: `sendEmail()` / `sendTemplated()` — sends immediately via Resend API
 * - **Async**: `enqueueEmail()` — queues via BullMQ for background delivery
 *
 * Graceful degradation: all methods no-op when RESEND_API_KEY is not set.
 */
export class EmailService {
  /**
   * Send a raw email immediately via Resend
   */
  async sendEmail(to: string, subject: string, html: string): Promise<string | null> {
    if (!isEmailEnabled()) {
      logger.info('Email disabled — skipping send', { to, subject });
      return null;
    }

    const resend = getResendClient();
    if (!resend) return null;

    try {
      const { data, error } = await resend.emails.send({
        from: env.FROM_EMAIL,
        to: [to],
        subject,
        html,
      });

      if (error) {
        logger.error('Resend API error', new Error(error.message), { to, subject });
        return null;
      }

      logger.info('Email sent', { to, subject, emailId: data?.id });
      return data?.id ?? null;
    } catch (err) {
      logger.error('Failed to send email', err as Error, { to, subject });
      return null;
    }
  }

  /**
   * Render a template and send immediately
   */
  async sendTemplated<T extends TemplateName>(
    to: string,
    template: T,
    data: TemplateDataMap[T],
  ): Promise<string | null> {
    const { subject, html } = renderTemplate(template, data);
    return this.sendEmail(to, subject, html);
  }

  /**
   * Enqueue an email for async delivery via BullMQ
   *
   * Preferred for non-critical emails (notifications, summaries).
   * The email worker processes these with retry logic.
   */
  async enqueueEmail<T extends TemplateName>(
    to: string,
    template: T,
    data: TemplateDataMap[T],
  ): Promise<string | null> {
    if (!isEmailEnabled()) {
      logger.info('Email disabled — skipping enqueue', { to, template });
      return null;
    }

    try {
      const { subject, html } = renderTemplate(template, data);
      const queue = getEmailQueue();
      const job = await queue.add(
        'email:send-notification',
        { to, subject, template, data: { html } },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );

      logger.info('Email enqueued', { to, template, jobId: job.id });
      return job.id ?? null;
    } catch (err) {
      logger.error('Failed to enqueue email', err as Error, { to, template });
      return null;
    }
  }
}

/** Singleton email service */
export const emailService = new EmailService();
