/**
 * Zod schemas for JSONB columns.
 *
 * These mirror the TypeScript interfaces used with Drizzle's .$type<T>()
 * but add runtime validation at service-layer boundaries.
 *
 * Each schema uses .passthrough() so existing DB rows with extra keys
 * are still readable, while new writes are validated against the shape.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 1. room_assets.metadata  (AssetMetadata from @renovation/shared-types)
// ---------------------------------------------------------------------------
export const AssetMetadataSchema = z.object({
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  orientation: z.enum(['landscape', 'portrait', 'square']).optional(),
  roomAngle: z.enum(['overview', 'detail', 'closeup', 'corner']).optional(),
  lighting: z.enum(['natural', 'artificial', 'mixed']).optional(),
  scale: z.string().optional(),
  dimensions: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    unit: z.enum(['ft', 'm']),
  }).optional(),
  style: z.string().optional(),
  prompt: z.string().optional(),
  modelVersion: z.string().optional(),
  thumbnailGenerated: z.boolean().optional(),
  compressionApplied: z.boolean().optional(),
  originalSize: z.number().int().nonnegative().optional(),
}).passthrough();

export type ValidatedAssetMetadata = z.infer<typeof AssetMetadataSchema>;

// ---------------------------------------------------------------------------
// 2. style_images.tags  (string[])
// ---------------------------------------------------------------------------
export const StyleImageTagsSchema = z.array(z.string().min(1).max(100));

export type ValidatedStyleImageTags = z.infer<typeof StyleImageTagsSchema>;

// ---------------------------------------------------------------------------
// 3. asset_variants.processingConfig  (VariantProcessingConfig)
// ---------------------------------------------------------------------------
export const VariantProcessingConfigSchema = z.object({
  quality: z.number().int().min(1).max(100).optional(),
  maxWidth: z.number().int().positive().optional(),
  maxHeight: z.number().int().positive().optional(),
  preserveAspectRatio: z.boolean().optional(),
  stripMetadata: z.boolean().optional(),
  sharpen: z.boolean().optional(),
}).passthrough();

export type ValidatedVariantProcessingConfig = z.infer<typeof VariantProcessingConfigSchema>;

// ---------------------------------------------------------------------------
// 4. document_artifacts.metadata  (DocumentMetadata)
// ---------------------------------------------------------------------------
export const DocumentMetadataSchema = z.object({
  sections: z.array(z.string()).optional(),
  watermarked: z.boolean().optional(),
  signed: z.boolean().optional(),
  interactive: z.boolean().optional(),
  language: z.string().max(10).optional(),
  templateId: z.string().uuid().optional(),
  generatedFrom: z.string().uuid().optional(),
}).passthrough();

export type ValidatedDocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

// ---------------------------------------------------------------------------
// 5. products_catalog.metadata
// ---------------------------------------------------------------------------
export const ProductCatalogMetadataSchema = z.object({
  brand: z.string().min(1),
  style: z.array(z.string().min(1)),
  roomTypes: z.array(z.string().min(1)),
  material: z.string().optional(),
  dimensions: z.string().optional(),
}).passthrough();

export type ValidatedProductCatalogMetadata = z.infer<typeof ProductCatalogMetadataSchema>;
