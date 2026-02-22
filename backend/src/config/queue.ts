import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import { env } from './env.js';
import { Logger } from '../utils/logger.js';
import { moveToDeadLetter } from './dead-letter.js';

const logger = new Logger({ serviceName: 'Queue' });

/**
 * BullMQ Redis connection options
 *
 * Parses REDIS_URL into host/port for BullMQ (which uses ioredis internally).
 */
function getRedisConnection(): ConnectionOptions {
  const url = new URL(env.REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    ...(url.password && { password: url.password }),
    maxRetriesPerRequest: null, // BullMQ requirement
  };
}

export const connection = getRedisConnection();

/**
 * Job type definitions for the renovation agent system
 */
export interface JobTypes {
  'image:optimize': { assetId: string; sessionId: string; width?: number; quality?: number };
  'ai:process-message': { sessionId: string; content: string; userId?: string };
  'doc:generate-plan': { sessionId: string; roomId: string; format: 'pdf' | 'html' };
  'email:send-notification': { to: string; subject: string; template: string; data: { html: string } };
  // mode: determines whether to generate from scratch or edit an existing photo
  // baseImageUrl: reference image URL, required when mode is "edit_existing"
  'render:generate': { sessionId: string; roomId: string; mode: 'edit_existing' | 'from_scratch'; prompt: string; assetId: string; baseImageUrl?: string };
}

export type JobName = keyof JobTypes;

/**
 * Operational profile per worker — controls concurrency, timeouts, stall
 * detection, rate limiting, and default job options.
 */
export interface WorkerProfile {
  concurrency: number;
  lockDuration: number;       // ms — BullMQ lock, must exceed max job time
  timeoutMs: number;          // ms — app-level timeout (workers use this)
  stalledInterval: number;    // ms — how often BullMQ checks for stalled jobs
  maxStalledCount: number;    // recoveries before moving to failed
  limiter?: { max: number; duration: number };  // BullMQ rate limiter
  defaultJobOptions: {
    attempts: number;
    backoff: { type: 'exponential'; delay: number };
    removeOnComplete: number;
    removeOnFail: number;
  };
}

export const WORKER_PROFILES: Record<JobName, WorkerProfile> = {
  'image:optimize': {
    concurrency: 2,             // Sharp is memory-intensive
    lockDuration: 60_000,       // 60s
    timeoutMs: 30_000,          // 30s app timeout
    stalledInterval: 30_000,
    maxStalledCount: 1,
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 50 },
  },
  'email:send-notification': {
    concurrency: 2,             // Resend rate limits
    lockDuration: 30_000,
    timeoutMs: 15_000,
    stalledInterval: 30_000,
    maxStalledCount: 1,
    limiter: { max: 10, duration: 1000 },  // 10 emails/sec
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
  },
  'doc:generate-plan': {
    concurrency: 1,             // Puppeteer — CPU-bound, memory-heavy
    lockDuration: 180_000,      // 3min
    timeoutMs: 120_000,         // 2min app timeout
    stalledInterval: 60_000,
    maxStalledCount: 1,
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 50 },
  },
  'render:generate': {
    concurrency: 1,             // I/O-bound — Imagen API 60s+ calls
    lockDuration: 120_000,      // 2min
    timeoutMs: 90_000,          // 90s app timeout
    stalledInterval: 45_000,
    maxStalledCount: 2,         // API can be flaky, allow 2 recoveries
    limiter: { max: 5, duration: 60_000 },  // 5 renders/min
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 50 },
  },
  'ai:process-message': {
    concurrency: 3,
    lockDuration: 60_000,
    timeoutMs: 45_000,
    stalledInterval: 30_000,
    maxStalledCount: 1,
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 50 },
  },
};

/**
 * App-level timeout wrapper for long-running async operations.
 *
 * Rejects with a descriptive error if the promise doesn't settle
 * within `timeoutMs` milliseconds. Cleans up the timer on resolution.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, description: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Job timeout after ${timeoutMs}ms: ${description}`)),
      timeoutMs,
    );
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e as Error); });
  });
}

/**
 * Create a typed queue with profile-derived default job options.
 */
