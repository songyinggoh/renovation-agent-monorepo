import { eq, and, gte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { roomAssets, type RoomAsset } from '../db/schema/assets.schema.js';
import { renovationRooms } from '../db/schema/rooms.schema.js';
import { getRenderQueue } from '../config/queue.js';
import { env, isStorageEnabled } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { buildStoragePath } from './asset.service.js';
import { Logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import type { ImageGenerationResult } from './image-generation.service.js';

const logger = new Logger({ serviceName: 'RenderService' });

const MAX_RENDERS_PER_HOUR = 10;

interface RequestRenderResult {
  assetId: string;
  jobId: string;
}

/**
 * Orchestrator service for AI room renders.
 * Enqueues BullMQ jobs, persists render records as room_assets,
 * and manages render lifecycle (processing -> ready | failed).
 */
export class RenderService {
  /**
   * Request an AI render for a room.
   * Creates a pending asset record and enqueues a BullMQ job.
   */
  async requestRender(
    sessionId: string,
    roomId: string,
    prompt: string,
    baseAssetId?: string
  ): Promise<RequestRenderResult> {
    logger.info('Requesting render', { sessionId, roomId, promptLength: prompt.length });

    // Validate room exists
    const [room] = await db
      .select()
      .from(renovationRooms)
      .where(eq(renovationRooms.id, roomId));

    if (!room) {
      throw new NotFoundError(`Room not found: ${roomId}`);
    }

    // Rate limit: max renders per session per hour
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(roomAssets)
      .where(
        and(
          eq(roomAssets.sessionId, sessionId),
          eq(roomAssets.assetType, 'render'),
          gte(roomAssets.createdAt, new Date(Date.now() - 3600_000))
        )
      );

    if (countResult && countResult.count >= MAX_RENDERS_PER_HOUR) {
      throw new BadRequestError(`Render limit reached (${MAX_RENDERS_PER_HOUR}/hour). Please wait before requesting more renders.`);
    }

    // Build storage path for the render output
    const filename = `render_${Date.now()}.png`;
    const storagePath = buildStoragePath(sessionId, roomId, 'render', filename);

    // Create pending asset record
    const [asset] = await db.insert(roomAssets).values({
      sessionId,
      roomId,
      assetType: 'render',
      storagePath,
      source: 'ai_generated',
      status: 'processing',
      originalFilename: filename,
      contentType: 'image/png',
      fileSize: 0, // Updated when render completes
      metadata: {
        prompt,
        ...(baseAssetId ? { baseAssetId } : {}),
      },
    }).returning();

    if (!asset) {
      throw new Error('Failed to create render asset record');
    }

    // Enqueue BullMQ job
    const queue = getRenderQueue();
    const job = await queue.add(
      'render:generate',
      {
        sessionId,
        roomId,
        prompt,
        assetId: asset.id,
        ...(baseAssetId ? { baseAssetId } : {}),
      },
    );

    logger.info('Render job enqueued', {
      assetId: asset.id,
      jobId: job.id,
      sessionId,
      roomId,
    });

    return {
      assetId: asset.id,
      jobId: job.id ?? asset.id,
    };
  }

  /**
   * Complete a render: upload image to storage and update the asset record.
   */
  async completeRender(
    assetId: string,
    result: ImageGenerationResult
  ): Promise<RoomAsset> {
    logger.info('Completing render', { assetId, contentType: result.contentType });

    const [asset] = await db
      .select()
      .from(roomAssets)
      .where(eq(roomAssets.id, assetId));

    if (!asset) {
      throw new NotFoundError(`Render asset not found: ${assetId}`);
    }

    // Upload to Supabase Storage if configured
    if (isStorageEnabled() && supabaseAdmin) {
      const { error } = await supabaseAdmin.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .upload(asset.storagePath, result.imageBuffer, {
          contentType: result.contentType,
          upsert: true,
        });

      if (error) {
        logger.error('Failed to upload render to storage', new Error(error.message), { assetId });
        throw new Error(`Storage upload failed: ${error.message}`);
      }
    } else {
      logger.warn('Storage not configured — render saved to DB record only', undefined, { assetId });
    }

    // Update asset record
    const [updated] = await db
      .update(roomAssets)
      .set({
        status: 'ready',
        contentType: result.contentType,
        fileSize: result.imageBuffer.length,
        metadata: {
          ...(asset.metadata as Record<string, unknown> ?? {}),
          generationModel: result.metadata.model,
          generationTimeMs: result.metadata.generationTimeMs,
          ...(result.metadata.seed !== undefined ? { seed: result.metadata.seed } : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(roomAssets.id, assetId))
      .returning();

    if (!updated) {
      throw new Error(`Failed to update render asset: ${assetId}`);
    }

    logger.info('Render completed', {
      assetId,
      sizeBytes: result.imageBuffer.length,
      model: result.metadata.model,
    });

    return updated;
  }

  /**
   * Mark a render as failed with an error message.
   */
  async failRender(assetId: string, error: string): Promise<void> {
    logger.warn('Marking render as failed', undefined, { assetId, error });

    await db
      .update(roomAssets)
      .set({
        status: 'failed',
        metadata: sql`coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({ error })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(roomAssets.id, assetId));
  }

  /**
   * Update approval status on a render asset.
   */
  async updateApproval(assetId: string, approvalStatus: 'approved' | 'rejected'): Promise<void> {
    const [asset] = await db
      .select()
      .from(roomAssets)
      .where(eq(roomAssets.id, assetId));

    if (!asset) {
      throw new NotFoundError(`Render asset not found: ${assetId}`);
    }

    await db
      .update(roomAssets)
      .set({
        metadata: sql`coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({ approvalStatus })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(roomAssets.id, assetId));

    logger.info('Render approval updated', { assetId, approvalStatus });
  }

  /**
   * Get all renders for a room, ordered by creation time.
   */
  async getRenders(roomId: string): Promise<RoomAsset[]> {
    return db
      .select()
      .from(roomAssets)
      .where(
        and(
          eq(roomAssets.roomId, roomId),
          eq(roomAssets.assetType, 'render')
        )
      )
      .orderBy(roomAssets.createdAt);
  }
}
