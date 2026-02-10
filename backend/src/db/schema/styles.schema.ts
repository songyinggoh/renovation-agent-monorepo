import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

/**
 * Style catalog table
 *
 * Stores design style definitions for moodboard generation and style recommendations
 * Pre-seeded with curated styles; expandable via admin or AI
 */
export const styleCatalog = pgTable('style_catalog', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Style identity
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull(),

  // Visual characteristics
  colorPalette: jsonb('color_palette').notNull(), // Array of { name: string, hex: string }
  materials: jsonb('materials').notNull(), // Array of material names
  keywords: jsonb('keywords').notNull(), // Search keywords

  // Reference images (URLs for now; Phase 2B adds storage uploads)
  imageUrls: jsonb('image_urls'),

  // Additional metadata (room suitability, era, origin, etc.)
  metadata: jsonb('metadata'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Type inference for style_catalog table
 */
export type StyleCatalogEntry = typeof styleCatalog.$inferSelect;
export type NewStyleCatalogEntry = typeof styleCatalog.$inferInsert;
