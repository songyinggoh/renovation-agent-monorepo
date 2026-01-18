import { pgTable, uuid, text, numeric, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { renovationSessions } from './sessions.schema.js';

/**
 * Contractor recommendations table
 *
 * Stores AI-recommended contractors for the renovation project
 * Includes specialties, pricing estimates, and contact information
 */
export const contractorRecommendations = pgTable('contractor_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => renovationSessions.id, { onDelete: 'cascade' }),

  // Contractor details
  name: text('name').notNull(),
  specialty: text('specialty').notNull(), // e.g., "general contractor", "electrician", "plumber"
  description: text('description'),

  // Contact information
  phone: text('phone'),
  email: text('email'),
  website: text('website'),

  // Pricing estimate
  estimatedCost: numeric('estimated_cost', { precision: 10, scale: 2 }),
  currency: text('currency').default('USD'),

  // Location
  location: text('location'),
  serviceArea: text('service_area'),

  // AI reasoning for recommendation
  recommendationReason: text('recommendation_reason'),

  // Additional metadata
  metadata: jsonb('metadata'), // Certifications, reviews, portfolio, etc.

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Type inference for contractor_recommendations table
 */
export type ContractorRecommendation = typeof contractorRecommendations.$inferSelect;
export type NewContractorRecommendation = typeof contractorRecommendations.$inferInsert;
