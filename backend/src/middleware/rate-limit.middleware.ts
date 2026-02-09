import rateLimit from 'express-rate-limit';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'RateLimiter' });

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  handler: (_req, res, _next, options) => {
    logger.warn('Rate limit exceeded', undefined, {
      ip: _req.ip,
      path: _req.path,
    });
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Stricter rate limiter for AI/chat routes
 * 20 requests per 15 minutes per IP (higher cost per request)
 */
export const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests, please try again later' },
  handler: (_req, res, _next, options) => {
    logger.warn('Chat rate limit exceeded', undefined, {
      ip: _req.ip,
      path: _req.path,
    });
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Strict rate limiter for auth-related routes
 * 10 requests per 15 minutes per IP (brute force protection)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' },
  handler: (_req, res, _next, options) => {
    logger.warn('Auth rate limit exceeded', undefined, {
      ip: _req.ip,
      path: _req.path,
    });
    res.status(options.statusCode).json(options.message);
  },
});
