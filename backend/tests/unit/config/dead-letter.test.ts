import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockQueueOn = vi.fn();
const mockQueueInstance = { add: mockQueueAdd, close: mockQueueClose, on: mockQueueOn };
const MockQueue = vi.fn().mockReturnValue(mockQueueInstance);

vi.mock('bullmq', () => ({
  Queue: MockQueue,
}));

vi.mock('../../../src/config/queue.js', () => ({
  connection: { host: 'localhost', port: 6379, maxRetriesPerRequest: null },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(), error: vi.fn(), warn: vi.fn(),
  })),
}));

describe('dead-letter.ts', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset the module so _dlq is null for each test
    vi.resetModules();

    vi.doMock('bullmq', () => ({ Queue: MockQueue }));
    vi.doMock('../../../src/config/queue.js', () => ({
      connection: { host: 'localhost', port: 6379, maxRetriesPerRequest: null },
    }));
    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({
        info: vi.fn(), error: vi.fn(), warn: vi.fn(),
      })),
    }));
  });

  it('should lazy-initialize the DLQ', async () => {
    const { getDLQ } = await import('../../../src/config/dead-letter.js');

    getDLQ();

    expect(MockQueue).toHaveBeenCalledWith('dead-letter', expect.any(Object));
  });

  it('should return the same singleton on repeated calls', async () => {
    const { getDLQ } = await import('../../../src/config/dead-letter.js');

    const q1 = getDLQ();
    const q2 = getDLQ();

    expect(q1).toBe(q2);
    expect(MockQueue).toHaveBeenCalledTimes(1);
  });

  it('should add job with correct metadata to DLQ', async () => {
    const { moveToDeadLetter } = await import('../../../src/config/dead-letter.js');

    const mockJob = {
      id: 'job-123',
      data: { assetId: 'a1', sessionId: 's1' },
      attemptsMade: 3,
    };

    await moveToDeadLetter(
      mockJob as never,
      'Something went wrong',
      'image:optimize',
    );

    expect(mockQueueAdd).toHaveBeenCalledWith('dead-letter', {
      originalJobId: 'job-123',
      sourceQueue: 'image:optimize',
      reason: 'Something went wrong',
      data: { assetId: 'a1', sessionId: 's1' },
      attemptsMade: 3,
      failedAt: expect.any(String),
    });
  });

  it('should not throw when DLQ add fails', async () => {
    mockQueueAdd.mockRejectedValueOnce(new Error('Redis down'));

    const { moveToDeadLetter } = await import('../../../src/config/dead-letter.js');

    const mockJob = {
      id: 'job-456',
      data: {},
      attemptsMade: 1,
    };

    // Should not throw
    await expect(
      moveToDeadLetter(mockJob as never, 'fail', 'doc:generate-plan'),
    ).resolves.toBeUndefined();
  });

  it('should close the DLQ', async () => {
    const { getDLQ, closeDLQ } = await import('../../../src/config/dead-letter.js');

    // Initialize DLQ first
    getDLQ();

    await closeDLQ();

    expect(mockQueueClose).toHaveBeenCalled();
  });

  it('should be no-op when closeDLQ is called without initialization', async () => {
    const { closeDLQ } = await import('../../../src/config/dead-letter.js');

    // Should not throw even when DLQ was never initialized
    await expect(closeDLQ()).resolves.toBeUndefined();
    expect(mockQueueClose).not.toHaveBeenCalled();
  });
});
