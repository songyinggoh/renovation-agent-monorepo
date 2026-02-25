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

vi.mock('../../../src/utils/socket-emitter.js', () => ({
  emitToSession: vi.fn(),
}));

describe('DocWorker', () => {
  let processDocJob: (job: Record<string, unknown>) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
    }));
    vi.doMock('../../../src/config/queue.js', () => ({
      createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
    }));
    vi.doMock('../../../src/utils/socket-emitter.js', () => ({
      emitToSession: vi.fn(),
    }));

    const mod = await import('../../../src/workers/doc.worker.js');
    mod.startDocWorker();

    const { createWorker: cw } = await import('../../../src/config/queue.js');
    processDocJob = (cw as Mock).mock.calls[0][1] as typeof processDocJob;
  });

  it('should throw UnrecoverableError for missing sessionId', async () => {
    const job = { data: { sessionId: '', roomId: '00000000-0000-4000-a000-000000000002', format: 'pdf' }, id: 'job-1' };
    await expect(processDocJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should throw UnrecoverableError for missing roomId', async () => {
    const job = { data: { sessionId: '00000000-0000-4000-a000-000000000001', roomId: '', format: 'pdf' }, id: 'job-1' };
    await expect(processDocJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should throw UnrecoverableError for invalid format', async () => {
    const job = { data: { sessionId: '00000000-0000-4000-a000-000000000001', roomId: '00000000-0000-4000-a000-000000000002', format: 'docx' }, id: 'job-1' };
    await expect(processDocJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should succeed for valid pdf job (no-op)', async () => {
    const job = { data: { sessionId: '00000000-0000-4000-a000-000000000001', roomId: '00000000-0000-4000-a000-000000000002', format: 'pdf' }, id: 'job-1' };
    await expect(processDocJob(job)).resolves.toBeUndefined();
  });

  it('should emit doc:generated with correct payload on valid job', async () => {
    const { emitToSession } = await import('../../../src/utils/socket-emitter.js');
    const sessionId = '00000000-0000-4000-a000-000000000001';
    const roomId = '00000000-0000-4000-a000-000000000002';
    const job = { data: { sessionId, roomId, format: 'pdf' }, id: 'job-1' };

    await processDocJob(job);

    expect(emitToSession).toHaveBeenCalledWith(sessionId, 'doc:generated', {
      sessionId,
      roomId,
      format: 'pdf',
    });
  });

  it('should not emit doc:generated when job data is invalid', async () => {
    const { emitToSession } = await import('../../../src/utils/socket-emitter.js');
    const job = { data: { sessionId: 'bad-uuid', roomId: '00000000-0000-4000-a000-000000000002', format: 'pdf' }, id: 'job-2' };

    await expect(processDocJob(job)).rejects.toThrow(UnrecoverableError);
    expect(emitToSession).not.toHaveBeenCalled();
  });

  it('should succeed for valid html job (no-op)', async () => {
    const job = { data: { sessionId: '00000000-0000-4000-a000-000000000001', roomId: '00000000-0000-4000-a000-000000000002', format: 'html' }, id: 'job-1' };
    await expect(processDocJob(job)).resolves.toBeUndefined();
  });

  it('should use profile defaults (no explicit concurrency arg)', async () => {
    const { createWorker: cw } = await import('../../../src/config/queue.js');
    // Workers now rely on WORKER_PROFILES — no third arg passed
    expect((cw as Mock).mock.calls[0][2]).toBeUndefined();
  });

  it('should register with queue name doc:generate-plan', async () => {
    const { createWorker: cw } = await import('../../../src/config/queue.js');
    expect((cw as Mock).mock.calls[0][0]).toBe('doc:generate-plan');
  });
});
