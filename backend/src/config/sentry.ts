import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { env } from './env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'Sentry' });

/**
 * Initialize Sentry error tracking and performance monitoring
 *
 * Call once during application startup, before any other middleware.
 * No-ops gracefully if SENTRY_DSN is not configured.
 */
export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    logger.info('Sentry DSN not configured — error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
    release: `renovation-agent-backend@${process.env.npm_package_version || '1.0.0'}`,

    // Performance monitoring
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Profiling
    profilesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,

    integrations: [
      nodeProfilingIntegration(),
    ],

    // Filter sensitive data
    beforeSend(event) {
      // Strip sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },
  });

  logger.info('Sentry initialized', {
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV,
  });
}

/**
 * Check if Sentry is enabled
 */
export function isSentryEnabled(): boolean {
  return !!env.SENTRY_DSN;
}

export { Sentry };
