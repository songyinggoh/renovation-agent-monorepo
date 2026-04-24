import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import type { Mock } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(), error: vi.fn(), warn: vi.fn(),
  })),
}));

describe('DocWorker', () => {
  let processDocJob: (job: Record<string, unknown>) => Promise<void>;
  let mockGenerateChecklist: Mock;
  let mockGeneratePlan: Mock;
  let mockEmitToSession: Mock;

  function makeJob(data: Record<string, unknown>, id = 'job-1', token = 'token-1') {
    return { data, id, token, extendLock: vi.fn().mockResolvedValue(undefined) };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    mockGenerateChecklist = vi.fn();
    mockGeneratePlan = vi.fn();
    mockEmitToSession = vi.fn();

    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
    }));

    vi.doMock('../../../src/config/queue.js', () => ({
      createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
      withTimeout: vi.fn((promise: Promise<unknown>) => promise),
      WORKER_PROFILES: { 'doc:generate-plan': { timeoutMs: 120_000 } },
    }));

    vi.doMock('../../../src/utils/socket-emitter.js', () => ({
      emitToSession: mockEmitToSession,
    }));

    vi.doMock('../../../src/services/document.service.js', () => ({
      DocumentService: vi.fn().mockImplementation(() => ({
        generateChecklist: mockGenerateChecklist,
        generatePlan: mockGeneratePlan,
        close: vi.fn(),
      })),
    }));

    const mod = await import('../../../src/workers/doc.worker.js');
    mod.startDocWorker();

    const { createWorker: cw } = await import('../../../src/config/queue.js');
    processDocJob = (cw as Mock).mock.calls[0][1] as typeof processDocJob;
  });

  // ---------------------------------------------------------------------------
  // Worker registration
  // ---------------------------------------------------------------------------

  it('should register with queue name doc:generate-plan', async () => {
    const { createWorker: cw } = await import('../../../src/config/queue.js');
    expect((cw as Mock).mock.calls[0][0]).toBe('doc:generate-plan');
  });

  it('should not pass explicit concurrency (uses WORKER_PROFILES)', async () => {
    const { createWorker: cw } = await import('../../../src/config/queue.js');
    expect((cw as Mock).mock.calls[0][2]).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Input validation — UnrecoverableError on bad job data
  // ---------------------------------------------------------------------------

  it('should throw UnrecoverableError for missing sessionId', async () => {
    const job = makeJob({ documentType: 'checklist_pdf' });
    await expect(processDocJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should throw UnrecoverableError for invalid documentType', async () => {
    const job = makeJob({ sessionId: '00000000-0000-4000-a000-000000000001', documentType: 'pdf' });
    await expect(processDocJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should throw UnrecoverableError for old format field', async () => {
    const job = makeJob({ sessionId: '00000000-0000-4000-a000-000000000001', format: 'pdf' });
    await expect(processDocJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should not emit any Socket.io event when job data is invalid', async () => {
    const job = makeJob({ sessionId: 'bad-uuid', documentType: 'checklist_pdf' });
    await expect(processDocJob(job)).rejects.toThrow(UnrecoverableError);
    expect(mockEmitToSession).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Checklist PDF — happy path
  // ---------------------------------------------------------------------------

  it('should emit doc:generation_started then doc:generation_complete for checklist_pdf', async () => {
    const sessionId = '00000000-0000-4000-a000-000000000001';
    const roomId = '00000000-0000-4000-a000-000000000002';
    mockGenerateChecklist.mockResolvedValue({ documentId: 'doc-1', storagePath: 'docs/doc-1.pdf' });

    const job = makeJob({ sessionId, documentType: 'checklist_pdf', roomId });
    await processDocJob(job);

    expect(mockEmitToSession).toHaveBeenCalledWith(sessionId, 'doc:generation_started', expect.objectContaining({ sessionId, documentType: 'checklist_pdf', roomId }));
    expect(mockEmitToSession).toHaveBeenCalledWith(sessionId, 'doc:generation_complete', expect.objectContaining({ sessionId, documentType: 'checklist_pdf', documentId: 'doc-1', storagePath: 'docs/doc-1.pdf' }));
  });

  it('should call generateChecklist with sessionId and roomId for checklist_pdf', async () => {
    const sessionId = '00000000-0000-4000-a000-000000000001';
    const roomId = '00000000-0000-4000-a000-000000000002';
    mockGenerateChecklist.mockResolvedValue({ documentId: 'doc-1', storagePath: 'docs/doc-1.pdf' });

    const job = makeJob({ sessionId, documentType: 'checklist_pdf', roomId });
    await processDocJob(job);

    expect(mockGenerateChecklist).toHaveBeenCalledWith(sessionId, roomId);
    expect(mockGeneratePlan).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Plan PDF — happy path
  // ---------------------------------------------------------------------------

  it('should call generatePlan with sessionId for plan_pdf', async () => {
    const sessionId = '00000000-0000-4000-a000-000000000001';
    mockGeneratePlan.mockResolvedValue({ documentId: 'doc-2', storagePath: 'docs/doc-2.pdf' });

    const job = makeJob({ sessionId, documentType: 'plan_pdf' });
    await processDocJob(job);

    expect(mockGeneratePlan).toHaveBeenCalledWith(sessionId);
    expect(mockGenerateChecklist).not.toHaveBeenCalled();
  });

  it('should emit doc:generation_complete with documentId for plan_pdf', async () => {
    const sessionId = '00000000-0000-4000-a000-000000000001';
    mockGeneratePlan.mockResolvedValue({ documentId: 'doc-2', storagePath: 'docs/doc-2.pdf' });

    const job = makeJob({ sessionId, documentType: 'plan_pdf' });
    await processDocJob(job);

    expect(mockEmitToSession).toHaveBeenCalledWith(sessionId, 'doc:generation_complete', expect.objectContaining({ documentId: 'doc-2' }));
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  it('should emit doc:generation_failed when DocumentService throws', async () => {
    const sessionId = '00000000-0000-4000-a000-000000000001';
    mockGeneratePlan.mockRejectedValue(new Error('DB connection lost'));

    const job = makeJob({ sessionId, documentType: 'plan_pdf' });
    await expect(processDocJob(job)).rejects.toThrow();

    expect(mockEmitToSession).toHaveBeenCalledWith(sessionId, 'doc:generation_failed', expect.objectContaining({ sessionId, documentType: 'plan_pdf', error: 'DB connection lost' }));
  });

  it('should throw UnrecoverableError for permanent "No plan data found" error', async () => {
    const sessionId = '00000000-0000-4000-a000-000000000001';
    mockGeneratePlan.mockRejectedValue(new Error('No plan data found for session'));

    const job = makeJob({ sessionId, documentType: 'plan_pdf' });
    await expect(processDocJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should throw UnrecoverableError for permanent "Session not found" error', async () => {
    const sessionId = '00000000-0000-4000-a000-000000000001';
    mockGeneratePlan.mockRejectedValue(new Error('Session not found'));

    const job = makeJob({ sessionId, documentType: 'plan_pdf' });
    await expect(processDocJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should throw UnrecoverableError for permanent "ProtocolError" (Puppeteer crash)', async () => {
    const sessionId = '00000000-0000-4000-a000-000000000001';
    mockGenerateChecklist.mockRejectedValue(new Error('ProtocolError: Target closed'));

    const job = makeJob({ sessionId, documentType: 'checklist_pdf' });
    await expect(processDocJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should throw UnrecoverableError for "PDF generation is disabled"', async () => {
    const sessionId = '00000000-0000-4000-a000-000000000001';
    mockGeneratePlan.mockRejectedValue(new Error('PDF generation is disabled'));

    const job = makeJob({ sessionId, documentType: 'plan_pdf' });
    await expect(processDocJob(job)).rejects.toThrow(UnrecoverableError);
  });

  it('should rethrow non-permanent errors as retryable', async () => {
    const sessionId = '00000000-0000-4000-a000-000000000001';
    const retryableErr = new Error('Network timeout');
    mockGeneratePlan.mockRejectedValue(retryableErr);

    const job = makeJob({ sessionId, documentType: 'plan_pdf' });
    try {
      await processDocJob(job);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).not.toBeInstanceOf(UnrecoverableError);
      expect((err as Error).message).toBe('Network timeout');
    }
  });
});
