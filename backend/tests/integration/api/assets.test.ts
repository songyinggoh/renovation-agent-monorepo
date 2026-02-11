import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { getApp } from './setup.js';
import { authMiddleware } from '../../../src/middleware/auth.middleware.js';

// Mock AssetService at module level so the controller picks it up
const mockRequestUpload = vi.fn();
const mockConfirmUpload = vi.fn();
const mockGetAssetsByRoom = vi.fn();
const mockGetAssetById = vi.fn();
const mockDeleteAsset = vi.fn();
const mockGetSignedUrl = vi.fn();

vi.mock('../../../src/services/asset.service.js', () => ({
  AssetService: vi.fn().mockImplementation(() => ({
    requestUpload: mockRequestUpload,
    confirmUpload: mockConfirmUpload,
    getAssetsByRoom: mockGetAssetsByRoom,
    getAssetById: mockGetAssetById,
    getAssetsBySession: vi.fn().mockResolvedValue([]),
    deleteAsset: mockDeleteAsset,
    getSignedUrl: mockGetSignedUrl,
  })),
  sanitizeFilename: vi.fn((f: string) => f),
  validateFileType: vi.fn(() => true),
  validateFileSize: vi.fn(() => true),
  buildStoragePath: vi.fn(() => 'mock/path'),
}));

let app: Application;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply default auth mock
  vi.mocked(authMiddleware).mockImplementation((_req, _res, next) => {
    _req.user = {
      id: 'test-user-id',
      email: 'test@example.com',
    } as typeof _req.user;
    next();
  });
});

describe('Asset Endpoints', () => {
  // ── POST /api/rooms/:roomId/assets/request-upload ──────────────

  describe('POST /api/rooms/:roomId/assets/request-upload', () => {
    const validBody = {
      filename: 'kitchen.jpg',
      contentType: 'image/jpeg',
      fileSize: 2048,
      assetType: 'photo',
      sessionId: 'session-1',
    };

    it('should return 201 with upload data', async () => {
      const uploadResult = {
        assetId: 'asset-1',
        signedUrl: 'mock://upload-url',
        token: 'mock-token',
        storagePath: 'session_1/room_1/photos/kitchen.jpg',
        expiresAt: '2024-01-01T01:00:00.000Z',
      };
      mockRequestUpload.mockResolvedValue(uploadResult);

      const res = await request(app)
        .post('/api/rooms/room-1/assets/request-upload')
        .set('Authorization', 'Bearer test-token')
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.assetId).toBe('asset-1');
      expect(res.body.signedUrl).toBeDefined();
      expect(res.body.token).toBeDefined();
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/rooms/room-1/assets/request-upload')
        .set('Authorization', 'Bearer test-token')
        .send({ filename: 'test.jpg' }); // missing required fields

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid assetType', async () => {
      const res = await request(app)
        .post('/api/rooms/room-1/assets/request-upload')
        .set('Authorization', 'Bearer test-token')
        .send({ ...validBody, assetType: 'video' });

      expect(res.status).toBe(400);
    });

    it('should return 401 without auth', async () => {
      vi.mocked(authMiddleware).mockImplementation((_req, res) => {
        res.status(401).json({ error: 'Unauthorized' });
      });

      const res = await request(app)
        .post('/api/rooms/room-1/assets/request-upload')
        .send(validBody);

      expect(res.status).toBe(401);
    });

    it('should return 500 on service error', async () => {
      mockRequestUpload.mockRejectedValue(new Error('Storage failure'));

      const res = await request(app)
        .post('/api/rooms/room-1/assets/request-upload')
        .set('Authorization', 'Bearer test-token')
        .send(validBody);

      expect(res.status).toBe(500);
    });
  });

  // ── POST /api/rooms/:roomId/assets/:assetId/confirm ────────────

  describe('POST /api/rooms/:roomId/assets/:assetId/confirm', () => {
    it('should return 200 with confirmed asset', async () => {
      const confirmedAsset = {
        id: 'asset-1',
        status: 'uploaded',
        assetType: 'photo',
      };
      mockConfirmUpload.mockResolvedValue(confirmedAsset);

      const res = await request(app)
        .post('/api/rooms/room-1/assets/asset-1/confirm')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.asset.id).toBe('asset-1');
      expect(res.body.asset.status).toBe('uploaded');
    });

    it('should return 500 on service error', async () => {
      mockConfirmUpload.mockRejectedValue(new Error('File not found in storage'));

      const res = await request(app)
        .post('/api/rooms/room-1/assets/asset-1/confirm')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(500);
    });
  });

  // ── GET /api/rooms/:roomId/assets ──────────────────────────────

  describe('GET /api/rooms/:roomId/assets', () => {
    it('should return list of assets', async () => {
      const assets = [
        { id: 'asset-1', assetType: 'photo', originalFilename: 'a.jpg' },
        { id: 'asset-2', assetType: 'document', originalFilename: 'plan.pdf' },
      ];
      mockGetAssetsByRoom.mockResolvedValue(assets);

      const res = await request(app)
        .get('/api/rooms/room-1/assets')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.assets).toHaveLength(2);
      expect(res.body.assets[0].id).toBe('asset-1');
    });

    it('should return empty array when no assets exist', async () => {
      mockGetAssetsByRoom.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/rooms/room-1/assets')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.assets).toEqual([]);
    });
  });

  // ── GET /api/rooms/:roomId/assets/:assetId ─────────────────────

  describe('GET /api/rooms/:roomId/assets/:assetId', () => {
    it('should return single asset', async () => {
      const asset = { id: 'asset-1', assetType: 'photo' };
      mockGetAssetById.mockResolvedValue(asset);

      const res = await request(app)
        .get('/api/rooms/room-1/assets/asset-1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.asset.id).toBe('asset-1');
    });

    it('should return 404 when asset not found', async () => {
      mockGetAssetById.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/rooms/room-1/assets/nonexistent')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/rooms/:roomId/assets/:assetId ──────────────────

  describe('DELETE /api/rooms/:roomId/assets/:assetId', () => {
    it('should return 204 on successful delete', async () => {
      mockDeleteAsset.mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/rooms/room-1/assets/asset-1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(204);
    });

    it('should return 500 on service error', async () => {
      mockDeleteAsset.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .delete('/api/rooms/room-1/assets/asset-1')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(500);
    });
  });

  // ── GET /api/rooms/:roomId/assets/:assetId/url ─────────────────

  describe('GET /api/rooms/:roomId/assets/:assetId/url', () => {
    it('should return signed URL', async () => {
      mockGetSignedUrl.mockResolvedValue('https://storage.example.com/signed');

      const res = await request(app)
        .get('/api/rooms/room-1/assets/asset-1/url')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://storage.example.com/signed');
    });

    it('should return 404 when asset not found', async () => {
      mockGetSignedUrl.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/rooms/room-1/assets/nonexistent/url')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(404);
    });
  });
});
