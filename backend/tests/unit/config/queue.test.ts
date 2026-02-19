import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Track Worker constructor calls
const mockWorkerOn = vi.fn();
const mockWorkerInstance = { on: mockWorkerOn, close: vi.fn() };
const MockWorker = vi.fn().mockReturnValue(mockWorkerInstance);

const mockQueueOn = vi.fn();
const mockQueueClose = vi.fn().mockResolvedValue(undefined);
const mockQueueInstance = { on: mockQueueOn, close: mockQueueClose };
const MockQueue = vi.fn().mockReturnValue(mockQueueInstance);

vi.mock('bullmq', () => ({
  Queue: MockQueue,
  Worker: MockWorker,
}));

vi.mock('../../../src/config/env.js', () => ({
  env: { REDIS_URL: 'redis://localhost:6379' },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(), error: vi.fn(), warn: vi.fn(),
  })),
}));

// Mock dead-letter.ts for the import in queue.ts
const mockMoveToDeadLetter = vi.fn().mockResolvedValue(undefined);
const mockCloseDLQ = vi.fn().mockResolvedValue(undefined);
vi.mock('../../../src/config/dead-letter.js', () => ({
  moveToDeadLetter: (...args: unknown[]) => mockMoveToDeadLetter(...args),
  closeDLQ: () => mockCloseDLQ(),
}));

