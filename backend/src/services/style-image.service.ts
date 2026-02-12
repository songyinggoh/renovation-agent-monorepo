import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { styleImages, type StyleImage } from '../db/schema/style-images.schema.js';
import { styleCatalog } from '../db/schema/styles.schema.js';
import { supabaseAdmin } from '../config/supabase.js';
import { env, isStorageEnabled } from '../config/env.js';
import { Logger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';

const logger = new Logger({ serviceName: 'StyleImageService' });

/**
 * Build public URL for a style image in Supabase Storage.
 * Public buckets serve files without authentication.
 */
function buildPublicUrl(storagePath: string): string {
  if (!env.SUPABASE_URL) {
    return `mock://storage/${env.SUPABASE_STYLE_BUCKET}/${storagePath}`;
  }
  return `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_STYLE_BUCKET}/${storagePath}`;
}

/**
 * Build storage path for a style image
 */
function buildStoragePath(styleSlug: string, filename: string): string {
  return `styles/${styleSlug}/${filename}`;
}

export interface StyleImageWithUrl extends StyleImage {
  publicUrl: string;
}

export interface SeedImageEntry {
  url: string;
  filename: string;
  roomType: string;
  caption: string;
  altText: string;
  tags: string[];
}

export interface SeedStyleManifest {
  styleSlug: string;
  images: SeedImageEntry[];
}

/**
 * Service for managing style moodboard images
 */
export class StyleImageService {
  /**
   * Get all images for a style by style ID
   */
  async getImagesByStyle(styleId: string): Promise<StyleImageWithUrl[]> {
    logger.info('Fetching images for style', { styleId });

    const images = await db
      .select()
      .from(styleImages)
      .where(eq(styleImages.styleId, styleId))
      .orderBy(styleImages.displayOrder, styleImages.createdAt);

    return images.map((img) => ({
      ...img,
      publicUrl: buildPublicUrl(img.storagePath),
    }));
  }

  /**
   * Get all images for a style by slug (convenience method)
   */
  async getImagesBySlug(slug: string): Promise<StyleImageWithUrl[]> {
    logger.info('Fetching images for style slug', { slug });

    const [style] = await db
      .select()
      .from(styleCatalog)
      .where(eq(styleCatalog.slug, slug));

    if (!style) {
      throw new NotFoundError(`Style not found: ${slug}`);
    }

    return this.getImagesByStyle(style.id);
  }

  /**
   * Get all images for a style filtered by room type
   */
  async getImagesByStyleAndRoom(styleId: string, roomType: string): Promise<StyleImageWithUrl[]> {
    const images = await db
      .select()
      .from(styleImages)
      .where(and(eq(styleImages.styleId, styleId), eq(styleImages.roomType, roomType)))
      .orderBy(styleImages.displayOrder);

    return images.map((img) => ({
      ...img,
      publicUrl: buildPublicUrl(img.storagePath),
    }));
  }

  /**
   * Get public URL for a storage path
   */
  getPublicUrl(storagePath: string): string {
    return buildPublicUrl(storagePath);
  }

  /**
   * Upload a single image to Supabase Storage and create DB record
   */
  async uploadImage(
    styleId: string,
    styleSlug: string,
    imageBuffer: Buffer,
    entry: SeedImageEntry
  ): Promise<StyleImage> {
    const storagePath = buildStoragePath(styleSlug, entry.filename);
    const bucketName = env.SUPABASE_STYLE_BUCKET;

    // Upload to Supabase Storage if configured
    if (isStorageEnabled() && supabaseAdmin) {
      const { error } = await supabaseAdmin.storage
        .from(bucketName)
        .upload(storagePath, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) {
        throw new Error(`Failed to upload style image: ${error.message}`);
      }

      logger.info('Image uploaded to storage', { storagePath, bucketName });
    } else {
      logger.warn('Storage not configured, skipping upload', undefined, { storagePath });
    }

    // Insert DB record (upsert on storage_path)
    const [image] = await db
      .insert(styleImages)
      .values({
        styleId,
        storagePath,
        filename: entry.filename,
        contentType: 'image/jpeg',
        fileSize: imageBuffer.length,
        caption: entry.caption,
        altText: entry.altText,
        roomType: entry.roomType,
        tags: entry.tags,
        sourceUrl: entry.url,
      })
      .onConflictDoUpdate({
        target: styleImages.storagePath,
        set: {
          caption: entry.caption,
          altText: entry.altText,
          roomType: entry.roomType,
          tags: entry.tags,
          fileSize: imageBuffer.length,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!image) {
      throw new Error(`Failed to create style image record for ${storagePath}`);
    }

    return image;
  }

  /**
   * Seed images from a manifest (idempotent).
   * For each entry, checks if already seeded by storage_path.
   * If storage is not configured, creates DB records with mock paths.
   */
  async seedFromManifest(manifests: SeedStyleManifest[]): Promise<number> {
    let totalInserted = 0;

    for (const manifest of manifests) {
      const [style] = await db
        .select()
        .from(styleCatalog)
        .where(eq(styleCatalog.slug, manifest.styleSlug));

      if (!style) {
        logger.warn('Style not found for seeding, skipping', undefined, {
          slug: manifest.styleSlug,
        });
        continue;
      }

      for (const entry of manifest.images) {
        const storagePath = buildStoragePath(manifest.styleSlug, entry.filename);

        // Check if already exists
        const [existing] = await db
          .select()
          .from(styleImages)
          .where(eq(styleImages.storagePath, storagePath));

        if (existing) {
          logger.info('Image already seeded, skipping', { storagePath });
          continue;
        }

        // Insert record (without actual upload for seed — uses sourceUrl as reference)
        const [image] = await db
          .insert(styleImages)
          .values({
            styleId: style.id,
            storagePath,
            filename: entry.filename,
            contentType: 'image/jpeg',
            caption: entry.caption,
            altText: entry.altText,
            roomType: entry.roomType,
            tags: entry.tags,
            sourceUrl: entry.url,
          })
          .returning();

        if (image) {
          totalInserted++;
        }
      }

      logger.info('Style images seeded', {
        styleSlug: manifest.styleSlug,
        imageCount: manifest.images.length,
      });
    }

    logger.info('Seed complete', { totalInserted });
    return totalInserted;
  }

  /**
   * Delete a style image by ID
   */
  async deleteImage(imageId: string): Promise<void> {
    logger.info('Deleting style image', { imageId });

    const [image] = await db
      .select()
      .from(styleImages)
      .where(eq(styleImages.id, imageId));

    if (!image) {
      throw new NotFoundError(`Style image not found: ${imageId}`);
    }

    // Remove from storage
    if (isStorageEnabled() && supabaseAdmin) {
      const { error } = await supabaseAdmin.storage
        .from(env.SUPABASE_STYLE_BUCKET)
        .remove([image.storagePath]);

      if (error) {
        logger.warn('Failed to remove image from storage', undefined, {
          imageId,
          storagePath: image.storagePath,
          storageError: error.message,
        });
      }
    }

    await db.delete(styleImages).where(eq(styleImages.id, imageId));
    logger.info('Style image deleted', { imageId, storagePath: image.storagePath });
  }

  /**
   * Get count of images per style
   */
  async getImageCountByStyle(styleId: string): Promise<number> {
    const images = await db
      .select()
      .from(styleImages)
      .where(eq(styleImages.styleId, styleId));

    return images.length;
  }
}
