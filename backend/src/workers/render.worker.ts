import { type Job, UnrecoverableError } from 'bullmq';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { createWorker, WORKER_PROFILES, withTimeout, type JobTypes } from '../config/queue.js';
import { createImageGenerationAdapter } from '../services/image-generation.service.js';
import { RenderService } from '../services/render.service.js';
import { emitToSession } from '../utils/socket-emitter.js';
import { Logger } from '../utils/logger.js';
import { renderGenerateJobSchema } from '../validators/job.validators.js';

const logger = new Logger({ serviceName: 'RenderWorker' });

type RenderJobData = JobTypes['render:generate'];

const renderService = new RenderService();

const PERMANENT_ERROR_PATTERNS = [
  'safety filters',
  'content policy',
  'prompt was blocked',
  'invalid prompt',
  'moderation',
  'blocked by safety',
  'harmful content',
];

function isPermanentError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return PERMANENT_ERROR_PATTERNS.some(p => lower.includes(p));
}

const tracer = trace.getTracer('render-worker');

/** Max size for reference image downloads (10 MB). Prevents OOM on malicious URLs. */
const MAX_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Fetch a reference image from a URL and return it as base64.
 * Used in "edit_existing" mode so the AI adapter can modify the photo.
 * Returns undefined on failure (non-fatal — worker falls back to from-scratch).
 */
async function fetchReferenceImage(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn('Failed to fetch reference image', undefined, { url, status: response.status });
      return undefined;
    }

    const arrayBuffer = await response.arrayBuffer();

    // Guard against oversized images to prevent OOM in the worker
    if (arrayBuffer.byteLength > MAX_REFERENCE_IMAGE_BYTES) {
      logger.warn('Reference image too large, skipping', undefined, {
        url,
        sizeBytes: arrayBuffer.byteLength,
        maxBytes: MAX_REFERENCE_IMAGE_BYTES,
      });
      return undefined;
    }

    return Buffer.from(arrayBuffer).toString('base64');
  } catch (error) {
    logger.warn('Error fetching reference image', undefined, {
      url,
      error: (error as Error).message,
    });
    return undefined;
  }
}

/**
 * Process a render generation job.
 *
 * 1. Emits `render:started` + progress events
 * 2. Optionally loads a reference image for edit-mode renders
 * 3. Calls the configured image generation adapter
 * 4. Persists the result via RenderService (with upload timeout)
 * 5. Emits `render:complete` or `render:failed` Socket.io event
 */
async function processRenderJob(job: Job<RenderJobData>): Promise<void> {
  // Validate job data with Zod schema
  const parsed = renderGenerateJobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError(`Invalid job data: ${parsed.error.issues.map(i => i.message).join(', ')}`);
  }
  const { sessionId, roomId, mode, prompt, assetId, baseImageUrl } = parsed.data;

  await tracer.startActiveSpan('job:render:generate', async (span) => {
    span.setAttributes({
      'job.id': job.id ?? '',
      'render.session_id': sessionId,
      'render.room_id': roomId,
      'render.asset_id': assetId,
      'render.mode': mode,
      ...(baseImageUrl ? { 'render.base_image_url': baseImageUrl } : {}),
    });

    logger.info('Processing render job', {
      jobId: job.id,
      sessionId,
      roomId,
      assetId,
      mode,
      promptLength: prompt.length,
    });

    // Notify client that render generation has started
    emitToSession(sessionId, 'render:started', { assetId, roomId, sessionId });
    emitToSession(sessionId, 'render:progress', { assetId, roomId, sessionId, progress: 0, stage: 'generating' });

    try {
      const adapter = createImageGenerationAdapter();
      const profile = WORKER_PROFILES['render:generate'];

      // In "edit_existing" mode, fetch the reference photo from its URL
      // so the AI adapter can use it as a base for modifications.
      // Falls back gracefully (undefined) if the fetch fails.
      let referenceImageBase64: string | undefined;
      if (mode === 'edit_existing' && baseImageUrl) {
        referenceImageBase64 = await fetchReferenceImage(baseImageUrl);
      }

      span.setAttribute('ai.provider', adapter.providerName);

      const genStart = Date.now();
      const result = await tracer.startActiveSpan('ai.image.generate', async (aiSpan) => {
        aiSpan.setAttributes({
          'ai.provider': adapter.providerName,
          'ai.prompt_length': prompt.length,
        });
        try {
          const res = await withTimeout(
            adapter.generate(prompt, {
              aspectRatio: '4:3',
              size: '1K',
              ...(referenceImageBase64 ? { referenceImageBase64 } : {}),
            }),
            profile.timeoutMs,
            `render:generate job ${job.id}`,
          );
          aiSpan.setAttributes({
            'ai.response.size_bytes': res.imageBuffer.length,
            'ai.model': res.metadata.model,
          });
          aiSpan.setStatus({ code: SpanStatusCode.OK });
          return res;
        } catch (err) {
          aiSpan.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
          throw err;
        } finally {
          aiSpan.end();
        }
      });

      const generationTimeMs = Date.now() - genStart;
      span.setAttribute('render.generation_time_ms', generationTimeMs);
      span.setAttribute('ai.response.size_bytes', result.imageBuffer.length);

      emitToSession(sessionId, 'render:progress', { assetId, roomId, sessionId, progress: 70, stage: 'uploading' });

      // Persist render result (with 20s upload timeout)
      await withTimeout(
        renderService.completeRender(assetId, result),
        20_000,
        `completeRender ${assetId}`,
      );

      emitToSession(sessionId, 'render:progress', { assetId, roomId, sessionId, progress: 95, stage: 'finalizing' });

      // Notify client of completion
      emitToSession(sessionId, 'render:complete', {
        assetId,
        roomId,
        sessionId,
        contentType: result.contentType,
        sizeBytes: result.imageBuffer.length,
        model: result.metadata.model,
      });

      logger.info('Render job completed', {
        jobId: job.id,
        assetId,
        model: result.metadata.model,
        generationTimeMs,
      });

      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
      span.recordException(error as Error);

      logger.error('Render generation failed', error as Error, {
        jobId: job.id,
        assetId,
        sessionId,
        attempt: job.attemptsMade + 1,
      });

      // Content policy errors should not be retried
      if (isPermanentError(errorMessage)) {
        await renderService.failRender(assetId, errorMessage);
        emitToSession(sessionId, 'render:failed', {
          assetId,
          roomId,
          sessionId,
          error: 'Image generation was blocked by content policy. Please revise your prompt.',
        });
        span.end();
        throw new UnrecoverableError(errorMessage);
      }

      // On final attempt, mark the asset as failed
      const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
      if (isLastAttempt) {
        await renderService.failRender(assetId, errorMessage);
        emitToSession(sessionId, 'render:failed', {
          assetId,
          roomId,
          sessionId,
          error: 'Image generation failed after multiple attempts. Please try again.',
        });
      }

      // Re-throw for BullMQ retry
      span.end();
      throw error;
    }

    span.end();
  });
}

/**
 * Start the render generation worker.
 * Concurrency and timeouts derived from WORKER_PROFILES.
 */
export function startRenderWorker() {
  const worker = createWorker('render:generate', processRenderJob);
  logger.info('Render worker started');
  return worker;
}
