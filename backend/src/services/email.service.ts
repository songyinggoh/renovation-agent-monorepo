import { getResendClient } from '../config/email.js';
import { isEmailEnabled, env } from '../config/env.js';
import { getEmailQueue } from '../config/queue.js';
import { renderTemplate, type TemplateName, type TemplateDataMap } from '../emails/templates.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'EmailService' });

/**
 * Result type for email send operations
 * Allows callers to distinguish between different failure modes
 */
export type EmailSendResult =
  | { success: true; emailId: string }
  | { success: false; reason: 'disabled' | 'not_configured' | 'api_error' | 'network_error'; error?: Error };

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
   *
   * Returns EmailSendResult to allow callers to distinguish failure modes:
   * - disabled: Email feature not enabled (RESEND_API_KEY not set)
   * - not_configured: Client initialization failed
   * - api_error: Resend API returned an error
   * - network_error: Network/exception during send
   */
  async sendEmail(to: string, subject: string, html: string): Promise<EmailSendResult> {
    if (!isEmailEnabled()) {
      logger.info('Email disabled — skipping send', { to, subject });
      return { success: false, reason: 'disabled' };
    }

    const resend = getResendClient();
    if (!resend) {
      // Issue #7 fix: Log when client unavailable despite email being enabled
      logger.warn('Email enabled but Resend client unavailable', undefined, { to, subject });
      return { success: false, reason: 'not_configured' };
    }

    try {
      const { data, error } = await resend.emails.send({
        from: env.FROM_EMAIL,
        to: [to],
        subject,
        html,
      });

      if (error) {
        const err = new Error(error.message);
        logger.error('Resend API error', err, { to, subject });
        return { success: false, reason: 'api_error', error: err };
      }

      const emailId = data?.id ?? 'unknown';
      logger.info('Email sent', { to, subject, emailId });
      return { success: true, emailId };
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to send email', error, { to, subject });
      return { success: false, reason: 'network_error', error };
    }
  }

  /**
   * Legacy method for backward compatibility
   * Returns emailId on success, null on failure
   */
  async sendEmailLegacy(to: string, subject: string, html: string): Promise<string | null> {
    const result = await this.sendEmail(to, subject, html);
    return result.success ? result.emailId : null;
  }

  /**
   * Render a template and send immediately
   */
  async sendTemplated<T extends TemplateName>(
    to: string,
    template: T,
    data: TemplateDataMap[T],
  ): Promise<EmailSendResult> {
    const { subject, html } = renderTemplate(template, data);
    return this.sendEmail(to, subject, html);
  }

  /**
   * Legacy method for backward compatibility
   */
  async sendTemplatedLegacy<T extends TemplateName>(
    to: string,
    template: T,
    data: TemplateDataMap[T],
  ): Promise<string | null> {
    const result = await this.sendTemplated(to, template, data);
    return result.success ? result.emailId : null;
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
