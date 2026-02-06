import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { Logger } from './utils/logger.js';
import healthRoutes from './routes/health.routes.js';
import sessionRoutes from './routes/session.routes.js';
import messageRoutes from './routes/message.routes.js';

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
  // Health Check Routes (no auth required)
  // ============================================
  app.use('/', healthRoutes);

  // ============================================
  // API Routes
  // ============================================
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/sessions', messageRoutes);
  // TODO Phase 5: Add remaining routes
  // app.use('/api/chat', chatRoutes);
  // app.use('/api/rooms', roomRoutes);

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
