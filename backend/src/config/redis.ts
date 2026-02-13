import { Redis } from 'ioredis';
import { env } from './env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'Redis' });

/**
 * Redis client singleton
 *
 * Used for:
 * - Socket.io adapter (cross-instance events)
 * - Health checks
 * - Future: caching, rate limiting, job queue
 *
 * Connection is lazy — client connects on first command.
 * Graceful degradation: app continues without Redis (logs warnings).
 */
const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    if (times > 5) {
      logger.warn('Redis connection failed after 5 retries — giving up');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
  lazyConnect: true,
  enableReadyCheck: true,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

redis.on('ready', () => {
  logger.info('Redis ready');
});

redis.on('error', (err: Error) => {
  logger.error('Redis error', err);
});

redis.on('close', () => {
  logger.info('Redis connection closed');
});

/**
 * Test Redis connectivity
 * Returns true if Redis responds to PING
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Connect Redis client (call during startup)
 */
export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    logger.info('Redis connection established');
  } catch (err) {
    logger.warn('Redis connection failed — app will continue without Redis', err as Error);
  }
}

/**
 * Close Redis connection (call during shutdown)
 */
export async function closeRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info('Redis connection closed gracefully');
  } catch (err) {
    logger.warn('Redis close error', err as Error);
    redis.disconnect();
  }
}

export { redis };
export default redis;
