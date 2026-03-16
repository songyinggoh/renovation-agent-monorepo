import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { RateLimiterRes } from 'rate-limiter-flexible';

// ── Hoisted mocks (must precede vi.mock) ──────────────────────
const { mockConsume } = vi.hoisted(() => ({
  mockConsume: vi.fn(),
}));

vi.mock('rate-limiter-flexible', async (importOriginal) => {
  const actual = await importOriginal<typeof import('rate-limiter-flexible')>();
  return {
    ...actual,
    RateLimiterPostgres: vi.fn().mockImplementation((opts) => ({
      consume: mockConsume,
      points: opts.points,
      keyPrefix: opts.keyPrefix,
    })),
    RateLimiterMemory: vi.fn().mockImplementation(() => ({})),
  };
});

vi.mock('../../../src/db/index.js', () => ({
  pool: {},
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// ── Helpers ───────────────────────────────────────────────────

function mockReqResNext(ip = '127.0.0.1', path = '/api/test') {
  const req = { ip, path } as unknown as Request;
  const headers: Record<string, string> = {};
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    set: vi.fn((obj: Record<string, string>) => Object.assign(headers, obj)),
    _headers: headers,
  } as unknown as Response & { _headers: Record<string, string> };
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

function makeRateLimiterRes(remaining: number, msBeforeNext: number) {
  return new RateLimiterRes(remaining, msBeforeNext);
}

// ── Tests ─────────────────────────────────────────────────────

describe('rate-limit.middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('apiLimiter', () => {
    let apiLimiter: import('express').RequestHandler;

    beforeEach(async () => {
      // Dynamic import so mocks are active
      const mod = await import(
        '../../../src/middleware/rate-limit.middleware.js'
      );
      apiLimiter = mod.apiLimiter;
    });

    it('should call next() when under the limit', async () => {
      const rlRes = makeRateLimiterRes(99, 900_000);
      mockConsume.mockResolvedValue(rlRes);

      const { req, res, next } = mockReqResNext();
      apiLimiter(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalled());

      expect(res.status).not.toHaveBeenCalled();
    });

    it('should set RateLimit-* headers on success', async () => {
      const rlRes = makeRateLimiterRes(42, 60_000);
      mockConsume.mockResolvedValue(rlRes);

      const { req, res, next } = mockReqResNext();
      apiLimiter(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalled());

      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'RateLimit-Remaining': '42',
          'RateLimit-Reset': '60',
        }),
      );
    });

    it('should return 429 when limit exceeded', async () => {
      const rlRes = makeRateLimiterRes(0, 30_000);
      mockConsume.mockRejectedValue(rlRes);

      const { req, res, next } = mockReqResNext();
      apiLimiter(req, res, next);
      await vi.waitFor(() => expect(res.status).toHaveBeenCalled());

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many requests, please try again later',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should set Retry-After header on 429', async () => {
      const rlRes = makeRateLimiterRes(0, 45_000);
      mockConsume.mockRejectedValue(rlRes);

      const { req, res, next } = mockReqResNext();
      apiLimiter(req, res, next);
      await vi.waitFor(() => expect(res.status).toHaveBeenCalled());

      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Retry-After': '45',
          'RateLimit-Remaining': '0',
        }),
      );
    });

    it('should use req.ip as the rate limit key', async () => {
      const rlRes = makeRateLimiterRes(99, 900_000);
      mockConsume.mockResolvedValue(rlRes);

      const { req, res, next } = mockReqResNext('192.168.1.42');
      apiLimiter(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalled());

      expect(mockConsume).toHaveBeenCalledWith('192.168.1.42');
    });

    it('should use "unknown" key when req.ip is undefined', async () => {
      const rlRes = makeRateLimiterRes(99, 900_000);
      mockConsume.mockResolvedValue(rlRes);

      const req = { ip: undefined, path: '/api/test' } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
        set: vi.fn(),
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      mockConsume.mockClear();
      apiLimiter(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalled());

      expect(mockConsume).toHaveBeenCalledWith('unknown');
    });

    it('should fail open on unexpected errors (non-RateLimiterRes)', async () => {
      mockConsume.mockRejectedValue(new Error('DB connection lost'));

      const { req, res, next } = mockReqResNext();
      apiLimiter(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalled());

      expect(res.status).not.toHaveBeenCalled();
    });

    it('should fail open on non-Error unexpected rejection', async () => {
      mockConsume.mockRejectedValue('string error');

      const { req, res, next } = mockReqResNext();
      apiLimiter(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalled());

      expect(res.status).not.toHaveBeenCalled();
    });

    it('should ceil msBeforeNext to whole seconds in Reset header', async () => {
      // 1500ms → ceil → 2 seconds
      const rlRes = makeRateLimiterRes(10, 1_500);
      mockConsume.mockResolvedValue(rlRes);

      const { req, res, next } = mockReqResNext();
      apiLimiter(req, res, next);
      await vi.waitFor(() => expect(next).toHaveBeenCalled());

      expect(res.set).toHaveBeenCalledWith(
        expect.objectContaining({ 'RateLimit-Reset': '2' }),
      );
    });
  });

  describe('chatLimiter', () => {
    let chatLimiter: import('express').RequestHandler;

    beforeEach(async () => {
      const mod = await import(
        '../../../src/middleware/rate-limit.middleware.js'
      );
      chatLimiter = mod.chatLimiter;
    });

    it('should return chat-specific error message on 429', async () => {
      const rlRes = makeRateLimiterRes(0, 30_000);
      mockConsume.mockRejectedValue(rlRes);

      const { req, res, next } = mockReqResNext();
      chatLimiter(req, res, next);
      await vi.waitFor(() => expect(res.status).toHaveBeenCalled());

      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many chat requests, please try again later',
      });
    });
  });

  describe('authLimiter', () => {
    let authLimiter: import('express').RequestHandler;

    beforeEach(async () => {
      const mod = await import(
        '../../../src/middleware/rate-limit.middleware.js'
      );
      authLimiter = mod.authLimiter;
    });

    it('should return auth-specific error message on 429', async () => {
      const rlRes = makeRateLimiterRes(0, 30_000);
      mockConsume.mockRejectedValue(rlRes);

      const { req, res, next } = mockReqResNext();
      authLimiter(req, res, next);
      await vi.waitFor(() => expect(res.status).toHaveBeenCalled());

      expect(res.json).toHaveBeenCalledWith({
        error: 'Too many authentication attempts, please try again later',
      });
    });
  });
});
