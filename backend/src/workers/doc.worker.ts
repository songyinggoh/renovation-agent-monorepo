import { type Job, UnrecoverableError } from 'bullmq';
import { createWorker, type JobTypes } from '../config/queue.js';
import { Logger } from '../utils/logger.js';
import { docGeneratePlanJobSchema } from '../validators/job.validators.js';

const logger = new Logger({ serviceName: 'DocWorker' });

type DocJobData = JobTypes['doc:generate-plan'];

/**
 * Process a document generation job (skeleton — no-op until Phase 3 adds Puppeteer)
 */
async function processDocJob(job: Job<DocJobData>): Promise<void> {
  // Validate job data with Zod schema
  const parsed = docGeneratePlanJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError(`Invalid job data: ${parsed.error.issues.map(i => i.message).join(', ')}`);
  }
  const { sessionId, roomId, format } = parsed.data;

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
