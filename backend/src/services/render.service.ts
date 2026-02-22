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

/** Render mode per the Phase 3 roadmap spec (§3.1 Render service). */
export type RenderMode = 'edit_existing' | 'from_scratch';

/**
 * Input for requesting a new render.
 * - "edit_existing" + baseImageUrl: AI modifies the provided room photo.
 * - "from_scratch": AI generates a design purely from the text prompt.
 */
export interface RequestRenderInput {
  sessionId: string;
  roomId: string;
  mode: RenderMode;
  prompt: string;
  /** URL of the room photo to use as reference (required when mode is "edit_existing"). */
  baseImageUrl?: string;
}

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
   *
   * @param input.mode - "edit_existing" uses baseImageUrl as a reference photo;
   *                     "from_scratch" generates purely from the prompt.
   * @param input.baseImageUrl - Required when mode is "edit_existing".
   */
  async requestRender(input: RequestRenderInput): Promise<RequestRenderResult> {
    const { sessionId, roomId, mode, prompt, baseImageUrl } = input;

    logger.info('Requesting render', { sessionId, roomId, mode, promptLength: prompt.length });

    // Guard: edit mode requires a reference image URL
    if (mode === 'edit_existing' && !baseImageUrl) {
      throw new BadRequestError('baseImageUrl is required when mode is "edit_existing"');
    }

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

    // Create pending asset record — stores mode + baseImageUrl in metadata
    // so the worker and UI can see what was requested.
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
        mode,
        ...(baseImageUrl ? { baseImageUrl } : {}),
      },
    }).returning();

    if (!asset) {
      throw new Error('Failed to create render asset record');
    }

    // Enqueue BullMQ job — the worker picks this up asynchronously
    // and emits Socket.io events (started → progress → complete/failed).
    const queue = getRenderQueue();
    const job = await queue.add(
      'render:generate',
      {
        sessionId,
        roomId,
        mode,
        prompt,
        assetId: asset.id,
        ...(baseImageUrl ? { baseImageUrl } : {}),
      },
    );

    logger.info('Render job enqueued', {
      assetId: asset.id,
      jobId: job.id,
      sessionId,
      roomId,
      mode,
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

  /**
   * Persist which renders are "selected" for each room and their type
   * (initial vs iteration).
   *
   * For each selection:
   *  1. Validate the render asset exists, belongs to the session, and is ready.
   *  2. Tag the asset metadata with renderType + selectedRender flag.
   *  3. Write the mapping into renovation_rooms.renderUrls JSONB so that
   *     the PDF generator and UI know which render to display.
   *
   * Returns a summary of saved vs failed entries (partial success is allowed
   * so the agent can report which ones failed without losing the rest).
   */
  async saveRendersState(
    sessionId: string,
    selections: Array<{ roomId: string; assetId: string; renderType: 'initial' | 'iteration' }>
  ): Promise<{ saved: Array<{ roomId: string; assetId: string }>; errors: Array<{ roomId: string; assetId: string; reason: string }> }> {
    const saved: Array<{ roomId: string; assetId: string }> = [];
    const errors: Array<{ roomId: string; assetId: string; reason: string }> = [];

    for (const sel of selections) {
      try {
        // 1. Validate the render asset exists, is a render, belongs to session, and is ready
        const [asset] = await db
          .select()
          .from(roomAssets)
          .where(
            and(
              eq(roomAssets.id, sel.assetId),
              eq(roomAssets.sessionId, sessionId),
              eq(roomAssets.roomId, sel.roomId),
              eq(roomAssets.assetType, 'render')
            )
          );

        if (!asset) {
          errors.push({ roomId: sel.roomId, assetId: sel.assetId, reason: 'Render asset not found or does not belong to this session/room' });
          continue;
        }

        if (asset.status !== 'ready') {
          errors.push({ roomId: sel.roomId, assetId: sel.assetId, reason: `Render is not ready (status: ${asset.status})` });
          continue;
        }

        // 2. Tag the asset metadata with renderType and selectedRender flag
        await db
          .update(roomAssets)
          .set({
            metadata: sql`coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({
              renderType: sel.renderType,
              selectedRender: true,
              selectedAt: new Date().toISOString(),
            })}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(roomAssets.id, sel.assetId));

        // 3. Write/merge the selection into renovation_rooms.renderUrls JSONB.
        //    renderUrls is an array of { assetId, storagePath, renderType, selectedAt }.
        //    We append the new selection (the PDF generator picks the latest per type).
        const renderUrlEntry = {
          assetId: sel.assetId,
          storagePath: asset.storagePath,
          renderType: sel.renderType,
          selectedAt: new Date().toISOString(),
        };

        await db
          .update(renovationRooms)
          .set({
            renderUrls: sql`coalesce(render_urls, '[]'::jsonb) || ${JSON.stringify([renderUrlEntry])}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(renovationRooms.id, sel.roomId));

        saved.push({ roomId: sel.roomId, assetId: sel.assetId });

        logger.info('Render selection saved', {
          sessionId,
          roomId: sel.roomId,
          assetId: sel.assetId,
          renderType: sel.renderType,
        });
      } catch (error) {
        logger.error('Failed to save render selection', error as Error, {
          sessionId,
          roomId: sel.roomId,
          assetId: sel.assetId,
        });
        errors.push({
          roomId: sel.roomId,
          assetId: sel.assetId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { saved, errors };
  }
}
