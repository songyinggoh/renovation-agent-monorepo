-- Migration: Add asset_variants table for image processing
-- Purpose: Track thumbnails, WebP/AVIF conversions, and optimized versions of original assets
-- Date: 2026-02-13

CREATE TABLE IF NOT EXISTS asset_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent relationship
  parent_asset_id UUID NOT NULL REFERENCES room_assets(id) ON DELETE CASCADE,

  -- Variant metadata
  variant_type TEXT NOT NULL,
  format TEXT NOT NULL,
  quality INTEGER,

  -- Storage
  storage_path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,

  -- Dimensions
  width INTEGER,
  height INTEGER,

  -- Processing metadata
  processing_status TEXT NOT NULL DEFAULT 'pending',
  processing_error TEXT,
  processed_at TIMESTAMP,

  -- Configuration used for processing
  processing_config JSONB,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_variants_parent ON asset_variants(parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_variants_type ON asset_variants(parent_asset_id, variant_type);
CREATE INDEX IF NOT EXISTS idx_variants_status ON asset_variants(processing_status);

-- Constraints for data integrity
ALTER TABLE asset_variants
  ADD CONSTRAINT check_variant_type
  CHECK (variant_type IN ('thumbnail', 'optimized', 'webp', 'avif', 'thumbnail_webp', 'thumbnail_avif'));

ALTER TABLE asset_variants
  ADD CONSTRAINT check_variant_format
  CHECK (format IN ('jpeg', 'png', 'webp', 'avif'));

ALTER TABLE asset_variants
  ADD CONSTRAINT check_variant_status
  CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed'));

ALTER TABLE asset_variants
  ADD CONSTRAINT check_variant_file_size
  CHECK (file_size > 0);

ALTER TABLE asset_variants
  ADD CONSTRAINT check_variant_dimensions
  CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0));

ALTER TABLE asset_variants
  ADD CONSTRAINT check_variant_quality
  CHECK (quality IS NULL OR (quality >= 1 AND quality <= 100));

-- Comment on table
COMMENT ON TABLE asset_variants IS 'Stores processed variants of original assets (thumbnails, format conversions, optimized versions)';
COMMENT ON COLUMN asset_variants.parent_asset_id IS 'References the original asset in room_assets';
COMMENT ON COLUMN asset_variants.variant_type IS 'Type of processing: thumbnail, optimized, webp, avif, etc.';
COMMENT ON COLUMN asset_variants.processing_status IS 'Status: pending, processing, ready, failed';
