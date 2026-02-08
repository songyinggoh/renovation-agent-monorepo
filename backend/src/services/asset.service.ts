import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  roomAssets,
  type RoomAsset,
  type AssetType,
  ASSET_TYPES,
} from '../db/schema/assets.schema.js';
import { renovationRooms } from '../db/schema/rooms.schema.js';
import { supabaseAdmin } from '../config/supabase.js';
import { env, isStorageEnabled } from '../config/env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'AssetService' });

const ALLOWED_MIME_TYPES: Record<AssetType, string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  floorplan: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  render: ['image/png', 'image/webp'],
  document: ['application/pdf'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_ASSETS_PER_ROOM = 20;
const SIGNED_URL_EXPIRY = 900; // 15 minutes

/**
 * Sanitize a filename for safe storage path usage
 */
export function sanitizeFilename(filename: string): string {
  const ext = filename.lastIndexOf('.') >= 0
    ? filename.slice(filename.lastIndexOf('.'))
    : '';
  const name = filename.slice(0, filename.lastIndexOf('.') >= 0 ? filename.lastIndexOf('.') : undefined);

  const safeName = name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^\./, '_')
    .substring(0, 80);

  return `${safeName}${ext}`.substring(0, 100);
}

/**
 * Validate that a MIME type is allowed for the given asset type
 */
export function validateFileType(contentType: string, assetType: AssetType): boolean {
  const allowed = ALLOWED_MIME_TYPES[assetType];
  return allowed ? allowed.includes(contentType) : false;
}

/**
 * Validate file size is within limits
 */
export function validateFileSize(fileSize: number): boolean {
  return fileSize > 0 && fileSize <= MAX_FILE_SIZE;
}

/**
 * Build storage path for a file
 */
export function buildStoragePath(
  sessionId: string,
  roomId: string,
  assetType: AssetType,
  filename: string
): string {
  const safeFilename = sanitizeFilename(filename);
  return `session_${sessionId}/room_${roomId}/${assetType}s/${Date.now()}_${safeFilename}`;
}

interface RequestUploadParams {
  roomId: string;
  sessionId: string;
  filename: string;
  contentType: string;
  fileSize: number;
  assetType: AssetType;
  uploadedBy?: string;
}

interface RequestUploadResult {
  assetId: string;
  signedUrl: string;
  token: string;
  storagePath: string;
  expiresAt: string;
}

/**
 * Service for managing room assets and file uploads
 */
export class AssetService {
  /**
   * Request a signed upload URL and create a pending asset record
   */
  async requestUpload(params: RequestUploadParams): Promise<RequestUploadResult> {
    const { roomId, sessionId, filename, contentType, fileSize, assetType, uploadedBy } = params;

    logger.info('Requesting upload', { roomId, sessionId, assetType, contentType, fileSize });

    // Validate asset type
    if (!ASSET_TYPES.includes(assetType)) {
      throw new Error(`Invalid asset type: ${assetType}. Must be one of: ${ASSET_TYPES.join(', ')}`);
    }

    // Validate file type
    if (!validateFileType(contentType, assetType)) {
      const allowed = ALLOWED_MIME_TYPES[assetType];
      throw new Error(`Invalid file type: ${contentType}. Allowed for ${assetType}: ${allowed.join(', ')}`);
    }

    // Validate file size
    if (!validateFileSize(fileSize)) {
      throw new Error(`Invalid file size: ${fileSize} bytes. Maximum: ${MAX_FILE_SIZE} bytes (10 MB)`);
    }

    // Check room exists
    const [room] = await db
      .select()
      .from(renovationRooms)
      .where(eq(renovationRooms.id, roomId));

    if (!room) {
      throw new Error(`Room not found: ${roomId}`);
    }

    // Check asset count limit
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(roomAssets)
      .where(eq(roomAssets.roomId, roomId));

    if (countResult && countResult.count >= MAX_ASSETS_PER_ROOM) {
      throw new Error(`Maximum assets per room reached (${MAX_ASSETS_PER_ROOM})`);
    }

    // Build storage path
    const storagePath = buildStoragePath(sessionId, roomId, assetType, filename);
    const bucketName = env.SUPABASE_STORAGE_BUCKET;

    // Create pending asset record
    const [asset] = await db.insert(roomAssets).values({
      sessionId,
      roomId,
      assetType,
      storagePath,
      source: 'user_upload',
      status: 'pending',
      originalFilename: sanitizeFilename(filename),
      contentType,
      fileSize,
      uploadedBy: uploadedBy ?? null,
    }).returning();

    if (!asset) {
      throw new Error('Failed to create asset record');
    }

    // Generate signed upload URL
    if (!isStorageEnabled() || !supabaseAdmin) {
      logger.warn('Storage not configured, returning mock signed URL', undefined, { assetId: asset.id });
      return {
        assetId: asset.id,
        signedUrl: `mock://storage/${bucketName}/${storagePath}`,
        token: 'mock-token',
        storagePath,
        expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY * 1000).toISOString(),
      };
    }

