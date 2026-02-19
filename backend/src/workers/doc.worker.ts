import { type Job, UnrecoverableError } from 'bullmq';
import { createWorker, type JobTypes } from '../config/queue.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'DocWorker' });

type DocJobData = JobTypes['doc:generate-plan'];

const VALID_FORMATS = ['pdf', 'html'] as const;

/**
 * Process a document generation job (skeleton — no-op until Phase 3 adds Puppeteer)
 */
async function processDocJob(job: Job<DocJobData>): Promise<void> {
  const { sessionId, roomId, format } = job.data;

  // Validate job data
  if (!sessionId || typeof sessionId !== 'string') {
    throw new UnrecoverableError('Invalid job data: "sessionId" must be a string');
  }
  if (!roomId || typeof roomId !== 'string') {
    throw new UnrecoverableError('Invalid job data: "roomId" must be a string');
  }
  if (!format || !VALID_FORMATS.includes(format as typeof VALID_FORMATS[number])) {
    throw new UnrecoverableError(`Invalid job data: "format" must be one of: ${VALID_FORMATS.join(', ')}`);
  }

  logger.info('Document generation job received (no-op)', {
    jobId: job.id,
    sessionId,
    roomId,
    format,
  });

  // Phase 3: Puppeteer-based document generation will be implemented here
}

/**
 * Start the document generation worker.
 * Concurrency and timeouts derived from WORKER_PROFILES.
 */
export function startDocWorker() {
  const worker = createWorker('doc:generate-plan', processDocJob);
  logger.info('Doc worker started');
  return worker;
}
