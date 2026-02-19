import { type Job, UnrecoverableError } from 'bullmq';
import sharp from 'sharp';
import { createWorker, type JobTypes } from '../config/queue.js';
import { Logger } from '../utils/logger.js';
import { isStorageEnabled, env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { db } from '../db/index.js';
import { assetVariants } from '../db/schema/asset-variants.schema.js';
import { roomAssets } from '../db/schema/assets.schema.js';
import { eq } from 'drizzle-orm';
import { emitToSession } from '../utils/socket-emitter.js';

const logger = new Logger({ serviceName: 'ImageWorker' });

type ImageJobData = JobTypes['image:optimize'];

interface VariantConfig {
  variantType: string;
  format: 'jpeg' | 'webp';
  maxWidth: number;
  maxHeight?: number;
  quality: number;
  contentType: string;
}

const VARIANT_CONFIGS: VariantConfig[] = [
  {
    variantType: 'thumbnail',
    format: 'jpeg',
    maxWidth: 300,
    maxHeight: 200,
    quality: 75,
    contentType: 'image/jpeg',
  },
  {
    variantType: 'optimized',
    format: 'jpeg',
    maxWidth: 1200,
    quality: 80,
    contentType: 'image/jpeg',
  },
  {
    variantType: 'webp',
    format: 'webp',
    maxWidth: 1200,
    quality: 82,
    contentType: 'image/webp',
  },
];

const SUPPORTED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function processImageJob(job: Job<ImageJobData>): Promise<void> {
  const { assetId, sessionId } = job.data;

  // Validate job data
  if (!assetId || typeof assetId !== 'string') {
    throw new UnrecoverableError('Invalid job data: "assetId" must be a string');
  }
  if (!sessionId || typeof sessionId !== 'string') {
    throw new UnrecoverableError('Invalid job data: "sessionId" must be a string');
  }

  // Storage guard — skip when Supabase Storage not configured
  if (!isStorageEnabled() || !supabaseAdmin) {
    logger.warn('Image optimization skipped — storage not configured', undefined, { assetId });
    return;
  }

  logger.info('Processing image optimization job', { jobId: job.id, assetId, sessionId });

  // Load asset record
  const [asset] = await db.select().from(roomAssets).where(eq(roomAssets.id, assetId));
  if (!asset) {
    throw new UnrecoverableError(`Asset not found: ${assetId}`);
  }
  if (asset.assetType !== 'photo') {
    throw new UnrecoverableError(`Asset is not a photo (type: ${asset.assetType}): ${assetId}`);
  }
  if (!SUPPORTED_CONTENT_TYPES.includes(asset.contentType ?? '')) {
    throw new UnrecoverableError(`Unsupported content type: ${asset.contentType}`);
  }

  // Download original from storage
  const { data: downloadData, error: downloadError } = await supabaseAdmin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .download(asset.storagePath);

  if (downloadError || !downloadData) {
    throw new Error(`Failed to download asset from storage: ${downloadError?.message ?? 'unknown'}`);
  }

  const originalBuffer = Buffer.from(await downloadData.arrayBuffer());
  const variantCount = VARIANT_CONFIGS.length;

  // Emit initial progress
  emitToSession(sessionId, 'asset:processing_progress', {
    assetId,
    status: 'processing',
    progress: 0,
  });

  // Process each variant with per-variant error isolation
  for (let i = 0; i < VARIANT_CONFIGS.length; i++) {
    const config = VARIANT_CONFIGS[i]!;
    const progress = Math.round(((i + 1) / variantCount) * 100);

    try {
      let sharpInstance = sharp(originalBuffer);

      // Resize
      if (config.maxHeight) {
        sharpInstance = sharpInstance.resize(config.maxWidth, config.maxHeight, { fit: 'cover' });
      } else {
        sharpInstance = sharpInstance.resize(config.maxWidth, undefined, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Format conversion
      let outputBuffer: Buffer;
      if (config.format === 'webp') {
        outputBuffer = await sharpInstance.webp({ quality: config.quality }).toBuffer();
      } else {
        outputBuffer = await sharpInstance.jpeg({ quality: config.quality }).toBuffer();
      }

      // Build storage path
      const ext = config.format === 'webp' ? 'webp' : 'jpg';
      const variantPath = asset.storagePath.replace(/\.[^.]+$/, `_${config.variantType}.${ext}`);

      // Upload variant
      const { error: uploadError } = await supabaseAdmin.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .upload(variantPath, outputBuffer, {
          contentType: config.contentType,
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Insert/update variant record
      await db
        .insert(assetVariants)
        .values({
          parentAssetId: assetId,
          variantType: config.variantType,
          format: config.format,
          quality: config.quality,
          storagePath: variantPath,
          contentType: config.contentType,
          fileSize: outputBuffer.length,
          processingStatus: 'ready',
          processedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [assetVariants.parentAssetId, assetVariants.variantType],
          set: {
            storagePath: variantPath,
            fileSize: outputBuffer.length,
            processingStatus: 'ready',
            processedAt: new Date(),
          },
        });

      logger.info('Variant created', { assetId, variantType: config.variantType });

      // Emit per-variant progress
      emitToSession(sessionId, 'asset:processing_progress', {
        assetId,
        variantType: config.variantType,
        status: 'ready',
        progress,
      });
    } catch (variantError) {
      // Per-variant isolation — log but continue with other variants
      logger.error(
        `Variant "${config.variantType}" failed`,
        variantError as Error,
        { assetId, variantType: config.variantType }
      );

      emitToSession(sessionId, 'asset:processing_progress', {
        assetId,
        variantType: config.variantType,
        status: 'failed',
        progress,
      });
    }
  }

  logger.info('Image optimization complete', { jobId: job.id, assetId });
}

/**
 * Start the image optimization worker.
 * Concurrency and timeouts derived from WORKER_PROFILES.
 */
export function startImageWorker() {
  const worker = createWorker('image:optimize', processImageJob);
  logger.info('Image worker started');
  return worker;
}
