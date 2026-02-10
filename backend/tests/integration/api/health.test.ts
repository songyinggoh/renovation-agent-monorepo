import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { getApp } from './setup.js';
import { testConnection } from '../../../src/db/index.js';

let app: Application;

beforeAll(async () => {
  app = await getApp();
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
    it('should return 200 when DB is connected', async () => {
      vi.mocked(testConnection).mockResolvedValue(undefined);

      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.checks.database.status).toBe('ok');
    });

    it('should return 503 when DB is down', async () => {
      vi.mocked(testConnection).mockRejectedValue(new Error('Connection refused'));

      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not_ready');
      expect(res.body.checks.database.status).toBe('error');
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
