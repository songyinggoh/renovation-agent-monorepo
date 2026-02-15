import { pgTable, uuid, text, numeric, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * Products catalog table
 *
 * Global product catalog for search/discovery via the search_products tool.
 * Unlike product_recommendations (which are per-room AI picks),
 * this table holds the curated catalog of available products.
 */
export const productsCatalog = pgTable('products_catalog', {
  id: uuid('id').primaryKey().defaultRandom(),

  name: text('name').notNull().unique(),
  category: text('category').notNull(),
  description: text('description').notNull(),

  estimatedPrice: numeric('estimated_price', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('USD').notNull(),

  productUrl: text('product_url'),
  imageUrl: text('image_url'),

  recommendationReason: text('recommendation_reason').notNull(),

  metadata: jsonb('metadata').$type<{
    brand: string;
    style: string[];
    roomTypes: string[];
    material?: string;
    dimensions?: string;
  }>().notNull(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_products_catalog_category').on(table.category),
  index('idx_products_catalog_price').on(table.estimatedPrice),
]);

export type ProductCatalogEntry = typeof productsCatalog.$inferSelect;
export type NewProductCatalogEntry = typeof productsCatalog.$inferInsert;
