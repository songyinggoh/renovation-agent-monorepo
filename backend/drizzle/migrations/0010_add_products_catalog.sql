-- Migration 0010: Add products_catalog table
-- Global product catalog for search/discovery (separate from per-room product_recommendations)

CREATE TABLE IF NOT EXISTS "products_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL UNIQUE,
  "category" text NOT NULL,
  "description" text NOT NULL,
  "estimated_price" numeric(10, 2) NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "product_url" text,
  "image_url" text,
  "recommendation_reason" text NOT NULL,
  "metadata" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_products_catalog_category" ON "products_catalog" ("category");
CREATE INDEX IF NOT EXISTS "idx_products_catalog_price" ON "products_catalog" ("estimated_price");