describe('queue.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('WORKER_PROFILES', () => {
    it('should have a profile for every JobName', async () => {
      const { WORKER_PROFILES } = await import('../../../src/config/queue.js');
      const expectedKeys = [
        'image:optimize',
        'ai:process-message',
        'doc:generate-plan',
        'email:send-notification',
        'render:generate',
      ];
      expect(Object.keys(WORKER_PROFILES).sort()).toEqual(expectedKeys.sort());
    });

    it('should have concurrency >= 1 for all profiles', async () => {
      const { WORKER_PROFILES } = await import('../../../src/config/queue.js');
      for (const [name, profile] of Object.entries(WORKER_PROFILES)) {
        expect(profile.concurrency, `${name} concurrency`).toBeGreaterThanOrEqual(1);
      }
    });

    it('should have lockDuration > timeoutMs for all profiles', async () => {
      const { WORKER_PROFILES } = await import('../../../src/config/queue.js');
      for (const [name, profile] of Object.entries(WORKER_PROFILES)) {
        expect(profile.lockDuration, `${name} lockDuration > timeoutMs`).toBeGreaterThan(profile.timeoutMs);
      }
    });

    it('should have stalledInterval > 0 for all profiles', async () => {
      const { WORKER_PROFILES } = await import('../../../src/config/queue.js');
      for (const [name, profile] of Object.entries(WORKER_PROFILES)) {
        expect(profile.stalledInterval, `${name} stalledInterval`).toBeGreaterThan(0);
      }
    });

    it('should have maxStalledCount >= 1 for all profiles', async () => {
      const { WORKER_PROFILES } = await import('../../../src/config/queue.js');
      for (const [name, profile] of Object.entries(WORKER_PROFILES)) {
        expect(profile.maxStalledCount, `${name} maxStalledCount`).toBeGreaterThanOrEqual(1);
      }
    });

    it('should have attempts >= 1 in defaultJobOptions for all profiles', async () => {
      const { WORKER_PROFILES } = await import('../../../src/config/queue.js');
      for (const [name, profile] of Object.entries(WORKER_PROFILES)) {
        expect(profile.defaultJobOptions.attempts, `${name} attempts`).toBeGreaterThanOrEqual(1);
      }
    });

    it('should have exponential backoff in defaultJobOptions for all profiles', async () => {
      const { WORKER_PROFILES } = await import('../../../src/config/queue.js');
      for (const [name, profile] of Object.entries(WORKER_PROFILES)) {
        expect(profile.defaultJobOptions.backoff.type, `${name} backoff type`).toBe('exponential');
        expect(profile.defaultJobOptions.backoff.delay, `${name} backoff delay`).toBeGreaterThan(0);
      }
    });

    it('should have rate limiter only for email and render profiles', async () => {
      const { WORKER_PROFILES } = await import('../../../src/config/queue.js');
      expect(WORKER_PROFILES['email:send-notification'].limiter).toBeDefined();
      expect(WORKER_PROFILES['render:generate'].limiter).toBeDefined();
      expect(WORKER_PROFILES['image:optimize'].limiter).toBeUndefined();
      expect(WORKER_PROFILES['doc:generate-plan'].limiter).toBeUndefined();
      expect(WORKER_PROFILES['ai:process-message'].limiter).toBeUndefined();
    });
  });

  describe('createWorker', () => {
    it('should use profile defaults when no override provided', async () => {
      const { createWorker, WORKER_PROFILES } = await import('../../../src/config/queue.js');
      const processor = vi.fn();

      createWorker('image:optimize', processor);

      const profile = WORKER_PROFILES['image:optimize'];
      expect(MockWorker).toHaveBeenCalledWith(
        'image:optimize',
        processor,
        expect.objectContaining({
          concurrency: profile.concurrency,
          lockDuration: profile.lockDuration,
          stalledInterval: profile.stalledInterval,
          maxStalledCount: profile.maxStalledCount,
        }),
      );
    });

    it('should accept a number override for concurrency', async () => {
      const { createWorker } = await import('../../../src/config/queue.js');
      const processor = vi.fn();

      createWorker('image:optimize', processor, 5);

      expect(MockWorker).toHaveBeenCalledWith(
        'image:optimize',
        processor,
        expect.objectContaining({ concurrency: 5 }),
      );
    });

    it('should accept a partial profile override', async () => {
      const { createWorker, WORKER_PROFILES } = await import('../../../src/config/queue.js');
      const processor = vi.fn();

      createWorker('image:optimize', processor, { concurrency: 4, lockDuration: 90_000 });

      expect(MockWorker).toHaveBeenCalledWith(
        'image:optimize',
        processor,
        expect.objectContaining({
          concurrency: 4,
          lockDuration: 90_000,
          stalledInterval: WORKER_PROFILES['image:optimize'].stalledInterval,
        }),
      );
    });

    it('should pass limiter when profile has one', async () => {
      const { createWorker, WORKER_PROFILES } = await import('../../../src/config/queue.js');
      const processor = vi.fn();

      createWorker('email:send-notification', processor);

      expect(MockWorker).toHaveBeenCalledWith(
        'email:send-notification',
        processor,
        expect.objectContaining({
          limiter: WORKER_PROFILES['email:send-notification'].limiter,
        }),
      );
    });

    it('should NOT pass limiter when profile has none', async () => {
      const { createWorker } = await import('../../../src/config/queue.js');
      const processor = vi.fn();

      createWorker('image:optimize', processor);

      const constructorOpts = MockWorker.mock.calls[MockWorker.mock.calls.length - 1]![2];
      expect(constructorOpts).not.toHaveProperty('limiter');
    });

    it('should register completed, failed, error, stalled event handlers', async () => {
      const { createWorker } = await import('../../../src/config/queue.js');
      const processor = vi.fn();

      createWorker('image:optimize', processor);

      const events = mockWorkerOn.mock.calls.map((c: unknown[]) => c[0]);
      expect(events).toContain('completed');
      expect(events).toContain('failed');
      expect(events).toContain('error');
      expect(events).toContain('stalled');
    });

    it('should call moveToDeadLetter on final failure', async () => {
      const { createWorker, WORKER_PROFILES } = await import('../../../src/config/queue.js');
      const processor = vi.fn();

      createWorker('image:optimize', processor);

      // Find the 'failed' handler
      const failedCall = mockWorkerOn.mock.calls.find((c: unknown[]) => c[0] === 'failed');
      expect(failedCall).toBeDefined();
      const failedHandler = failedCall![1] as (job: Record<string, unknown>, err: Error) => void;

      const profile = WORKER_PROFILES['image:optimize'];
      const mockJob = {
        id: 'job-final',
        attemptsMade: profile.defaultJobOptions.attempts,
        opts: { attempts: profile.defaultJobOptions.attempts },
        data: { assetId: 'a1', sessionId: 's1' },
      };

      failedHandler(mockJob, new Error('test failure'));

      // Give async moveToDeadLetter.catch a tick to resolve
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockMoveToDeadLetter).toHaveBeenCalledWith(
        mockJob,
        'test failure',
        'image:optimize',
      );
    });

    it('should NOT call moveToDeadLetter when not final attempt', async () => {
      const { createWorker } = await import('../../../src/config/queue.js');
      const processor = vi.fn();

      createWorker('image:optimize', processor);

      const failedCall = mockWorkerOn.mock.calls.find((c: unknown[]) => c[0] === 'failed');
      const failedHandler = failedCall![1] as (job: Record<string, unknown>, err: Error) => void;

      const mockJob = {
        id: 'job-retry',
        attemptsMade: 1,
        opts: { attempts: 3 },
        data: { assetId: 'a1', sessionId: 's1' },
      };

      failedHandler(mockJob, new Error('retry failure'));

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockMoveToDeadLetter).not.toHaveBeenCalled();
    });
  });

  describe('withTimeout', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('should resolve when promise settles before timeout', async () => {
      const { withTimeout } = await import('../../../src/config/queue.js');
      const result = await withTimeout(Promise.resolve('ok'), 5000, 'test');
      expect(result).toBe('ok');
    });

    it('should reject with timeout error when promise exceeds timeout', async () => {
      vi.useFakeTimers();
      const { withTimeout } = await import('../../../src/config/queue.js');

      const neverResolves = new Promise<string>(() => {});
      const promise = withTimeout(neverResolves, 1000, 'slow-job');

      vi.advanceTimersByTime(1001);

      await expect(promise).rejects.toThrow('Job timeout after 1000ms: slow-job');
    });

    it('should reject with original error when promise rejects before timeout', async () => {
      const { withTimeout } = await import('../../../src/config/queue.js');
      const failing = Promise.reject(new Error('original error'));
      await expect(withTimeout(failing, 5000, 'test')).rejects.toThrow('original error');
    });
  });

  describe('queue getters', () => {
    it('should create queues with profile defaultJobOptions', async () => {
      const { getImageQueue, WORKER_PROFILES } = await import('../../../src/config/queue.js');

      getImageQueue();

      expect(MockQueue).toHaveBeenCalledWith(
        'image:optimize',
        expect.objectContaining({
          defaultJobOptions: WORKER_PROFILES['image:optimize'].defaultJobOptions,
        }),
      );
    });

    it('should return singleton queue on repeated calls', async () => {
      const { getImageQueue } = await import('../../../src/config/queue.js');

      const q1 = getImageQueue();
      const q2 = getImageQueue();

      expect(q1).toBe(q2);
    });

    it('should return a queue for all 4 types', async () => {
      const { getImageQueue, getEmailQueue, getDocQueue, getRenderQueue } =
        await import('../../../src/config/queue.js');

      // All getters should return truthy queue objects
      expect(getImageQueue()).toBeTruthy();
      expect(getEmailQueue()).toBeTruthy();
      expect(getDocQueue()).toBeTruthy();
      expect(getRenderQueue()).toBeTruthy();
    });
  });

  describe('closeQueues', () => {
    it('should close all initialized queues and the DLQ', async () => {
      const { getImageQueue, getEmailQueue, closeQueues } =
        await import('../../../src/config/queue.js');

      // Initialize two queues
      getImageQueue();
      getEmailQueue();

      await closeQueues();

      // Each queue's close() should have been called
      expect(mockQueueClose).toHaveBeenCalled();
      // DLQ close should also be called
      expect(mockCloseDLQ).toHaveBeenCalled();
    });
  });
});
