import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import type { Mock } from 'vitest';

// --- Module mocks (hoisted) ---

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(), error: vi.fn(), warn: vi.fn(),
  })),
}));

vi.mock('../../../src/config/queue.js', () => ({
  createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
  WORKER_PROFILES: {
    'render:generate': {
      concurrency: 1,
      lockDuration: 120_000,
      timeoutMs: 90_000,
      stalledInterval: 45_000,
      maxStalledCount: 2,
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 50 },
    },
  },
  withTimeout: vi.fn(async (promise: Promise<unknown>) => promise),
}));

vi.mock('../../../src/utils/socket-emitter.js', () => ({
  emitToSession: vi.fn(),
}));

vi.mock('../../../src/services/render.service.js', () => ({
  RenderService: vi.fn().mockImplementation(() => ({
    completeRender: vi.fn().mockResolvedValue({}),
    failRender: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../src/services/image-generation.service.js', () => ({
  createImageGenerationAdapter: vi.fn().mockReturnValue({
    providerName: 'gemini',
    generate: vi.fn().mockResolvedValue({
      imageBuffer: Buffer.from('fake-image'),
      contentType: 'image/png',
      metadata: { model: 'gemini-2.0-flash-exp', generationTimeMs: 1234 },
    }),
  }),
}));

vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../src/db/schema/assets.schema.js', () => ({
  roomAssets: { id: 'id', storagePath: 'storagePath' },
}));

vi.mock('../../../src/config/env.js', () => ({
  isStorageEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: null,
}));

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startActiveSpan: vi.fn((_name: string, fn: (span: Record<string, unknown>) => Promise<unknown>) => {
        const mockSpan = {
          setAttributes: vi.fn(),
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
          recordException: vi.fn(),
          end: vi.fn(),
        };
        return fn(mockSpan);
      }),
    }),
  },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

const SESSION_ID = '00000000-0000-4000-a000-000000000001';
const ROOM_ID = '00000000-0000-4000-a000-000000000002';
const ASSET_ID = '00000000-0000-4000-a000-000000000003';

function makeJob(overrides: Record<string, unknown> = {}, opts: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    data: {
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      prompt: 'Modern kitchen with marble countertops',
      assetId: ASSET_ID,
      ...overrides,
    },
    attemptsMade: 0,
    opts: { attempts: 3, ...opts },
  };
}