    const { data, error } = await supabaseAdmin.storage
      .from(bucketName)
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      // Clean up the pending record
      await db.delete(roomAssets).where(eq(roomAssets.id, asset.id));
      throw new Error(`Failed to generate signed upload URL: ${error?.message ?? 'Unknown error'}`);
    }

    logger.info('Upload URL generated', {
      assetId: asset.id,
      storagePath,
      bucketName,
    });

    return {
      assetId: asset.id,
      signedUrl: data.signedUrl,
      token: data.token,
      storagePath,
      expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY * 1000).toISOString(),
    };
  }

  /**
   * Confirm that a file was uploaded successfully
   */
  async confirmUpload(assetId: string): Promise<RoomAsset> {
    logger.info('Confirming upload', { assetId });

    const [asset] = await db
      .select()
      .from(roomAssets)
      .where(eq(roomAssets.id, assetId));

    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    if (asset.status !== 'pending') {
      throw new Error(`Asset is not pending upload: ${asset.status}`);
    }

    // Verify file exists in storage (if storage is configured)
    if (isStorageEnabled() && supabaseAdmin) {
      const bucketName = env.SUPABASE_STORAGE_BUCKET;
      const pathParts = asset.storagePath.split('/');
      const folder = pathParts.slice(0, -1).join('/');
      const filename = pathParts[pathParts.length - 1];

      const { data: files, error } = await supabaseAdmin.storage
        .from(bucketName)
        .list(folder, { search: filename });

      if (error || !files || files.length === 0) {
        throw new Error(`File not found in storage: ${asset.storagePath}`);
      }
    }

    const [updated] = await db
      .update(roomAssets)
      .set({ status: 'uploaded', updatedAt: new Date() })
      .where(eq(roomAssets.id, assetId))
      .returning();

    if (!updated) {
      throw new Error(`Failed to update asset: ${assetId}`);
    }

    logger.info('Upload confirmed', { assetId, storagePath: updated.storagePath });
    return updated;
  }

  /**
   * Get all assets for a room
   */
  async getAssetsByRoom(roomId: string): Promise<RoomAsset[]> {
    logger.info('Fetching assets for room', { roomId });

    const assets = await db
      .select()
      .from(roomAssets)
      .where(eq(roomAssets.roomId, roomId))
      .orderBy(roomAssets.displayOrder, roomAssets.createdAt);

    logger.info('Assets fetched', { roomId, count: assets.length });
    return assets;
  }

  /**
   * Get a single asset by ID
   */
  async getAssetById(assetId: string): Promise<RoomAsset | null> {
    const [asset] = await db
      .select()
      .from(roomAssets)
      .where(eq(roomAssets.id, assetId));

    return asset ?? null;
  }

  /**
   * Get all assets for a session (across all rooms)
   */
  async getAssetsBySession(sessionId: string): Promise<RoomAsset[]> {
    logger.info('Fetching assets for session', { sessionId });

    const assets = await db
      .select()
      .from(roomAssets)
      .where(eq(roomAssets.sessionId, sessionId))
      .orderBy(roomAssets.roomId, roomAssets.displayOrder);

    return assets;
  }

  /**
   * Delete an asset and remove from storage
   */
  async deleteAsset(assetId: string): Promise<void> {
    logger.info('Deleting asset', { assetId });

    const [asset] = await db
      .select()
      .from(roomAssets)
      .where(eq(roomAssets.id, assetId));

    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    // Remove from storage
    if (isStorageEnabled() && supabaseAdmin) {
      const bucketName = env.SUPABASE_STORAGE_BUCKET;
      const { error } = await supabaseAdmin.storage
        .from(bucketName)
        .remove([asset.storagePath]);

      if (error) {
        logger.warn('Failed to remove file from storage', undefined, {
          assetId,
          storagePath: asset.storagePath,
          storageError: error.message,
        });
      }
    }

    // Remove from database
    await db.delete(roomAssets).where(eq(roomAssets.id, assetId));
    logger.info('Asset deleted', { assetId, storagePath: asset.storagePath });
  }

  /**
   * Generate a signed download URL for an asset
   */
  async getSignedUrl(assetId: string, expiresIn = 3600): Promise<string | null> {
    const [asset] = await db
      .select()
      .from(roomAssets)
      .where(eq(roomAssets.id, assetId));

    if (!asset) return null;

    if (!isStorageEnabled() || !supabaseAdmin) {
      return `mock://storage/${env.SUPABASE_STORAGE_BUCKET}/${asset.storagePath}`;
    }

    const { data, error } = await supabaseAdmin.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .createSignedUrl(asset.storagePath, expiresIn);

    if (error || !data) {
      logger.error('Failed to generate signed URL', new Error(error?.message ?? 'Unknown'), { assetId });
      return null;
    }

    return data.signedUrl;
  }
}
