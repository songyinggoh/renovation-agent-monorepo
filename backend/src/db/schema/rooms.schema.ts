import { pgTable, uuid, text, numeric, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { renovationSessions } from './sessions.schema.js';

/**
 * Renovation rooms table
 *
 * Stores individual rooms/spaces within a renovation session
 * Each room has its own budget, requirements, and preferences
 */
export const renovationRooms = pgTable('renovation_rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => renovationSessions.id, { onDelete: 'cascade' }),

  // Room details
  name: text('name').notNull(), // e.g., "Kitchen", "Living Room"
  type: text('type').notNull(), // e.g., "kitchen", "bathroom", "bedroom"

  // Budget allocation
  budget: numeric('budget', { precision: 10, scale: 2 }),

  // Room-specific requirements and preferences
  requirements: jsonb('requirements'), // Structured data: dimensions, style preferences, must-haves

  // AI-generated checklist items
  checklist: jsonb('checklist'), // Array of checklist items with completion status

  // AI-generated renovation plan
  plan: jsonb('plan'), // Detailed renovation plan with phases, tasks, timeline

  // AI-generated visualizations
  renderUrls: jsonb('render_urls'), // Array of generated image URLs

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Type inference for renovation_rooms table
 */
export type RenovationRoom = typeof renovationRooms.$inferSelect;
export type NewRenovationRoom = typeof renovationRooms.$inferInsert;
