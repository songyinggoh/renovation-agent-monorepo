import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import type { Mock } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(), error: vi.fn(), warn: vi.fn(),
  })),
}));

vi.mock('../../../src/config/queue.js', () => ({
  createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
}));

vi.mock('../../../src/config/env.js', () => ({
  isStorageEnabled: vi.fn().mockReturnValue(true),
  env: { SUPABASE_STORAGE_BUCKET: 'assets', REDIS_URL: 'redis://localhost:6379' },
}));

vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: { storage: { from: vi.fn() } },
}));

vi.mock('../../../src/db/index.js', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));

vi.mock('../../../src/db/schema/asset-variants.schema.js', () => ({
  assetVariants: { parentAssetId: 'parent_asset_id', variantType: 'variant_type' },
}));

vi.mock('../../../src/db/schema/assets.schema.js', () => ({
  roomAssets: {},
}));

vi.mock('../../../src/utils/socket-emitter.js', () => ({
  emitToSession: vi.fn(),
}));

describe('ImageWorker', () => {
  let processImageJob: (job: Record<string, unknown>) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
    }));
    vi.doMock('../../../src/config/queue.js', () => ({
      createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
    }));
    vi.doMock('../../../src/config/env.js', () => ({
      isStorageEnabled: vi.fn().mockReturnValue(true),
      env: { SUPABASE_STORAGE_BUCKET: 'assets', REDIS_URL: 'redis://localhost:6379' },
    }));
    vi.doMock('../../../src/config/supabase.js', () => ({
      supabaseAdmin: { storage: { from: vi.fn() } },
    }));
    vi.doMock('../../../src/db/index.js', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
        }),
        insert: vi.fn(),
        update: vi.fn(),
      },
    }));
    vi.doMock('../../../src/db/schema/asset-variants.schema.js', () => ({
      assetVariants: { parentAssetId: 'parent_asset_id', variantType: 'variant_type' },
    }));
    vi.doMock('../../../src/db/schema/assets.schema.js', () => ({ roomAssets: {} }));
    vi.doMock('../../../src/utils/socket-emitter.js', () => ({ emitToSession: vi.fn() }));

    const mod = await import('../../../src/workers/image.worker.js');
    mod.startImageWorker();

    const { createWorker: cw } = await import('../../../src/config/queue.js');
    processImageJob = (cw as Mock).mock.calls[0][1] as typeof processImageJob;
  });

  it('should throw UnrecoverableError for missing assetId', async () => {
    const job = { data: { assetId: '', sessionId: '00000000-0000-4000-a000-000000000002' }, id: 'job-1' };
    await expect(processImageJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should throw UnrecoverableError for missing sessionId', async () => {
    const job = { data: { assetId: '00000000-0000-4000-a000-000000000001', sessionId: '' }, id: 'job-1' };
    await expect(processImageJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should return early when storage is disabled', async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
    }));
    vi.doMock('../../../src/config/queue.js', () => ({
      createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
    }));
    vi.doMock('../../../src/config/env.js', () => ({
      isStorageEnabled: vi.fn().mockReturnValue(false),
      env: { SUPABASE_STORAGE_BUCKET: 'assets', REDIS_URL: 'redis://localhost:6379' },
    }));
    vi.doMock('../../../src/config/supabase.js', () => ({ supabaseAdmin: null }));
    vi.doMock('../../../src/db/index.js', () => ({
      db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
    }));
    vi.doMock('../../../src/db/schema/asset-variants.schema.js', () => ({ assetVariants: {} }));
    vi.doMock('../../../src/db/schema/assets.schema.js', () => ({ roomAssets: {} }));
    vi.doMock('../../../src/utils/socket-emitter.js', () => ({ emitToSession: vi.fn() }));

    const mod = await import('../../../src/workers/image.worker.js');
    mod.startImageWorker();
    const { createWorker: cw2 } = await import('../../../src/config/queue.js');
    const processor = (cw2 as Mock).mock.calls[0][1] as typeof processImageJob;

    const job = { data: { assetId: '00000000-0000-4000-a000-000000000001', sessionId: '00000000-0000-4000-a000-000000000002' }, id: 'job-1' };
    await expect(processor(job)).resolves.toBeUndefined();
  });

  it('should throw UnrecoverableError when asset not found', async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
    }));
    vi.doMock('../../../src/config/queue.js', () => ({
      createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
    }));
    vi.doMock('../../../src/config/env.js', () => ({
      isStorageEnabled: vi.fn().mockReturnValue(true),
      env: { SUPABASE_STORAGE_BUCKET: 'assets' },
    }));
    vi.doMock('../../../src/config/supabase.js', () => ({
      supabaseAdmin: { storage: { from: vi.fn() } },
    }));
    vi.doMock('../../../src/db/index.js', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
        }),
        insert: vi.fn(),
        update: vi.fn(),
      },
    }));
    vi.doMock('../../../src/db/schema/asset-variants.schema.js', () => ({ assetVariants: {} }));
    vi.doMock('../../../src/db/schema/assets.schema.js', () => ({ roomAssets: {} }));
    vi.doMock('../../../src/utils/socket-emitter.js', () => ({ emitToSession: vi.fn() }));

    const mod = await import('../../../src/workers/image.worker.js');
    mod.startImageWorker();
    const { createWorker: cw2 } = await import('../../../src/config/queue.js');
    const processor = (cw2 as Mock).mock.calls[0][1] as typeof processImageJob;

    const job = { data: { assetId: '00000000-0000-4000-a000-000000000001', sessionId: '00000000-0000-4000-a000-000000000002' }, id: 'job-1' };
    await expect(processor(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should throw UnrecoverableError for non-photo asset', async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
    }));
    vi.doMock('../../../src/config/queue.js', () => ({
      createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
    }));
    vi.doMock('../../../src/config/env.js', () => ({
      isStorageEnabled: vi.fn().mockReturnValue(true),
      env: { SUPABASE_STORAGE_BUCKET: 'assets' },
    }));
    vi.doMock('../../../src/config/supabase.js', () => ({
      supabaseAdmin: { storage: { from: vi.fn() } },
    }));
    vi.doMock('../../../src/db/index.js', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{
              id: '00000000-0000-4000-a000-000000000001', assetType: 'document',
              contentType: 'application/pdf', storagePath: 'path/file.pdf',
            }]),
          }),
        }),
        insert: vi.fn(),
        update: vi.fn(),
      },
    }));
    vi.doMock('../../../src/db/schema/asset-variants.schema.js', () => ({ assetVariants: {} }));
    vi.doMock('../../../src/db/schema/assets.schema.js', () => ({ roomAssets: {} }));
    vi.doMock('../../../src/utils/socket-emitter.js', () => ({ emitToSession: vi.fn() }));

    const mod = await import('../../../src/workers/image.worker.js');
    mod.startImageWorker();
    const { createWorker: cw2 } = await import('../../../src/config/queue.js');
    const processor = (cw2 as Mock).mock.calls[0][1] as typeof processImageJob;

    const job = { data: { assetId: '00000000-0000-4000-a000-000000000001', sessionId: '00000000-0000-4000-a000-000000000002' }, id: 'job-1' };
    await expect(processor(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should throw UnrecoverableError for unsupported content type', async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
    }));
    vi.doMock('../../../src/config/queue.js', () => ({
      createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
    }));
    vi.doMock('../../../src/config/env.js', () => ({
      isStorageEnabled: vi.fn().mockReturnValue(true),
      env: { SUPABASE_STORAGE_BUCKET: 'assets' },
    }));
    vi.doMock('../../../src/config/supabase.js', () => ({
      supabaseAdmin: { storage: { from: vi.fn() } },
    }));
    vi.doMock('../../../src/db/index.js', () => ({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{
              id: '00000000-0000-4000-a000-000000000001', assetType: 'photo',
              contentType: 'image/tiff', storagePath: 'path/file.tiff',
            }]),
          }),
        }),
        insert: vi.fn(),
        update: vi.fn(),
      },
    }));
    vi.doMock('../../../src/db/schema/asset-variants.schema.js', () => ({ assetVariants: {} }));
    vi.doMock('../../../src/db/schema/assets.schema.js', () => ({ roomAssets: {} }));
    vi.doMock('../../../src/utils/socket-emitter.js', () => ({ emitToSession: vi.fn() }));

    const mod = await import('../../../src/workers/image.worker.js');
    mod.startImageWorker();
    const { createWorker: cw2 } = await import('../../../src/config/queue.js');
    const processor = (cw2 as Mock).mock.calls[0][1] as typeof processImageJob;

    const job = { data: { assetId: '00000000-0000-4000-a000-000000000001', sessionId: '00000000-0000-4000-a000-000000000002' }, id: 'job-1' };
    await expect(processor(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should use profile defaults (no explicit concurrency arg)', async () => {
    const { createWorker: cw } = await import('../../../src/config/queue.js');
    // Workers now rely on WORKER_PROFILES — no third arg passed
    expect((cw as Mock).mock.calls[0][2]).toBeUndefined();
  });

  it('should register with queue name image:optimize', async () => {
    const { createWorker: cw } = await import('../../../src/config/queue.js');
    expect((cw as Mock).mock.calls[0][0]).toBe('image:optimize');
  });
});
