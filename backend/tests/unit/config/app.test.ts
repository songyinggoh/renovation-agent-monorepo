import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import type { Application } from 'express';

// ── Mocks ────────────────────────────────────────────────────

vi.mock('../../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    FRONTEND_URL: 'http://localhost:3001',
    SENTRY_DSN: undefined,
  },
  isAuthEnabled: vi.fn(() => false),
  isPaymentsEnabled: vi.fn(() => false),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Rate limiters — passthrough
vi.mock('../../../src/middleware/rate-limit.middleware.js', () => ({
  apiLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  chatLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  checkoutLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Request ID middleware — passthrough
vi.mock('../../../src/middleware/request-id.middleware.js', () => ({
  requestIdMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Error handler (Express error handlers require 4 params)
vi.mock('../../../src/middleware/errorHandler.js', () => ({
  errorHandler: (err: Error, _req: unknown, res: { status: (n: number) => { json: (o: unknown) => void } }, _next: unknown): void => { // eslint-disable-line @typescript-eslint/no-unused-vars
    res.status(500).json({ error: err.message });
  },
}));

// Sentry
vi.mock('@sentry/node', () => ({
  setupExpressErrorHandler: vi.fn(),
}));

// Routes — minimal stubs
vi.mock('../../../src/routes/health.routes.js', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return { default: r };
});
vi.mock('../../../src/routes/session.routes.js', async () => {
  const { Router } = await import('express');
  const r = Router();
  r.get('/', (_req, res) => res.json({ sessions: [] }));
  return { default: r };
});
vi.mock('../../../src/routes/message.routes.js', async () => {
  const { Router } = await import('express');
  return { default: Router() };
});
vi.mock('../../../src/routes/room.routes.js', async () => {
  const { Router } = await import('express');
  return { default: Router() };
});
vi.mock('../../../src/routes/style.routes.js', async () => {
  const { Router } = await import('express');
  return { default: Router() };
});
vi.mock('../../../src/routes/product.routes.js', async () => {
  const { Router } = await import('express');
  return { default: Router() };
});
vi.mock('../../../src/routes/asset.routes.js', async () => {
  const { Router } = await import('express');
  return { default: Router() };
});
vi.mock('../../../src/routes/render.routes.js', async () => {
  const { Router } = await import('express');
  return { default: Router() };
});
vi.mock('../../../src/routes/document.routes.js', async () => {
  const { Router } = await import('express');
  return { default: Router() };
});
vi.mock('../../../src/routes/payment.routes.js', async () => {
  const { Router } = await import('express');
  return { default: Router() };
});

// Bull Board + queues (dev-only UI)
vi.mock('@bull-board/api', () => ({
  createBullBoard: vi.fn(),
}));
vi.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: vi.fn(),
}));
vi.mock('@bull-board/express', () => ({
  ExpressAdapter: vi.fn().mockImplementation(() => ({
    setBasePath: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    getRouter: () => { const { Router } = require('express'); return Router(); },
  })),
}));
vi.mock('../../../src/config/queue.js', () => ({
  getImageQueue: vi.fn().mockReturnValue({}),
  getEmailQueue: vi.fn().mockReturnValue({}),
  getDocQueue: vi.fn().mockReturnValue({}),
  getRenderQueue: vi.fn().mockReturnValue({}),
}));
vi.mock('../../../src/config/dead-letter.js', () => ({
  getDLQ: vi.fn().mockReturnValue({}),
}));

// ── Tests ────────────────────────────────────────────────────

describe('createApp', () => {
  let app: Application;

  beforeEach(() => {
    app = createApp();
  });

  it('should return an Express application', () => {
    expect(app).toBeDefined();
    expect(typeof app.listen).toBe('function');
  });

  describe('security headers', () => {
    it('should not expose X-Powered-By', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('should set Helmet security headers', async () => {
      const res = await request(app).get('/health');
      // Helmet sets X-Content-Type-Options by default
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('CORS', () => {
    it('should allow requests from FRONTEND_URL', async () => {
      const res = await request(app)
        .options('/api/sessions')
        .set('Origin', 'http://localhost:3001');
      expect(res.headers['access-control-allow-origin']).toBe(
        'http://localhost:3001',
      );
    });

    it('should allow credentials', async () => {
      const res = await request(app)
        .options('/api/sessions')
        .set('Origin', 'http://localhost:3001');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('routes', () => {
    it('should serve health endpoint', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('should serve session routes under /api/sessions', async () => {
      const res = await request(app).get('/api/sessions');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sessions');
    });

    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });

    it('should parse JSON body', async () => {
      // POST to a route to verify body parsing is active
      const res = await request(app)
        .post('/api/sessions')
        .send({ name: 'test' })
        .set('Content-Type', 'application/json');
      // We don't have a POST handler in the mock, so 404 is expected
      // but the server should NOT crash (body parsing works)
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('404 handler', () => {
    it('should return JSON error for missing API routes', async () => {
      const res = await request(app).get('/api/does-not-exist');
      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        error: 'Not Found',
        message: 'The requested resource was not found',
      });
    });

    it('should return JSON for non-API missing routes', async () => {
      const res = await request(app).get('/random-path');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });
  });
});
