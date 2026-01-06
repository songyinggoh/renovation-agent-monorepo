import { Router, Request, Response } from 'express';
import { testConnection, getPoolStats } from '../db/index.js';
import { env, isAuthEnabled, isPaymentsEnabled } from '../config/env.js';
import { Logger } from '../utils/logger.js';

const router = Router();
const logger = new Logger({ serviceName: 'HealthCheck' });

/**
 * Basic health check endpoint
 *
 * Used by load balancers for simple up/down checks
 * Always returns 200 if server is running
 *
 * GET /health
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    version: '1.0.0',
  });
});

/**
 * Liveness probe
 *
 * Kubernetes liveness probe - returns 200 if server process is alive
 * Does NOT check dependencies (database, external APIs)
 *
 * GET /health/live
 */
router.get('/health/live', (_req: Request, res: Response) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Readiness probe
 *
 * Kubernetes readiness probe - returns 200 only if all dependencies are healthy
 * Server should NOT receive traffic if this fails
 *
 * GET /health/ready
 */
router.get('/health/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, {
    status: 'ok' | 'error';
    message?: string;
    [key: string]: unknown;
  }> = {};

  // Check database connection
  try {
    await testConnection();
    const poolStats = getPoolStats();
    checks.database = {
      status: 'ok',
      poolSize: poolStats.total,
      idleConnections: poolStats.idle,
      waitingRequests: poolStats.waiting,
    };
  } catch (error) {
    checks.database = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check feature availability
  checks.features = {
    status: 'ok',
    auth: isAuthEnabled() ? 'enabled' : 'disabled',
    payments: isPaymentsEnabled() ? 'enabled' : 'disabled',
  };

  // TODO Phase 4: Check LangChain agent readiness
  // checks.agent = {
  //   status: 'ok',
  //   initialized: true,
  // };

  // Determine overall readiness
  const allHealthy = Object.values(checks)
    .filter(check => check.status !== undefined)
    .every(check => check.status === 'ok');

  const statusCode = allHealthy ? 200 : 503;

  if (!allHealthy) {
    logger.warn('Readiness check failed', undefined, { checks });
  }

  res.status(statusCode).json({
    status: allHealthy ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * Detailed status endpoint
 *
 * Provides comprehensive system metrics for monitoring and debugging
 * Includes memory usage, connection pool stats, feature flags
 *
 * GET /health/status
 */
router.get('/health/status', async (_req: Request, res: Response) => {
  const poolStats = getPoolStats();
  const memUsage = process.memoryUsage();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),

    // Environment info
    environment: {
      nodeEnv: env.NODE_ENV,
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid,
    },

    // Runtime metrics
    uptime: {
      seconds: Math.floor(process.uptime()),
      formatted: formatUptime(process.uptime()),
    },

    // Memory usage (in MB)
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    },

    // Database connection pool
    database: {
      poolSize: poolStats.total,
      idleConnections: poolStats.idle,
      waitingRequests: poolStats.waiting,
    },

    // Feature flags
    features: {
      auth: isAuthEnabled(),
      payments: isPaymentsEnabled(),
    },

    // Endpoints
    endpoints: {
      health: '/health',
      liveness: '/health/live',
      readiness: '/health/ready',
      status: '/health/status',
      api: '/api',
      socket: '/socket.io',
    },
  });
});

/**
 * Format uptime in human-readable format
 *
 * @param seconds - Uptime in seconds
 * @returns Formatted string (e.g., "2d 3h 45m")
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : '< 1m';
}

export default router;
