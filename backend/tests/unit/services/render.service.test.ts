import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks
const { mockDbSelect, mockDbInsert, mockDbUpdate, mockQueueAdd } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockQueueAdd: vi.fn(),
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock database
vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
  },
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ column: _col, value: val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  gte: vi.fn((_col: unknown, val: unknown) => ({ gte: val })),
  sql: vi.fn((strings: TemplateStringsArray) => strings.join('')),
}));

// Mock schemas
vi.mock('../../../src/db/schema/assets.schema.js', () => ({
  roomAssets: {
    id: 'room_assets.id',
    sessionId: 'room_assets.session_id',
    roomId: 'room_assets.room_id',
    assetType: 'room_assets.asset_type',
    createdAt: 'room_assets.created_at',
    status: 'room_assets.status',
    metadata: 'room_assets.metadata',
    contentType: 'room_assets.content_type',
    fileSize: 'room_assets.file_size',
    updatedAt: 'room_assets.updated_at',
  },
}));

vi.mock('../../../src/db/schema/rooms.schema.js', () => ({
  renovationRooms: {
    id: 'renovation_rooms.id',
  },
}));

// Mock queue
vi.mock('../../../src/config/queue.js', () => ({
  getRenderQueue: vi.fn(() => ({
    add: mockQueueAdd,
  })),
}));

// Mock env
vi.mock('../../../src/config/env.js', () => ({
  env: { SUPABASE_STORAGE_BUCKET: 'test-bucket' },
  isStorageEnabled: vi.fn(() => false),
}));

// Mock supabase
vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: null,
}));

// Mock asset service
vi.mock('../../../src/services/asset.service.js', () => ({
  buildStoragePath: vi.fn(() => 'session_abc/room_def/renders/123_render.png'),
}));

import { RenderService } from '../../../src/services/render.service.js';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const ROOM_ID = '660e8400-e29b-41d4-a716-446655440001';

/** Set up db.select().from().where() chain */
function setupDbSelectChain(returnValue: unknown[]) {
  const mockWhere = vi.fn().mockResolvedValue(returnValue);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbSelect.mockReturnValue({ from: mockFrom });
  return { mockFrom, mockWhere };
}

/** Set up db.insert().values().returning() chain */
function setupDbInsertChain(returnValue: unknown[]) {
  const mockReturning = vi.fn().mockResolvedValue(returnValue);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  mockDbInsert.mockReturnValue({ values: mockValues });
  return { mockValues, mockReturning };
}

/** Set up db.update().set().where().returning() chain */
function setupDbUpdateChain(returnValue: unknown[]) {
  const mockReturning = vi.fn().mockResolvedValue(returnValue);
  const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbUpdate.mockReturnValue({ set: mockSet });
  return { mockSet, mockWhere, mockReturning };
}

