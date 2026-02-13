import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { roomAssets } from '../assets.schema.js';

/**
 * Variant types for processed images
 */
export const VARIANT_TYPES = [
  'thumbnail',      // Small preview (300x200)
  'optimized',      // Full-size optimized (1200px max)
  'webp',           // WebP conversion
  'avif',           // AVIF conversion
  'thumbnail_webp', // Thumbnail in WebP format
  'thumbnail_avif', // Thumbnail in AVIF format
] as const;
export type VariantType = (typeof VARIANT_TYPES)[number];

/**
 * Image formats
 */
export const IMAGE_FORMATS = ['jpeg', 'png', 'webp', 'avif'] as const;
export type ImageFormat = (typeof IMAGE_FORMATS)[number];

/**
 * Processing statuses
 */
export const PROCESSING_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

/**
 * JSONB metadata for processing configuration
 */
export interface VariantProcessingConfig {
  quality?: number;           // 1-100
  maxWidth?: number;          // Max width in pixels
  maxHeight?: number;         // Max height in pixels
  preserveAspectRatio?: boolean;
  stripMetadata?: boolean;    // Remove EXIF data
  sharpen?: boolean;
  [key: string]: unknown;
}

/**
 * Asset Variants Table
 *
 * Tracks processed versions of original assets (thumbnails, optimized images, format conversions).
 * Each variant is linked to a parent asset in room_assets via parentAssetId.
 *
 * Benefits:
 * - Original asset metadata unchanged
 * - Independent processing status per variant
 * - Easy to regenerate (delete + recreate)
 * - Supports multiple formats per original (e.g., thumbnail.webp + thumbnail.avif)
 * - Cascade deletion on parent removal
 */
export const assetVariants = pgTable('asset_variants', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Parent relationship
  parentAssetId: uuid('parent_asset_id')
    .notNull()
    .references(() => roomAssets.id, { onDelete: 'cascade' }),

  // Variant metadata
  variantType: text('variant_type').notNull(),    // 'thumbnail' | 'webp' | 'avif' | 'optimized'
  format: text('format').notNull(),                // 'jpeg' | 'png' | 'webp' | 'avif'
  quality: integer('quality'),                     // 1-100

  // Storage
  storagePath: text('storage_path').notNull().unique(),
  contentType: text('content_type').notNull(),     // 'image/webp', 'image/avif', etc.
  fileSize: integer('file_size').notNull(),        // bytes

  // Dimensions
  width: integer('width'),
  height: integer('height'),

  // Processing metadata
  processingStatus: text('processing_status').notNull().default('pending'), // 'pending' | 'processing' | 'ready' | 'failed'
  processingError: text('processing_error'),
  processedAt: timestamp('processed_at'),

  // Configuration used for processing
  processingConfig: jsonb('processing_config').$type<VariantProcessingConfig>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  // Index by parent for quick lookup of all variants
  index('idx_variants_parent').on(table.parentAssetId),

  // Index by parent + type for fetching specific variant (e.g., "get thumbnail for asset X")
  index('idx_variants_type').on(table.parentAssetId, table.variantType),

  // Index by status for processing queue queries
  index('idx_variants_status').on(table.processingStatus),
]);

export type AssetVariant = typeof assetVariants.$inferSelect;
export type NewAssetVariant = typeof assetVariants.$inferInsert;
