import { pgTable, uuid, text, numeric, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { renovationRooms } from './rooms.schema';

/**
 * Product recommendations table
 *
 * Stores AI-recommended products for each room
 * Products include furniture, fixtures, materials, etc.
 */
export const productRecommendations = pgTable('product_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id')
    .notNull()
    .references(() => renovationRooms.id, { onDelete: 'cascade' }),

  // Product details
  name: text('name').notNull(),
  category: text('category').notNull(), // e.g., "flooring", "lighting", "furniture"
  description: text('description'),

  // Pricing
  estimatedPrice: numeric('estimated_price', { precision: 10, scale: 2 }),
  currency: text('currency').default('USD'),

  // Product links and images
  productUrl: text('product_url'),
  imageUrl: text('image_url'),

  // AI reasoning for recommendation
  recommendationReason: text('recommendation_reason'),

  // Additional metadata
  metadata: jsonb('metadata'), // Brand, specs, alternatives, etc.

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Type inference for product_recommendations table
 */
export type ProductRecommendation = typeof productRecommendations.$inferSelect;
export type NewProductRecommendation = typeof productRecommendations.$inferInsert;
