import { type Job, UnrecoverableError } from 'bullmq';
import { createWorker, withTimeout, WORKER_PROFILES, type JobTypes } from '../config/queue.js';
import { emitToSession } from '../utils/socket-emitter.js';
import { Logger } from '../utils/logger.js';
import { docGeneratePlanJobSchema } from '../validators/job.validators.js';
import { DocumentService } from '../services/document.service.js';

const logger = new Logger({ serviceName: 'DocWorker' });

type DocJobData = JobTypes['doc:generate-plan'];

const LOCK_EXTEND_INTERVAL_MS = 20_000;

/** Singleton DocumentService instance -- reuses browser pool across jobs.
 *  Exported so server.ts can call documentService.close() during graceful shutdown
 *  to kill the Chromium subprocess. */
export const documentService = new DocumentService();

/**
 * Classify Puppeteer errors into permanent (UnrecoverableError) vs retryable.
 * Permanent errors will NOT be retried by BullMQ.
 */
function classifyPuppeteerError(err: Error): never {
  const msg = err.message;

  // Permanent errors -- do not retry
  if (
    msg.includes('ProtocolError') ||
    msg.includes('Target closed') ||
    msg.includes('Session closed') ||
    msg.includes('Page crashed') ||
    msg.includes('No plan data found') ||
    msg.includes('Session not found') ||
    msg.includes('No rooms found') ||
    msg.includes('PDF generation is disabled') ||
    msg.includes('JSONB validation failed')
  ) {
    throw new UnrecoverableError(`Permanent document generation error: ${msg}`);
  }

  // Retryable errors -- let BullMQ retry with exponential backoff
  throw err;
}

/**
 * Process a document generation job.
 *
 * 1. Validate job data
 * 2. Emit doc:generation_started
 * 3. Start proactive lock extension (every 20s)
 * 4. Call DocumentService.generateChecklist or generatePlan
 * 5. Emit doc:generation_complete with result
 * 6. Classify errors on failure
 */
async function processDocJob(job: Job<DocJobData>): Promise<void> {
  // Validate job data
  const parsed = docGeneratePlanJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError(
      `Invalid job data: ${parsed.error.issues.map(i => i.message).join(', ')}`
    );
  }

  const { sessionId, documentType, roomId } = parsed.data;

  logger.info('Document generation job started', {
    jobId: job.id,
    sessionId,
    documentType,
    roomId,
  });

  // Emit started event
  emitToSession(sessionId, 'doc:generation_started', {
    sessionId,
    documentType,
    roomId,
    jobId: job.id,
  });

  // Proactive lock extension to prevent BullMQ stall detection
  // during long-running Puppeteer page.pdf() calls
  const lockExtender = setInterval(async () => {
    try {
      if (job.token) {
        await job.extendLock(job.token, LOCK_EXTEND_INTERVAL_MS);
      }
    } catch (err) {
      logger.warn('Failed to extend doc job lock', err as Error, { jobId: job.id });
    }
  }, LOCK_EXTEND_INTERVAL_MS);

  try {
    const timeoutMs = WORKER_PROFILES['doc:generate-plan'].timeoutMs;

    let result: { documentId: string; storagePath: string };

    if (documentType === 'checklist_pdf') {
      result = await withTimeout(
        documentService.generateChecklist(sessionId, roomId),
        timeoutMs,
        `checklist PDF for session ${sessionId}`
      );
    } else if (documentType === 'plan_pdf' || documentType === 'plan') {
      result = await withTimeout(
        documentService.generatePlan(sessionId),
        timeoutMs,
        `plan PDF for session ${sessionId}`
      );
    } else {
      throw new UnrecoverableError(`Unsupported document type: ${documentType}`);
    }

    // Emit completion event
    emitToSession(sessionId, 'doc:generation_complete', {
      sessionId,
      documentType,
      roomId,
      documentId: result.documentId,
      storagePath: result.storagePath,
    });

    logger.info('Document generation job completed', {
      jobId: job.id,
      sessionId,
      documentType,
      documentId: result.documentId,
    });
  } catch (err) {
    // Emit failure event
    emitToSession(sessionId, 'doc:generation_failed', {
      sessionId,
      documentType,
      roomId,
      error: err instanceof Error ? err.message : 'Unknown error',
    });

    logger.error('Document generation job failed', err as Error, {
      jobId: job.id,
      sessionId,
      documentType,
    });

    classifyPuppeteerError(err as Error);
  } finally {
    clearInterval(lockExtender);
  }
}

/**
 * Start the document generation worker.
 * Uses WORKER_PROFILES['doc:generate-plan'] for concurrency, lock duration, rate limiting.
 */
export function startDocWorker() {
  const worker = createWorker('doc:generate-plan', processDocJob);
  logger.info('Doc worker started');
  return worker;
}
