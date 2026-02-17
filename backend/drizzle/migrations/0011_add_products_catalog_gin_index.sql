-- Add GIN index for JSONB containment queries on products_catalog.metadata
CREATE INDEX IF NOT EXISTS "idx_products_catalog_metadata" ON "products_catalog" USING gin ("metadata");
