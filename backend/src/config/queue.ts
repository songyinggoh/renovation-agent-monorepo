import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';
import { env } from './env.js';
import { Logger } from '../utils/logger.js';

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

const connection = getRedisConnection();

/**
 * Job type definitions for the renovation agent system
 */
export interface JobTypes {
  'image:optimize': { assetId: string; sessionId: string; width?: number; quality?: number };
  'ai:process-message': { sessionId: string; content: string; userId?: string };
  'doc:generate-plan': { sessionId: string; roomId: string; format: 'pdf' | 'html' };
  'email:send-notification': { to: string; subject: string; template: string; data: Record<string, unknown> };
}

export type JobName = keyof JobTypes;

/**
 * Create a typed queue for a specific job type
 */
export function createQueue<T extends JobName>(name: T): Queue<JobTypes[T]> {
  const queue = new Queue<JobTypes[T]>(name, { connection });

  queue.on('error', (err: Error) => {
    logger.error(`Queue "${name}" error`, err);
  });

  logger.info(`Queue "${name}" created`);
  return queue;
}

/**
 * Create a typed worker for a specific job type
 *
 * Registers event handlers for completed, failed, error, and stalled jobs
 * to ensure comprehensive logging and monitoring
 */
export function createWorker<T extends JobName>(
  name: T,
  processor: Processor<JobTypes[T]>,
  concurrency = 3,
): Worker<JobTypes[T]> {
  const worker = new Worker<JobTypes[T]>(name, processor, {
    connection,
    concurrency,
  });

  worker.on('completed', (job) => {
    logger.info(`Job completed`, { queue: name, jobId: job?.id });
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job failed`, err, { queue: name, jobId: job?.id });
  });

  // Issue #5 fix: Add error handler (consistent with createQueue)
  worker.on('error', (err: Error) => {
    logger.error(`Worker "${name}" error`, err, { queue: name });
  });

  // Issue #5 fix: Add stalled handler for jobs that stop processing
  worker.on('stalled', (jobId: string) => {
    logger.warn(`Job stalled`, undefined, { queue: name, jobId });
  });

  logger.info(`Worker "${name}" started`, { concurrency });
  return worker;
}

/**
 * Pre-configured queues (lazy-initialized on first access)
 */
let _imageQueue: Queue<JobTypes['image:optimize']> | null = null;
let _emailQueue: Queue<JobTypes['email:send-notification']> | null = null;

export function getImageQueue(): Queue<JobTypes['image:optimize']> {
  if (!_imageQueue) _imageQueue = createQueue('image:optimize');
  return _imageQueue;
}

export function getEmailQueue(): Queue<JobTypes['email:send-notification']> {
  if (!_emailQueue) _emailQueue = createQueue('email:send-notification');
  return _emailQueue;
}

/**
 * Close all queues and workers (call during shutdown)
 */
export async function closeQueues(): Promise<void> {
  const queues = [_imageQueue, _emailQueue].filter(Boolean);
  await Promise.allSettled(queues.map(q => q!.close()));
  logger.info('All queues closed');
}
