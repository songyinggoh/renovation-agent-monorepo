import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// vi.hoisted runs before vi.mock hoisting, so these are available in the factory
const {
  mockRequestUpload,
  mockConfirmUpload,
  mockGetAssetsByRoom,
  mockGetAssetById,
  mockDeleteAsset,
  mockGetSignedUrl,
} = vi.hoisted(() => ({
  mockRequestUpload: vi.fn(),
  mockConfirmUpload: vi.fn(),
  mockGetAssetsByRoom: vi.fn(),
  mockGetAssetById: vi.fn(),
  mockDeleteAsset: vi.fn(),
  mockGetSignedUrl: vi.fn(),
}));

vi.mock('../../../src/services/asset.service.js', () => ({
  AssetService: vi.fn().mockImplementation(() => ({
    requestUpload: mockRequestUpload,
    confirmUpload: mockConfirmUpload,
    getAssetsByRoom: mockGetAssetsByRoom,
    getAssetById: mockGetAssetById,
    deleteAsset: mockDeleteAsset,
    getSignedUrl: mockGetSignedUrl,
  })),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Import controller handlers after mocks
import {
  requestUpload,
  confirmUpload,
  listAssets,
  getAsset,
  deleteAsset,
  getAssetUrl,
} from '../../../src/controllers/asset.controller.js';

describe('AssetController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRes = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };
  });

  // ── requestUpload ──────────────────────────────────────────────

  describe('requestUpload', () => {
    it('should return 201 with upload data on success', async () => {
      mockReq = {
        params: { roomId: 'room-1' },
        body: {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
          fileSize: 1024,
          assetType: 'photo',
          sessionId: 'session-1',
        },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const uploadResult = {
        assetId: 'asset-1',
        signedUrl: 'mock://url',
        token: 'mock-token',
        storagePath: 'session_1/room_1/photos/test.jpg',
        expiresAt: '2024-01-01T00:00:00.000Z',
      };
      mockRequestUpload.mockResolvedValue(uploadResult);

      await requestUpload(mockReq as Request, mockRes as Response, vi.fn() as unknown as NextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(uploadResult);
      expect(mockRequestUpload).toHaveBeenCalledWith({
        roomId: 'room-1',
        sessionId: 'session-1',
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024,
        assetType: 'photo',
        uploadedBy: 'user-1',
      });
    });

    it('should throw BadRequestError when required fields are missing', async () => {
      mockReq = {
        params: { roomId: 'room-1' },
        body: { filename: 'photo.jpg' }, // missing contentType, fileSize, assetType, sessionId
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const mockNext = vi.fn() as unknown as NextFunction;

      requestUpload(mockReq as Request, mockRes as Response, mockNext);

      // asyncHandler's .catch(next) fires on microtask queue
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('required'),
        })
      );
    });

    it('should throw BadRequestError for invalid assetType', async () => {
      mockReq = {
        params: { roomId: 'room-1' },
        body: {
          filename: 'file.txt',
          contentType: 'text/plain',
          fileSize: 100,
          assetType: 'invalid_type',
          sessionId: 'session-1',
        },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const mockNext = vi.fn() as unknown as NextFunction;

      requestUpload(mockReq as Request, mockRes as Response, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Invalid assetType'),
        })
      );
    });

    it('should forward service errors to Express error handler', async () => {
      mockReq = {
        params: { roomId: 'room-1' },
        body: {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
          fileSize: 1024,
          assetType: 'photo',
          sessionId: 'session-1',
        },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const serviceError = new Error('DB connection lost');
      mockRequestUpload.mockRejectedValue(serviceError);

      const mockNext = vi.fn() as unknown as NextFunction;

      requestUpload(mockReq as Request, mockRes as Response, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockNext).toHaveBeenCalledWith(serviceError);
    });
  });

  // ── confirmUpload ──────────────────────────────────────────────

  describe('confirmUpload', () => {
    it('should return confirmed asset on success', async () => {
      mockReq = {
        params: { roomId: 'room-1', assetId: 'asset-1' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const confirmedAsset = { id: 'asset-1', status: 'uploaded' };
      mockConfirmUpload.mockResolvedValue(confirmedAsset);

      await confirmUpload(mockReq as Request, mockRes as Response, vi.fn() as unknown as NextFunction);

      expect(mockRes.json).toHaveBeenCalledWith({ asset: confirmedAsset });
      expect(mockConfirmUpload).toHaveBeenCalledWith('asset-1');
    });

    it('should forward errors to next()', async () => {
      mockReq = {
        params: { roomId: 'room-1', assetId: 'asset-1' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const error = new Error('Asset not found');
      mockConfirmUpload.mockRejectedValue(error);

      const mockNext = vi.fn() as unknown as NextFunction;
      confirmUpload(mockReq as Request, mockRes as Response, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  // ── listAssets ─────────────────────────────────────────────────

  describe('listAssets', () => {
    it('should return assets array for room', async () => {
      mockReq = {
        params: { roomId: 'room-1' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const assets = [{ id: 'asset-1' }, { id: 'asset-2' }];
      mockGetAssetsByRoom.mockResolvedValue(assets);

      await listAssets(mockReq as Request, mockRes as Response, vi.fn() as unknown as NextFunction);

      expect(mockRes.json).toHaveBeenCalledWith({ assets });
      expect(mockGetAssetsByRoom).toHaveBeenCalledWith('room-1');
    });

    it('should return empty array when room has no assets', async () => {
      mockReq = {
        params: { roomId: 'room-1' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      mockGetAssetsByRoom.mockResolvedValue([]);

      await listAssets(mockReq as Request, mockRes as Response, vi.fn() as unknown as NextFunction);

      expect(mockRes.json).toHaveBeenCalledWith({ assets: [] });
    });
  });

  // ── getAsset ───────────────────────────────────────────────────

  describe('getAsset', () => {
    it('should return asset when found', async () => {
      mockReq = {
        params: { roomId: 'room-1', assetId: 'asset-1' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const asset = { id: 'asset-1', assetType: 'photo' };
      mockGetAssetById.mockResolvedValue(asset);

      await getAsset(mockReq as Request, mockRes as Response, vi.fn() as unknown as NextFunction);

      expect(mockRes.json).toHaveBeenCalledWith({ asset });
    });

    it('should throw NotFoundError when asset not found', async () => {
      mockReq = {
        params: { roomId: 'room-1', assetId: 'nonexistent' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      mockGetAssetById.mockResolvedValue(null);

      const mockNext = vi.fn() as unknown as NextFunction;
      getAsset(mockReq as Request, mockRes as Response, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Asset not found' })
      );
    });
  });

  // ── deleteAsset ────────────────────────────────────────────────

  describe('deleteAsset', () => {
    it('should return 204 on successful delete', async () => {
      mockReq = {
        params: { roomId: 'room-1', assetId: 'asset-1' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      mockDeleteAsset.mockResolvedValue(undefined);

      await deleteAsset(mockReq as Request, mockRes as Response, vi.fn() as unknown as NextFunction);

      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(mockRes.send).toHaveBeenCalled();
      expect(mockDeleteAsset).toHaveBeenCalledWith('asset-1');
    });

    it('should forward errors to next()', async () => {
      mockReq = {
        params: { roomId: 'room-1', assetId: 'asset-1' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const error = new Error('Asset not found');
      mockDeleteAsset.mockRejectedValue(error);

      const mockNext = vi.fn() as unknown as NextFunction;
      deleteAsset(mockReq as Request, mockRes as Response, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  // ── getAssetUrl ────────────────────────────────────────────────

  describe('getAssetUrl', () => {
    it('should return signed URL when asset exists', async () => {
      mockReq = {
        params: { roomId: 'room-1', assetId: 'asset-1' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      mockGetSignedUrl.mockResolvedValue('mock://signed-url');

      await getAssetUrl(mockReq as Request, mockRes as Response, vi.fn() as unknown as NextFunction);

      expect(mockRes.json).toHaveBeenCalledWith({ url: 'mock://signed-url' });
    });

    it('should throw NotFoundError when URL is null', async () => {
      mockReq = {
        params: { roomId: 'room-1', assetId: 'nonexistent' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      mockGetSignedUrl.mockResolvedValue(null);

      const mockNext = vi.fn() as unknown as NextFunction;
      getAssetUrl(mockReq as Request, mockRes as Response, mockNext);

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Asset not found' })
      );
    });
  });
});
