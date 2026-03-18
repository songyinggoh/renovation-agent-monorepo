import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from './config/env.js';
import { getImageQueue, getEmailQueue, getDocQueue, getRenderQueue } from './config/queue.js';
import { getDLQ } from './config/dead-letter.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { apiLimiter, chatLimiter } from './middleware/rate-limit.middleware.js';
import { optionalAuthMiddleware } from './middleware/auth.middleware.js';
import { verifySessionOwnership } from './middleware/ownership.middleware.js';
import { Logger } from './utils/logger.js';
import healthRoutes from './routes/health.routes.js';
import sessionRoutes from './routes/session.routes.js';
import messageRoutes from './routes/message.routes.js';
import roomRoutes from './routes/room.routes.js';
import styleRoutes from './routes/style.routes.js';
import productRoutes from './routes/product.routes.js';
import assetRoutes from './routes/asset.routes.js';
import renderRoutes from './routes/render.routes.js';
import documentRoutes from './routes/document.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import {
  handleStripeWebhook,
  handleDevComplete,
} from './controllers/payment.controller.js';

const logger = new Logger({ serviceName: 'App' });

/**
 * Create and configure Express application
 *
 * This function sets up the Express app with middleware and routes
 * but does NOT start the server (that happens in server.ts)
 */
export function createApp(): Application {
  const app = express();

  // ============================================
  // Security: Trust Proxy & Disable X-Powered-By
  // ============================================
  app.set('trust proxy', 1); // Trust the first proxy (reverse proxy / load balancer)
  app.disable('x-powered-by'); // Prevent Express version disclosure

  logger.info('Initializing Express application', {
    nodeEnv: env.NODE_ENV,
    frontendUrl: env.FRONTEND_URL,
  });

  // ============================================
  // Sentry Request Handler (must be first middleware)
  // ============================================
  if (env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  // ============================================
  // Security Headers (Helmet)
  // ============================================
  app.use(helmet({
    contentSecurityPolicy: env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false, // Allow cross-origin resources (images, fonts)
  }));

  // ============================================
  // Request ID Middleware (generates/propagates X-Request-ID)
  // ============================================
  app.use(requestIdMiddleware);

  // ============================================
  // CORS Configuration
  // ============================================
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    })
  );

  // ============================================
  // Stripe Webhook Route (MUST be before express.json())
  //
  // The Stripe webhook requires the raw request body as a Buffer for signature
  // verification via stripe.webhooks.constructEvent(). express.json() would parse
  // the body into a JS object and destroy the raw buffer, causing constructEvent()
  // to throw SignatureVerificationError on every request.
  //
  // SECURITY-CHECKLIST W2, RESEARCH Pitfall 1: This is the #1 Stripe integration failure mode.
  // express.raw() is applied inline at the route level so all other routes continue
  // to receive parsed JSON via the global express.json() below.
  // ============================================
  app.post(
    '/api/webhooks/stripe',
    express.raw({ type: 'application/json' }),
    handleStripeWebhook
  );

  // ============================================
  // Body Parsing Middleware
  // ============================================
  app.use(express.json({ limit: '10mb' })); // Support larger JSON payloads for image data
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ============================================
  // Request Logging Middleware
  // ============================================
  app.use((req: Request, _res: Response, next) => {
    logger.info('Incoming request', {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    next();
  });

  // ============================================
  // Rate Limiting
  // ============================================
  app.use('/api/', apiLimiter);
  app.use('/api/sessions/:sessionId/messages', chatLimiter);

  // ============================================
  // Health Check Routes (no auth required)
  // ============================================
  app.use('/', healthRoutes);

  // ============================================
  // API Routes
  // ============================================
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/sessions', messageRoutes);
  app.use('/api', roomRoutes);
  app.use('/api/styles', styleRoutes);
  app.use('/api', productRoutes);
  app.use('/api', assetRoutes);
  app.use('/api', renderRoutes);
  app.use('/api', documentRoutes);
  app.use('/api', paymentRoutes);

  // ============================================
  // Bull Board (dev/staging only)
  // ============================================
  if (env.NODE_ENV !== 'production') {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');
    createBullBoard({
      queues: [
        new BullMQAdapter(getImageQueue()),
        new BullMQAdapter(getEmailQueue()),
        new BullMQAdapter(getDocQueue()),
        new BullMQAdapter(getRenderQueue()),
        new BullMQAdapter(getDLQ()),
      ],
      serverAdapter,
    });
    app.use('/admin/queues', serverAdapter.getRouter());
    logger.info('Bull Board mounted at /admin/queues');

    // ============================================
    // Dev-only Payment Bypass (SECURITY-CHECKLIST B1)
    //
    // This route directly fulfills a payment without Stripe.
    // It MUST NOT be registered in production — gating at route registration
    // time (here, inside the NODE_ENV check) means the route does not exist
    // in the routing table in production, not just guarded inside the handler.
    //
    // Also requires ownership verification (SECURITY-CHECKLIST B3) so even in
    // dev, an anonymous caller cannot mark another user's session as paid.
    // ============================================
    app.post(
      '/api/payments/dev-complete/:sessionId',
      optionalAuthMiddleware,
      verifySessionOwnership,
      handleDevComplete
    );
    logger.warn('DEV BYPASS: /api/payments/dev-complete is mounted. DO NOT USE IN PRODUCTION.');
  }

  // ============================================
  // 404 Handler
  // ============================================
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource was not found',
    });
  });

  // ============================================
  // Global Error Handler (must be last)
  // ============================================
  app.use(errorHandler);

  logger.info('Express application initialized successfully');

  return app;
}