describe('RenderService', () => {
  let service: RenderService;

  beforeEach(() => {
    service = new RenderService();
    vi.clearAllMocks();
  });

  describe('requestRender', () => {
    // requestRender now takes a single object: { sessionId, roomId, mode, prompt, baseImageUrl? }

    it('should throw NotFoundError when room does not exist', async () => {
      // First select (room check) returns empty
      setupDbSelectChain([]);

      await expect(
        service.requestRender({ sessionId: SESSION_ID, roomId: ROOM_ID, mode: 'from_scratch', prompt: 'A modern kitchen render' })
      ).rejects.toThrow('Room not found');
    });

    it('should throw BadRequestError when edit_existing lacks baseImageUrl', async () => {
      // edit_existing mode requires a base image URL — service should reject before any DB call
      await expect(
        service.requestRender({ sessionId: SESSION_ID, roomId: ROOM_ID, mode: 'edit_existing', prompt: 'Renovate this room' })
      ).rejects.toThrow('baseImageUrl is required');
    });

    it('should throw BadRequestError when rate limit is exceeded', async () => {
      // First call: room exists
      const mockWhere1 = vi.fn().mockResolvedValue([{ id: ROOM_ID, name: 'Kitchen' }]);
      const mockFrom1 = vi.fn().mockReturnValue({ where: mockWhere1 });

      // Second call: count of renders
      const mockWhere2 = vi.fn().mockResolvedValue([{ count: 10 }]);
      const mockFrom2 = vi.fn().mockReturnValue({ where: mockWhere2 });

      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: mockFrom1 };
        return { from: mockFrom2 };
      });

      await expect(
        service.requestRender({ sessionId: SESSION_ID, roomId: ROOM_ID, mode: 'from_scratch', prompt: 'A modern kitchen render' })
      ).rejects.toThrow('Render limit reached');
    });

    it('should create asset record and enqueue job on success', async () => {
      // Room exists
      const mockWhere1 = vi.fn().mockResolvedValue([{ id: ROOM_ID, name: 'Kitchen' }]);
      const mockFrom1 = vi.fn().mockReturnValue({ where: mockWhere1 });

      // Rate limit check: under limit
      const mockWhere2 = vi.fn().mockResolvedValue([{ count: 2 }]);
      const mockFrom2 = vi.fn().mockReturnValue({ where: mockWhere2 });

      let selectCallCount = 0;
      mockDbSelect.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return { from: mockFrom1 };
        return { from: mockFrom2 };
      });

      // Insert returns asset record
      setupDbInsertChain([{
        id: 'asset-uuid-1',
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        assetType: 'render',
        status: 'processing',
      }]);

      // Queue add returns job
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      const result = await service.requestRender({
        sessionId: SESSION_ID,
        roomId: ROOM_ID,
        mode: 'from_scratch',
        prompt: 'A modern kitchen with marble counters',
      });

      expect(result.assetId).toBe('asset-uuid-1');
      expect(result.jobId).toBe('job-123');
      // Job data should now include mode
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'render:generate',
        expect.objectContaining({
          sessionId: SESSION_ID,
          roomId: ROOM_ID,
          mode: 'from_scratch',
          prompt: 'A modern kitchen with marble counters',
          assetId: 'asset-uuid-1',
        }),
      );
    });
  });

  describe('completeRender', () => {
    it('should throw NotFoundError when asset does not exist', async () => {
      setupDbSelectChain([]);

      await expect(
        service.completeRender('nonexistent-id', {
          imageBuffer: Buffer.from('test'),
          contentType: 'image/png',
          metadata: { model: 'gemini', generationTimeMs: 1000 },
        })
      ).rejects.toThrow('Render asset not found');
    });

    it('should update asset record on success', async () => {
      // Select returns existing asset
      setupDbSelectChain([{
        id: 'asset-uuid-1',
        storagePath: 'session/room/renders/test.png',
        metadata: { prompt: 'test prompt' },
      }]);

      // Update returns updated asset
      setupDbUpdateChain([{
        id: 'asset-uuid-1',
        status: 'ready',
        fileSize: 100,
      }]);

      const result = await service.completeRender('asset-uuid-1', {
        imageBuffer: Buffer.from('image-data'),
        contentType: 'image/png',
        metadata: { model: 'gemini-2.0-flash-exp', generationTimeMs: 5000 },
      });

      expect(result.status).toBe('ready');
    });
  });

  describe('failRender', () => {
    it('should update asset status to failed', async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      mockDbUpdate.mockReturnValue({ set: mockSet });

      await service.failRender('asset-uuid-1', 'Generation failed');

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' })
      );
    });
  });

  describe('getRenders', () => {
    it('should return renders for a room', async () => {
      const mockOrderBy = vi.fn().mockResolvedValue([
        { id: 'r1', assetType: 'render' },
        { id: 'r2', assetType: 'render' },
      ]);
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      mockDbSelect.mockReturnValue({ from: mockFrom });

      const renders = await service.getRenders(ROOM_ID);

      expect(renders).toHaveLength(2);
    });
  });
});
