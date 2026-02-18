-- Migration: Add constraints and performance indexes to existing tables
-- Purpose: Enforce data integrity and optimize common queries
-- Date: 2026-02-13

-- ============================================================================
-- CONSTRAINTS FOR room_assets
-- ============================================================================

ALTER TABLE room_assets
  ADD CONSTRAINT check_asset_type
  CHECK (asset_type IN ('photo', 'floorplan', 'render', 'document'));

ALTER TABLE room_assets
  ADD CONSTRAINT check_asset_status
  CHECK (status IN ('pending', 'uploaded', 'processing', 'ready', 'failed'));

ALTER TABLE room_assets
  ADD CONSTRAINT check_asset_source
  CHECK (source IN ('user_upload', 'pinterest', 'ai_generated'));

ALTER TABLE room_assets
  ADD CONSTRAINT check_asset_file_size
  CHECK (file_size > 0 AND file_size <= 10485760); -- 10MB max

-- ============================================================================
-- CONSTRAINTS FOR style_images
-- ============================================================================

ALTER TABLE style_images
  ADD CONSTRAINT check_style_dimensions
  CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0));

ALTER TABLE style_images
  ADD CONSTRAINT check_style_file_size
  CHECK (file_size IS NULL OR file_size > 0);

-- ============================================================================
-- PERFORMANCE INDEXES FOR room_assets
-- ============================================================================

-- Index for finding pending/processing assets (cleanup, monitoring)
CREATE INDEX IF NOT EXISTS idx_room_assets_status
  ON room_assets(status)
  WHERE status IN ('pending', 'processing');

-- Index for querying by source and type
CREATE INDEX IF NOT EXISTS idx_room_assets_source
  ON room_assets(source, asset_type);

-- Index for finding user's uploads
CREATE INDEX IF NOT EXISTS idx_room_assets_uploaded_by
  ON room_assets(uploaded_by)
  WHERE uploaded_by IS NOT NULL;

-- Partial index for cleanup queries (pending uploads older than threshold)
CREATE INDEX IF NOT EXISTS idx_room_assets_pending_cleanup
  ON room_assets(created_at, status)
  WHERE status = 'pending';

-- ============================================================================
-- PERFORMANCE INDEXES FOR style_images
-- ============================================================================

-- GIN index for JSONB tag searches
CREATE INDEX IF NOT EXISTS idx_style_images_tags
  ON style_images USING GIN(tags);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON CONSTRAINT check_asset_type ON room_assets IS 'Ensures asset_type is one of: photo, floorplan, render, document';
COMMENT ON CONSTRAINT check_asset_status ON room_assets IS 'Ensures status is one of: pending, uploaded, processing, ready, failed';
COMMENT ON CONSTRAINT check_asset_source ON room_assets IS 'Ensures source is one of: user_upload, pinterest, ai_generated';
COMMENT ON CONSTRAINT check_asset_file_size ON room_assets IS 'Ensures file size is positive and under 10MB';
COMMENT ON CONSTRAINT check_style_dimensions ON style_images IS 'Ensures width/height are either both NULL or both positive';
