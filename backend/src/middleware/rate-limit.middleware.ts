import { Request, Response, NextFunction, RequestHandler } from 'express';
import { RateLimiterPostgres, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { pool } from '../db/index.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'RateLimiter' });

/**
 * Create a distributed rate limiter backed by PostgreSQL.
 *
 * Each limiter shares one `rate_limits` table (differentiated by keyPrefix).
 * An in-memory `insuranceLimiter` provides graceful degradation if PG is unreachable.
 */
function createLimiter(opts: {
  keyPrefix: string;
  points: number;
  duration: number;
}): RateLimiterPostgres {
  const insuranceLimiter = new RateLimiterMemory({
    keyPrefix: `${opts.keyPrefix}_insurance`,
    points: opts.points,
    duration: opts.duration,
  });

  return new RateLimiterPostgres({
    storeClient: pool,
    tableName: 'rate_limits',
    keyPrefix: opts.keyPrefix,
    points: opts.points,
    duration: opts.duration,
    insuranceLimiter,
  });
}

/**
 * Build Express middleware from a rate-limiter-flexible limiter.
 *
 * Sets standard RateLimit-* headers and returns 429 on limit exceeded.
 */
function createMiddleware(
  limiter: RateLimiterPostgres,
  errorMessage: string,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';

    limiter
      .consume(key)
      .then((rateLimiterRes: RateLimiterRes) => {
        res.set({
          'RateLimit-Limit': String(limiter.points),
          'RateLimit-Remaining': String(rateLimiterRes.remainingPoints),
          'RateLimit-Reset': String(
            Math.ceil(rateLimiterRes.msBeforeNext / 1000),
          ),
        });
        next();
      })
      .catch((rateLimiterRes: unknown) => {
        if (rateLimiterRes instanceof RateLimiterRes) {
          logger.warn('Rate limit exceeded', undefined, {
            ip: key,
            path: req.path,
            keyPrefix: limiter.keyPrefix,
          });

          const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);

          res.set({
            'RateLimit-Limit': String(limiter.points),
            'RateLimit-Remaining': '0',
            'RateLimit-Reset': String(retryAfter),
            'Retry-After': String(retryAfter),
          });

          res.status(429).json({ error: errorMessage });
        } else {
          // Unexpected error (e.g. DB issue after insurance exhausted)
          logger.error(
            'Rate limiter error',
            rateLimiterRes instanceof Error
              ? rateLimiterRes
              : new Error(String(rateLimiterRes)),
            { ip: key, path: req.path },
          );
          // Fail open — don't block the request on limiter errors
          next();
        }
      });
  };
}

// ─────────────────────────────────────────────
// Exported limiters (same names as before)
// ─────────────────────────────────────────────

/**
 * General API rate limiter — 100 requests per 15 minutes per IP
 */
export const apiLimiter: RequestHandler = createMiddleware(
  createLimiter({ keyPrefix: 'api', points: 100, duration: 15 * 60 }),
  'Too many requests, please try again later',
);

/**
 * Stricter rate limiter for AI/chat routes — 20 requests per 15 minutes per IP
 */
export const chatLimiter: RequestHandler = createMiddleware(
  createLimiter({ keyPrefix: 'chat', points: 20, duration: 15 * 60 }),
  'Too many chat requests, please try again later',
);

/**
 * Strict rate limiter for auth routes — 10 requests per 15 minutes per IP
 */
export const authLimiter: RequestHandler = createMiddleware(
  createLimiter({ keyPrefix: 'auth', points: 10, duration: 15 * 60 }),
  'Too many authentication attempts, please try again later',
);
