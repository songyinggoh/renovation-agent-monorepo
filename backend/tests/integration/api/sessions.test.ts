import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { getApp, mockDbResolve } from './setup.js';
import { authMiddleware } from '../../../src/middleware/auth.middleware.js';

let app: Application;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply default auth mock (passes through with test user)
  vi.mocked(authMiddleware).mockImplementation((_req, _res, next) => {
    _req.user = {
      id: 'test-user-id',
      email: 'test@example.com',
    } as typeof _req.user;
    next();
  });
  // Reset db mock to return empty arrays by default
  mockDbResolve.mockResolvedValue([]);
});

describe('Session Endpoints', () => {
  describe('GET /api/sessions/health', () => {
    it('should return 200 health check', async () => {
      const res = await request(app).get('/api/sessions/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /api/sessions', () => {
    it('should return user sessions', async () => {
      const mockSessions = [
        { id: 'session-1', title: 'Kitchen Reno', userId: 'test-user-id', phase: 'INTAKE' },
        { id: 'session-2', title: 'Bathroom Reno', userId: 'test-user-id', phase: 'PLAN' },
      ];

      mockDbResolve.mockResolvedValue(mockSessions);

      const res = await request(app)
        .get('/api/sessions')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.sessions).toHaveLength(2);
      expect(res.body.sessions[0].title).toBe('Kitchen Reno');
      expect(res.body.user.id).toBe('test-user-id');
    });

    it('should return 401 without auth header', async () => {
      // Override mock to reject unauthenticated requests
      vi.mocked(authMiddleware).mockImplementation((_req, res) => {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Missing or invalid authorization header',
        });
      });

      const res = await request(app).get('/api/sessions');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });

    it('should return 500 on database error', async () => {
      mockDbResolve.mockRejectedValue(new Error('DB failure'));

      const res = await request(app)
        .get('/api/sessions')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Internal Server Error');
    });
  });

  describe('POST /api/sessions', () => {
    it('should create a session with valid body', async () => {
      const newSession = {
        id: 'new-session-id',
        title: 'Living Room Reno',
        totalBudget: '5000',
        userId: null,
        phase: 'INTAKE',
      };

      // First call: profile lookup (no profile found), second: insert
      mockDbResolve
        .mockResolvedValueOnce([])           // profile lookup returns empty
        .mockResolvedValueOnce([newSession]); // insert returns created session

      const res = await request(app)
        .post('/api/sessions')
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Living Room Reno', totalBudget: 5000 });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Living Room Reno');
    });

    it('should return 400 with invalid body (missing title)', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
      expect(res.body.details).toBeDefined();
      expect(res.body.details.some((d: { field: string }) => d.field === 'title')).toBe(true);
    });

    it('should return 400 with negative budget', async () => {
      const res = await request(app)
        .post('/api/sessions')
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Test', totalBudget: -100 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });
  });
});
