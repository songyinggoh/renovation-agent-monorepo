import { Queue, type Job } from 'bullmq';
import { connection } from './queue.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'DeadLetterQueue' });

const DLQ_NAME = 'dead-letter';

let _dlq: Queue | null = null;

/**
 * Get the dead letter queue (lazy-initialized singleton).
 */
export function getDLQ(): Queue {
  if (!_dlq) {
    _dlq = new Queue(DLQ_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    });
    _dlq.on('error', (err: Error) => logger.error('DLQ error', err));
    logger.info('Dead letter queue created');
  }
  return _dlq;
}

/**
 * Copy a failed job's data into the dead letter queue.
 *
 * Best-effort: never throws. Logs the outcome.
 */
export async function moveToDeadLetter(
  job: Job,
  reason: string,
  sourceQueue: string,
): Promise<void> {
  try {
    const dlq = getDLQ();
    await dlq.add('dead-letter', {
      originalJobId: job.id,
      sourceQueue,
      reason,
      data: job.data,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString(),
    });
    logger.info('Job moved to DLQ', {
      jobId: job.id,
      sourceQueue,
      reason,
    });
  } catch (err) {
    logger.error('Failed to move job to DLQ', err as Error, {
      jobId: job.id,
      sourceQueue,
    });
  }
}

/**
 * Close the dead letter queue (call during shutdown).
 */
export async function closeDLQ(): Promise<void> {
  if (_dlq) {
    await _dlq.close();
    _dlq = null;
    logger.info('Dead letter queue closed');
  }
}
