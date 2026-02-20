import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
  AssetService,
  sanitizeFilename,
  validateFileType,
  validateFileSize,
  buildStoragePath,
} from '../../../src/services/asset.service.js';
import { db } from '../../../src/db/index.js';
import { roomAssets } from '../../../src/db/schema/assets.schema.js';

vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: null,
}));

vi.mock('../../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    SUPABASE_STORAGE_BUCKET: 'test-bucket',
  },
  isStorageEnabled: vi.fn().mockReturnValue(false),
}));

const { mockQueueAdd } = vi.hoisted(() => ({
  mockQueueAdd: vi.fn().mockResolvedValue({ id: 'job-1' }),
}));
vi.mock('../../../src/config/queue.js', () => ({
  getImageQueue: vi.fn().mockReturnValue({ add: mockQueueAdd }),
}));

describe('AssetService – helper functions', () => {
  describe('sanitizeFilename', () => {
    it('should keep safe filenames unchanged', () => {
      expect(sanitizeFilename('photo.jpg')).toBe('photo.jpg');
    });

    it('should replace unsafe characters with underscores', () => {
      expect(sanitizeFilename('my photo (1).jpg')).toBe('my_photo__1_.jpg');
    });

    it('should replace leading dot with underscore', () => {
      expect(sanitizeFilename('.hidden.txt')).toBe('_hidden.txt');
    });

    it('should collapse consecutive dots', () => {
      expect(sanitizeFilename('file..name.png')).toBe('file.name.png');
    });

    it('should truncate long filenames to 100 chars', () => {
      const longName = 'a'.repeat(120) + '.jpg';
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('should handle filenames without extension', () => {
      expect(sanitizeFilename('README')).toBe('README');
    });

    it('should truncate the name part to 80 chars before adding extension', () => {
      const longName = 'b'.repeat(90) + '.png';
      const result = sanitizeFilename(longName);
      // Name portion capped at 80 + '.png' = 84 chars
      expect(result.length).toBeLessThanOrEqual(100);
      expect(result.endsWith('.png')).toBe(true);
    });
  });

  describe('validateFileType', () => {
    it('should accept jpeg for photo', () => {
      expect(validateFileType('image/jpeg', 'photo')).toBe(true);
    });

    it('should accept png for photo', () => {
      expect(validateFileType('image/png', 'photo')).toBe(true);
    });

    it('should accept webp for photo', () => {
      expect(validateFileType('image/webp', 'photo')).toBe(true);
    });

    it('should reject pdf for photo', () => {
      expect(validateFileType('application/pdf', 'photo')).toBe(false);
    });

    it('should accept pdf for floorplan', () => {
      expect(validateFileType('application/pdf', 'floorplan')).toBe(true);
    });

    it('should accept pdf for document', () => {
      expect(validateFileType('application/pdf', 'document')).toBe(true);
    });

    it('should reject jpeg for document', () => {
      expect(validateFileType('image/jpeg', 'document')).toBe(false);
    });

    it('should accept png for render', () => {
      expect(validateFileType('image/png', 'render')).toBe(true);
    });

    it('should reject jpeg for render', () => {
      expect(validateFileType('image/jpeg', 'render')).toBe(false);
    });
  });

  describe('validateFileSize', () => {
    it('should accept 1 byte', () => {
      expect(validateFileSize(1)).toBe(true);
    });

    it('should accept exactly 10 MB', () => {
      expect(validateFileSize(10 * 1024 * 1024)).toBe(true);
    });

    it('should reject 0 bytes', () => {
      expect(validateFileSize(0)).toBe(false);
    });

    it('should reject negative size', () => {
      expect(validateFileSize(-1)).toBe(false);
    });

    it('should reject size over 10 MB', () => {
      expect(validateFileSize(10 * 1024 * 1024 + 1)).toBe(false);
    });
  });

  describe('buildStoragePath', () => {
    const validSession = '11111111-1111-1111-1111-111111111111';
    const validRoom = '22222222-2222-2222-2222-222222222222';

    it('should build correct path structure', () => {
      const path = buildStoragePath(validSession, validRoom, 'photo', 'test.jpg');
      expect(path).toMatch(new RegExp(`^session_${validSession}/room_${validRoom}/photos/\\d+_test\\.jpg$`));
    });

    it('should sanitize the filename', () => {
      const path = buildStoragePath(validSession, validRoom, 'document', 'my file (1).pdf');
      expect(path).toContain('my_file__1_.pdf');
    });

    it('should use plural form of asset type in path', () => {
      expect(buildStoragePath(validSession, validRoom, 'floorplan', 'f.png')).toContain('/floorplans/');
      expect(buildStoragePath(validSession, validRoom, 'render', 'f.png')).toContain('/renders/');
    });

    it('should reject non-UUID sessionId to prevent path traversal', () => {
      expect(() => buildStoragePath('../etc', validRoom, 'photo', 'test.jpg'))
        .toThrow('Invalid session or room ID format');
    });

    it('should reject non-UUID roomId to prevent path traversal', () => {
      expect(() => buildStoragePath(validSession, '../../passwd', 'photo', 'test.jpg'))
        .toThrow('Invalid session or room ID format');
    });
  });
});

describe('AssetService', () => {
  let service: AssetService;

  const mockSessionId = '11111111-1111-1111-1111-111111111111';
  const mockRoomId = '22222222-2222-2222-2222-222222222222';

  const mockAsset = {
    id: 'asset-id-1',
    sessionId: mockSessionId,
    roomId: mockRoomId,
    assetType: 'photo',
    storagePath: `session_${mockSessionId}/room_${mockRoomId}/photos/12345_test.jpg`,
    source: 'user_upload',
    status: 'pending',
    originalFilename: 'test.jpg',
    contentType: 'image/jpeg',
    fileSize: 1024,
    displayOrder: 0,
    caption: null,
    altText: null,
    uploadedBy: null,
    metadata: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  /** Mock db.select().from().where() to resolve with the given rows */
  function mockSelectRows(...callRows: unknown[][]): void {
    for (const rows of callRows) {
      const mockWhere = vi.fn().mockResolvedValue(rows);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValueOnce({ from: mockFrom });
    }
  }

  /** Mock db.select().from().where().orderBy() to resolve with the given rows */
  function mockSelectWithOrderBy(rows: unknown[]): void {
    const mockOrderBy = vi.fn().mockResolvedValue(rows);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as Mock).mockReturnValue({ from: mockFrom });
  }

  /** Mock db.insert().values().returning() to resolve with the given rows */
  function mockInsertReturning(rows: unknown[]): Mock {
    const mockReturning = vi.fn().mockResolvedValue(rows);
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    (db.insert as Mock).mockReturnValue({ values: mockValues });
    return mockValues;
  }

  /** Mock db.update().set().where().returning() to resolve with the given rows */
  function mockUpdateReturning(rows: unknown[]): void {
    const mockReturning = vi.fn().mockResolvedValue(rows);
    const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    (db.update as Mock).mockReturnValue({ set: mockSet });
  }

  beforeEach(() => {
    service = new AssetService();
    vi.clearAllMocks();
  });

  // ── requestUpload ──────────────────────────────────────────────

  describe('requestUpload', () => {
    const validParams = {
      roomId: mockRoomId,
      sessionId: mockSessionId,
      filename: 'test.jpg',
      contentType: 'image/jpeg',
      fileSize: 1024,
      assetType: 'photo' as const,
    };

    it('should throw BadRequestError for invalid asset type', async () => {
      await expect(
        service.requestUpload({ ...validParams, assetType: 'invalid' as 'photo' })
      ).rejects.toThrow('Invalid asset type');
    });

    it('should throw BadRequestError for invalid file type', async () => {
      await expect(
        service.requestUpload({ ...validParams, contentType: 'application/pdf' })
      ).rejects.toThrow('Invalid file type');
    });

    it('should throw BadRequestError for invalid file size', async () => {
      await expect(
        service.requestUpload({ ...validParams, fileSize: 0 })
      ).rejects.toThrow('Invalid file size');
    });

    it('should throw BadRequestError for oversized file', async () => {
      await expect(
        service.requestUpload({ ...validParams, fileSize: 11 * 1024 * 1024 })
      ).rejects.toThrow('Invalid file size');
    });

    it('should throw NotFoundError when room does not exist', async () => {
      mockSelectRows([]);

      await expect(service.requestUpload(validParams)).rejects.toThrow('Room not found');
    });

    it('should throw BadRequestError when room has max assets', async () => {
      mockSelectRows([{ id: 'room-id-1' }], [{ count: 20 }]);

      await expect(service.requestUpload(validParams)).rejects.toThrow('Maximum assets per room reached');
    });

    it('should create pending asset and return mock URL when storage is disabled', async () => {
      mockSelectRows([{ id: 'room-id-1' }], [{ count: 5 }]);
      mockInsertReturning([mockAsset]);

      const result = await service.requestUpload(validParams);

      expect(result.assetId).toBe('asset-id-1');
      expect(result.signedUrl).toMatch(/^mock:\/\/storage\//);
      expect(result.token).toBe('mock-token');
      expect(result.storagePath).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(db.insert).toHaveBeenCalledWith(roomAssets);
    });

    it('should throw if insert returns no record', async () => {
      mockSelectRows([{ id: 'room-id-1' }], [{ count: 0 }]);
      mockInsertReturning([undefined]);

      await expect(service.requestUpload(validParams)).rejects.toThrow('Failed to create asset record');
    });

    it('should pass uploadedBy to insert values', async () => {
      mockSelectRows([{ id: 'room-id-1' }], [{ count: 0 }]);
      const mockValues = mockInsertReturning([mockAsset]);

      await service.requestUpload({ ...validParams, uploadedBy: 'user-123' });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ uploadedBy: 'user-123' })
      );
    });
  });

  // ── confirmUpload ──────────────────────────────────────────────

  describe('confirmUpload', () => {
    it('should throw NotFoundError when asset not found', async () => {
      mockSelectRows([]);

      await expect(service.confirmUpload('nonexistent')).rejects.toThrow('Asset not found');
    });

    it('should throw ConflictError when asset is not pending', async () => {
      mockSelectRows([{ ...mockAsset, status: 'uploaded' }]);

      await expect(service.confirmUpload('asset-id-1')).rejects.toThrow('not pending upload');
    });

    it('should update status to uploaded and return updated asset', async () => {
      mockSelectRows([mockAsset]);
      mockUpdateReturning([{ ...mockAsset, status: 'uploaded' }]);

      const result = await service.confirmUpload('asset-id-1');

      expect(result.status).toBe('uploaded');
      expect(db.update).toHaveBeenCalledWith(roomAssets);
    });

    it('should throw when update returns no record', async () => {
      mockSelectRows([mockAsset]);
      mockUpdateReturning([undefined]);

      await expect(service.confirmUpload('asset-id-1')).rejects.toThrow('Failed to update asset');
    });
  });

  // ── getAssetsByRoom ────────────────────────────────────────────

  describe('getAssetsByRoom', () => {
    it('should return assets ordered by displayOrder and createdAt', async () => {
      mockSelectWithOrderBy([mockAsset, { ...mockAsset, id: 'asset-id-2' }]);

      const result = await service.getAssetsByRoom('room-id-1');

      expect(result).toHaveLength(2);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return empty array when room has no assets', async () => {
      mockSelectWithOrderBy([]);

      const result = await service.getAssetsByRoom('empty-room');

      expect(result).toEqual([]);
    });
  });

  // ── getAssetById ───────────────────────────────────────────────

  describe('getAssetById', () => {
    it('should return asset when found', async () => {
      mockSelectRows([mockAsset]);

      const result = await service.getAssetById('asset-id-1');

      expect(result).toEqual(mockAsset);
    });

    it('should return null when not found', async () => {
      mockSelectRows([]);

      const result = await service.getAssetById('nonexistent');

      expect(result).toBeNull();
    });
  });

  // ── getAssetsBySession ─────────────────────────────────────────

  describe('getAssetsBySession', () => {
    it('should return all assets for a session', async () => {
      mockSelectWithOrderBy([mockAsset, { ...mockAsset, id: 'asset-id-2', roomId: 'room-id-2' }]);

      const result = await service.getAssetsBySession('session-id-1');

      expect(result).toHaveLength(2);
    });

    it('should return empty array for session with no assets', async () => {
      mockSelectWithOrderBy([]);

      const result = await service.getAssetsBySession('empty-session');

      expect(result).toEqual([]);
    });
  });

  // ── deleteAsset ────────────────────────────────────────────────

  describe('deleteAsset', () => {
    it('should throw NotFoundError when asset not found', async () => {
      mockSelectRows([]);

      await expect(service.deleteAsset('nonexistent')).rejects.toThrow('Asset not found');
    });

    it('should delete from database when storage is disabled', async () => {
      mockSelectRows([mockAsset]);
      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
      (db.delete as Mock).mockReturnValue({ where: mockDeleteWhere });

      await expect(service.deleteAsset('asset-id-1')).resolves.toBeUndefined();
      expect(db.delete).toHaveBeenCalledWith(roomAssets);
    });
  });

  // ── getSignedUrl ───────────────────────────────────────────────

  describe('getSignedUrl', () => {
    it('should return null when asset not found', async () => {
      mockSelectRows([]);

      const result = await service.getSignedUrl('nonexistent');

      expect(result).toBeNull();
    });

    it('should return mock URL when storage is disabled', async () => {
      mockSelectRows([mockAsset]);

      const result = await service.getSignedUrl('asset-id-1');

      expect(result).toMatch(/^mock:\/\/storage\/test-bucket\//);
    });
  });
});
