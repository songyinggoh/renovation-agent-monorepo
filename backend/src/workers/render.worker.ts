import { type Job, UnrecoverableError } from 'bullmq';
import { createWorker, type JobTypes } from '../config/queue.js';
import { createImageGenerationAdapter } from '../services/image-generation.service.js';
import { RenderService } from '../services/render.service.js';
import { emitToSession } from '../utils/socket-emitter.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'RenderWorker' });

type RenderJobData = JobTypes['render:generate'];

const renderService = new RenderService();

/**
 * Process a render generation job.
 *
 * 1. Emits `render:started` Socket.io event
 * 2. Calls the configured image generation adapter
 * 3. Persists the result via RenderService
 * 4. Emits `render:complete` or `render:failed` Socket.io event
 */
async function processRenderJob(job: Job<RenderJobData>): Promise<void> {
  const { sessionId, roomId, prompt, assetId } = job.data;

  logger.info('Processing render job', {
    jobId: job.id,
    sessionId,
    roomId,
    assetId,
    promptLength: prompt.length,
  });

  // Validate job data
  if (!sessionId || !roomId || !prompt || !assetId) {
    throw new UnrecoverableError('Invalid job data: missing required fields');
  }

  // Notify client that render generation has started
  emitToSession(sessionId, 'render:started', { assetId, roomId });

  try {
    const adapter = createImageGenerationAdapter();
    const result = await adapter.generate(prompt, {
      aspectRatio: '4:3',
      size: '1K',
    });

    // Persist render result
    await renderService.completeRender(assetId, result);

    // Notify client of completion
    emitToSession(sessionId, 'render:complete', {
      assetId,
      roomId,
      contentType: result.contentType,
      sizeBytes: result.imageBuffer.length,
      model: result.metadata.model,
    });

    logger.info('Render job completed', {
      jobId: job.id,
      assetId,
      model: result.metadata.model,
      generationTimeMs: result.metadata.generationTimeMs,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Render generation failed', error as Error, {
      jobId: job.id,
      assetId,
      sessionId,
      attempt: job.attemptsMade + 1,
    });

    // On final attempt, mark the asset as failed
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
    if (isLastAttempt) {
      await renderService.failRender(assetId, errorMessage);
      emitToSession(sessionId, 'render:failed', {
        assetId,
        roomId,
        error: 'Image generation failed after multiple attempts. Please try again.',
      });
    }

    // Re-throw for BullMQ retry
    throw error;
  }
}

/**
 * Start the render generation worker.
 * Low concurrency (1) since image generation is resource-intensive.
 */
export function startRenderWorker() {
  const worker = createWorker('render:generate', processRenderJob, 1);
  logger.info('Render worker started');
  return worker;
}
