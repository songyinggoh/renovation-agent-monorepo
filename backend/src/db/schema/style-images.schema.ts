import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { styleCatalog } from './styles.schema.js';

/**
 * Style moodboard images table
 *
 * Stores metadata for curated style reference images in Supabase Storage.
 * These are app-owned assets (not user uploads), stored in a public bucket
 * and served via the get_style_examples LangChain tool during INTAKE phase.
 */
export const styleImages = pgTable('style_images', {
  id: uuid('id').primaryKey().defaultRandom(),

  styleId: uuid('style_id')
    .notNull()
    .references(() => styleCatalog.id, { onDelete: 'cascade' }),

  storagePath: text('storage_path').notNull().unique(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull().default('image/jpeg'),
  fileSize: integer('file_size'),

  width: integer('width'),
  height: integer('height'),

  caption: text('caption'),
  altText: text('alt_text'),
  roomType: text('room_type'), // 'kitchen' | 'living' | 'bedroom' | 'bathroom' | 'dining' | 'office'
  tags: jsonb('tags').$type<string[]>(),

  displayOrder: integer('display_order').default(0),
  sourceUrl: text('source_url'), // Original URL the image was sourced from

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_style_images_style').on(table.styleId),
  index('idx_style_images_room_type').on(table.styleId, table.roomType),
]);

export type StyleImage = typeof styleImages.$inferSelect;
export type NewStyleImage = typeof styleImages.$inferInsert;
