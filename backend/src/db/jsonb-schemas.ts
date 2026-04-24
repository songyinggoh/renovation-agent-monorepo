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

// ---------------------------------------------------------------------------
// 6. renovation_sessions.plan_data  (RenovationPlan)
// ---------------------------------------------------------------------------
export const RenovationTaskSchema = z.object({
  id: z.string().describe('Unique task identifier'),
  description: z.string().describe('Human-readable task description'),
  estimatedCost: z.number().nonnegative().describe('Estimated cost in USD'),
  duration: z.number().int().positive().describe('Duration in calendar days'),
  tradeCategory: z.enum([
    'electrical', 'plumbing', 'carpentry', 'painting',
    'flooring', 'tiling', 'hvac', 'general',
  ]).describe('Trade category for contractor matching'),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  dependencies: z.array(z.string()).default([])
    .describe('IDs of tasks that must complete first'),
}).passthrough();

export const RenovationRoomPlanSchema = z.object({
  roomId: z.string().describe('Room UUID'),
  roomName: z.string().describe('Human-readable room name'),
  tasks: z.array(RenovationTaskSchema).min(1),
  estimatedCost: z.number().nonnegative().describe('Total estimated cost for this room'),
  estimatedDays: z.number().int().positive().describe('Total estimated days for this room'),
}).passthrough();

export const ContractorRecommendationSchema = z.object({
  specialty: z.string().describe('Contractor trade specialty'),
  estimatedCost: z.number().nonnegative().describe('Estimated cost for this contractor'),
  notes: z.string().optional().describe('Additional notes'),
}).passthrough();

export const RenovationPlanSchema = z.object({
  summary: z.string().describe('Executive summary of the renovation plan'),
  totalBudget: z.number().nonnegative().describe('Total estimated cost in USD'),
  totalDays: z.number().int().positive().describe('Total estimated calendar days'),
  startDate: z.string().optional().describe('Proposed start date (ISO 8601)'),
  rooms: z.array(RenovationRoomPlanSchema),
  contractors: z.array(ContractorRecommendationSchema).default([]),
  warnings: z.array(z.string()).default([])
    .describe('Flagged risks or permit requirements'),
  generatedAt: z.string().describe('Plan generation timestamp (ISO 8601)'),
}).passthrough();

export type RenovationPlan = z.infer<typeof RenovationPlanSchema>;
export type RenovationTask = z.infer<typeof RenovationTaskSchema>;
export type RenovationRoomPlan = z.infer<typeof RenovationRoomPlanSchema>;
export type ContractorRecommendation = z.infer<typeof ContractorRecommendationSchema>;