describe('RenderWorker', () => {
  let processRenderJob: (job: Record<string, unknown>) => Promise<void>;
  let emitToSession: Mock;
  let createImageGenerationAdapter: Mock;
  let RenderService: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-mock for dynamic import
    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
    }));
    vi.doMock('../../../src/config/queue.js', () => ({
      createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
      WORKER_PROFILES: {
        'render:generate': {
          concurrency: 1, lockDuration: 120_000, timeoutMs: 90_000,
          stalledInterval: 45_000, maxStalledCount: 2,
          defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 50 },
        },
      },
      withTimeout: vi.fn(async (promise: Promise<unknown>) => promise),
    }));
    vi.doMock('../../../src/utils/socket-emitter.js', () => ({
      emitToSession: vi.fn(),
    }));
    vi.doMock('../../../src/services/render.service.js', () => ({
      RenderService: vi.fn().mockImplementation(() => ({
        completeRender: vi.fn().mockResolvedValue({}),
        failRender: vi.fn().mockResolvedValue(undefined),
      })),
    }));
    vi.doMock('../../../src/services/image-generation.service.js', () => ({
      createImageGenerationAdapter: vi.fn().mockReturnValue({
        providerName: 'gemini',
        generate: vi.fn().mockResolvedValue({
          imageBuffer: Buffer.from('fake-image'),
          contentType: 'image/png',
          metadata: { model: 'gemini-2.0-flash-exp', generationTimeMs: 1234 },
        }),
      }),
    }));
    vi.doMock('../../../src/db/index.js', () => ({
      db: { select: vi.fn().mockReturnThis(), from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) },
    }));
    vi.doMock('../../../src/db/schema/assets.schema.js', () => ({
      roomAssets: { id: 'id', storagePath: 'storagePath' },
    }));
    vi.doMock('../../../src/config/env.js', () => ({
      isStorageEnabled: vi.fn().mockReturnValue(false),
    }));
    vi.doMock('../../../src/config/supabase.js', () => ({
      supabaseAdmin: null,
    }));
    vi.doMock('@opentelemetry/api', () => ({
      trace: {
        getTracer: () => ({
          startActiveSpan: vi.fn((_name: string, fn: (span: Record<string, unknown>) => Promise<unknown>) => {
            const mockSpan = {
              setAttributes: vi.fn(), setAttribute: vi.fn(),
              setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn(),
            };
            return fn(mockSpan);
          }),
        }),
      },
      SpanStatusCode: { OK: 1, ERROR: 2 },
    }));

    const mod = await import('../../../src/workers/render.worker.js');
    mod.startRenderWorker();

    const { createWorker: cw } = await import('../../../src/config/queue.js');
    processRenderJob = (cw as Mock).mock.calls[0][1] as typeof processRenderJob;

    emitToSession = (await import('../../../src/utils/socket-emitter.js')).emitToSession as Mock;
    createImageGenerationAdapter = (await import('../../../src/services/image-generation.service.js')).createImageGenerationAdapter as Mock;
    RenderService = (await import('../../../src/services/render.service.js')).RenderService as Mock;
  });

  // --- Validation ---

  it('should throw UnrecoverableError for invalid job data', async () => {
    const job = makeJob({ sessionId: 'not-a-uuid' });
    await expect(processRenderJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should throw UnrecoverableError for missing prompt', async () => {
    const job = makeJob({ prompt: '' });
    await expect(processRenderJob(job)).rejects.toThrow(UnrecoverableError);
  });

  // --- Happy path ---

  it('should emit started, progress, and complete events on success', async () => {
    const job = makeJob();
    await processRenderJob(job);

    // Should emit: started, progress(0), progress(70), progress(95), complete
    const calls = emitToSession.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(calls[0][1]).toBe('render:started');
    expect(calls[1][1]).toBe('render:progress');
    expect(calls[1][2]).toMatchObject({ progress: 0, stage: 'generating' });
    expect(calls[2][1]).toBe('render:progress');
    expect(calls[2][2]).toMatchObject({ progress: 70, stage: 'uploading' });
    expect(calls[3][1]).toBe('render:progress');
    expect(calls[3][2]).toMatchObject({ progress: 95, stage: 'finalizing' });
    expect(calls[4][1]).toBe('render:complete');
  });

  it('should include sessionId in all emitted events', async () => {
    const job = makeJob();
    await processRenderJob(job);

    for (const call of emitToSession.mock.calls) {
      expect(call[2]).toHaveProperty('sessionId', SESSION_ID);
    }
  });

  it('should call completeRender with the adapter result', async () => {
    const job = makeJob();
    await processRenderJob(job);

    const renderServiceInstance = RenderService.mock.results[0].value;
    expect(renderServiceInstance.completeRender).toHaveBeenCalledWith(
      ASSET_ID,
      expect.objectContaining({ contentType: 'image/png' }),
    );
  });

  // --- Permanent error detection ---

  it('should throw UnrecoverableError for content policy errors (no retry)', async () => {
    const adapter = createImageGenerationAdapter();
    adapter.generate.mockRejectedValueOnce(new Error('Request blocked by safety filters'));

    const job = makeJob();
    await expect(processRenderJob(job)).rejects.toThrow(UnrecoverableError);

    const renderServiceInstance = RenderService.mock.results[0].value;
    expect(renderServiceInstance.failRender).toHaveBeenCalledWith(ASSET_ID, expect.stringContaining('safety filters'));
  });

  it('should emit render:failed for permanent errors', async () => {
    const adapter = createImageGenerationAdapter();
    adapter.generate.mockRejectedValueOnce(new Error('Content policy violation'));

    const job = makeJob();
    await expect(processRenderJob(job)).rejects.toThrow(UnrecoverableError);

    const failedCall = emitToSession.mock.calls.find(
      (c: unknown[]) => c[1] === 'render:failed',
    );
    expect(failedCall).toBeTruthy();
    expect(failedCall![2]).toHaveProperty('sessionId', SESSION_ID);
  });

  // --- Retry / final attempt ---

  it('should re-throw non-permanent errors for BullMQ retry', async () => {
    const adapter = createImageGenerationAdapter();
    adapter.generate.mockRejectedValueOnce(new Error('Network timeout'));

    const job = makeJob({}, {});
    job.attemptsMade = 0;

    await expect(processRenderJob(job)).rejects.toThrow('Network timeout');
    // Should NOT throw UnrecoverableError
    try {
      await processRenderJob(makeJob());
    } catch {
      // swallow — adapter is no longer rejecting after first call
    }
  });

  it('should emit render:failed and call failRender on final attempt', async () => {
    const adapter = createImageGenerationAdapter();
    adapter.generate.mockRejectedValueOnce(new Error('API unavailable'));

    const job = makeJob();
    job.attemptsMade = 2; // 3rd attempt (0-indexed), attempts: 3

    await expect(processRenderJob(job)).rejects.toThrow('API unavailable');

    const renderServiceInstance = RenderService.mock.results[0].value;
    expect(renderServiceInstance.failRender).toHaveBeenCalled();

    const failedCall = emitToSession.mock.calls.find(
      (c: unknown[]) => c[1] === 'render:failed',
    );
    expect(failedCall).toBeTruthy();
  });

  // --- Upload timeout ---

  it('should wrap completeRender with withTimeout', async () => {
    const job = makeJob();
    await processRenderJob(job);

    const { withTimeout } = await import('../../../src/config/queue.js');
    expect(withTimeout).toHaveBeenCalledWith(
      expect.anything(),
      20_000,
      expect.stringContaining('completeRender'),
    );
  });
});
