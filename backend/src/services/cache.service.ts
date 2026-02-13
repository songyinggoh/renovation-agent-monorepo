import { redis } from '../config/redis.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'CacheService' });

/**
 * Redis-backed caching service
 *
 * Provides typed get/set/invalidate operations with TTL.
 * Fails gracefully — returns null on Redis errors (cache miss behavior).
 */
export class CacheService {
  /**
   * Get a cached value by key
   * Returns null on cache miss or Redis error
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await redis.get(key);
      if (!cached) return null;
      return JSON.parse(cached) as T;
    } catch (err) {
      logger.warn('Cache get error', err as Error, { key });
      return null;
    }
  }

  /**
   * Set a value in cache with TTL (in seconds)
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (err) {
      logger.warn('Cache set error', err as Error, { key });
    }
  }

  /**
   * Delete a cached value
   */
  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (err) {
      logger.warn('Cache del error', err as Error, { key });
    }
  }

  /**
   * Delete all keys matching a pattern
   * Use sparingly — SCAN-based, safe for production
   */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const stream = redis.scanStream({ match: pattern, count: 100 });
      let count = 0;
      const keysToDelete: string[] = [];

      for await (const keys of stream) {
        for (const key of keys as string[]) {
          keysToDelete.push(key);
          count++;
        }
      }

      if (keysToDelete.length > 0) {
        await redis.del(...keysToDelete);
        logger.info('Cache invalidated', { pattern, keysDeleted: count });
      }
    } catch (err) {
      logger.warn('Cache invalidatePattern error', err as Error, { pattern });
    }
  }

  // ─────────────────────────────────────────────
  // Domain-specific cache methods
  // ─────────────────────────────────────────────

  /** Cache key builders */
  static keys = {
    messageHistory: (sessionId: string) => `messages:${sessionId}:recent`,
    sessionMeta: (sessionId: string) => `session:${sessionId}:meta`,
    styleCatalog: () => 'styles:catalog',
    styleBySlug: (slug: string) => `styles:slug:${slug}`,
  } as const;

  /** TTL values (seconds) */
  static ttl = {
    messageHistory: 300,    // 5 minutes
    sessionMeta: 300,       // 5 minutes
    styleCatalog: 3600,     // 1 hour
    styleBySlug: 3600,      // 1 hour
  } as const;
}

/** Singleton cache service */
export const cacheService = new CacheService();
