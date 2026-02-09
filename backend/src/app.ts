import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter, chatLimiter } from './middleware/rate-limit.middleware.js';
import { Logger } from './utils/logger.js';
import healthRoutes from './routes/health.routes.js';
import sessionRoutes from './routes/session.routes.js';
import messageRoutes from './routes/message.routes.js';
import roomRoutes from './routes/room.routes.js';
import styleRoutes from './routes/style.routes.js';
import productRoutes from './routes/product.routes.js';
import assetRoutes from './routes/asset.routes.js';

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
  app.set('trust proxy', 1); // Trust the first proxy (Cloud Run load balancer)
  app.disable('x-powered-by'); // Prevent Express version disclosure

  logger.info('Initializing Express application', {
    nodeEnv: env.NODE_ENV,
    frontendUrl: env.FRONTEND_URL,
  });

  // ============================================
  // CORS Configuration
  // ============================================
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
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
