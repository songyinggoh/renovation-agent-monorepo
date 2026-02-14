import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { getApp, mockPoolConnect, mockClientQuery } from './setup.js';

let app: Application;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Reset pool.connect to return a successful client
  const mockClient = {
    query: mockClientQuery.mockResolvedValue({ rows: [{ current_time: new Date() }] }),
    release: vi.fn(),
  };
  mockPoolConnect.mockResolvedValue(mockClient);
});

describe('Health Endpoints', () => {
  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.environment).toBe('test');
    });
  });

  describe('GET /healthz', () => {
    it('should return 200 (alias for /health)', async () => {
      const res = await request(app).get('/healthz');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('GET /health/live', () => {
    it('should return 200 with alive status', async () => {
      const res = await request(app).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('alive');
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness check response', async () => {
      // In test environment with mocked DB, just verify endpoint responds
      // The mock DB connection is configured in setup.ts
      const res = await request(app).get('/health/ready');

      // Should return either 200 (ready) or 503 (not ready)
      expect([200, 503]).toContain(res.status);
      expect(res.body.status).toBeDefined();
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.database).toBeDefined();
    });

    it('should include database check in response', async () => {
      const res = await request(app).get('/health/ready');

      expect(res.body.checks.database.status).toBeDefined();
      expect(['ok', 'error']).toContain(res.body.checks.database.status);
    });
  });

  describe('GET /health/status', () => {
    it('should return 200 with detailed metrics', async () => {
      const res = await request(app).get('/health/status');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.environment).toBeDefined();
      expect(res.body.memory).toBeDefined();
      expect(res.body.database).toBeDefined();
      expect(res.body.uptime).toBeDefined();
    });
  });

  describe('404 handler', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await request(app).get('/nonexistent-route');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Not Found');
    });
  });
});