function createQueueWithProfile<T extends JobName>(name: T): Queue<JobTypes[T]> {
  const profile = WORKER_PROFILES[name];
  const queue = new Queue<JobTypes[T]>(name, {
    connection,
    defaultJobOptions: profile.defaultJobOptions,
  });
  queue.on('error', (err: Error) => logger.error(`Queue "${name}" error`, err));
  logger.info(`Queue "${name}" created`);
  return queue;
}

/**
 * Create a typed worker for a specific job type.
 *
 * Uses the WorkerProfile for the given job name. Accepts an optional
 * second arg: a number (backward-compat concurrency override) or a
 * partial profile to merge over the defaults.
 *
 * Registers event handlers for completed, failed, error, stalled.
 * On final failure, copies the job to the dead letter queue.
 */
export function createWorker<T extends JobName>(
  name: T,
  processor: Processor<JobTypes[T]>,
  concurrencyOrProfile?: number | Partial<WorkerProfile>,
): Worker<JobTypes[T]> {
  const base = WORKER_PROFILES[name];
  const overrides = typeof concurrencyOrProfile === 'number'
    ? { concurrency: concurrencyOrProfile }
    : concurrencyOrProfile ?? {};
  const profile = { ...base, ...overrides };

  const worker = new Worker<JobTypes[T]>(name, processor, {
    connection,
    concurrency: profile.concurrency,
    lockDuration: profile.lockDuration,
    stalledInterval: profile.stalledInterval,
    maxStalledCount: profile.maxStalledCount,
    ...(profile.limiter && { limiter: profile.limiter }),
  });

  worker.on('completed', (job) => {
    logger.info('Job completed', { queue: name, jobId: job?.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job failed', err, { queue: name, jobId: job?.id, attemptsMade: job?.attemptsMade });
    if (job && job.attemptsMade >= (job.opts.attempts ?? profile.defaultJobOptions.attempts)) {
      moveToDeadLetter(job, err.message, name).catch(() => {});
    }
  });

  worker.on('error', (err: Error) => {
    logger.error(`Worker "${name}" error`, err, { queue: name });
  });

  worker.on('stalled', (jobId: string) => {
    logger.warn('Job stalled', undefined, { queue: name, jobId });
  });

  logger.info(`Worker "${name}" started`, {
    concurrency: profile.concurrency,
    lockDuration: profile.lockDuration,
    timeoutMs: profile.timeoutMs,
    hasRateLimiter: !!profile.limiter,
  });

  return worker;
}

/**
 * Pre-configured queues (lazy-initialized on first access)
 */
let _imageQueue: Queue<JobTypes['image:optimize']> | null = null;
let _emailQueue: Queue<JobTypes['email:send-notification']> | null = null;
let _docQueue: Queue<JobTypes['doc:generate-plan']> | null = null;
let _renderQueue: Queue<JobTypes['render:generate']> | null = null;

export function getImageQueue(): Queue<JobTypes['image:optimize']> {
  if (!_imageQueue) _imageQueue = createQueueWithProfile('image:optimize');
  return _imageQueue;
}

export function getEmailQueue(): Queue<JobTypes['email:send-notification']> {
  if (!_emailQueue) _emailQueue = createQueueWithProfile('email:send-notification');
  return _emailQueue;
}

export function getDocQueue(): Queue<JobTypes['doc:generate-plan']> {
  if (!_docQueue) _docQueue = createQueueWithProfile('doc:generate-plan');
  return _docQueue;
}

export function getRenderQueue(): Queue<JobTypes['render:generate']> {
  if (!_renderQueue) _renderQueue = createQueueWithProfile('render:generate');
  return _renderQueue;
}

/**
 * Close all queues (call during shutdown).
 * Also closes the dead letter queue.
 */
export async function closeQueues(): Promise<void> {
  // Import lazily to avoid circular dependency at module load time
  const { closeDLQ } = await import('./dead-letter.js');

  const queues = [_imageQueue, _emailQueue, _docQueue, _renderQueue].filter(Boolean);
  await Promise.allSettled(queues.map(q => q!.close()));
  await closeDLQ();
  logger.info('All queues closed');
}
