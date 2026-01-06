import { pgTable, uuid, text, numeric, boolean, timestamp } from 'drizzle-orm/pg-core';
import { profiles } from './users.schema';

/**
 * Renovation sessions table
 *
 * Tracks the overall renovation project state and agent progress
 * Phase flow: INTAKE → CHECKLIST → PLAN → RENDER → PAYMENT → COMPLETE → ITERATE
 *
 * NOTE: userId is NULLABLE for Phases 1-7 to support anonymous sessions
 * In Phase 8, we'll add authentication and require userId
 */
export const renovationSessions = pgTable('renovation_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }), // Nullable for Phases 1-7
  title: text('title').notNull(),
  phase: text('phase').notNull().default('INTAKE'), // INTAKE | CHECKLIST | PLAN | RENDER | PAYMENT | COMPLETE | ITERATE
  totalBudget: numeric('total_budget', { precision: 10, scale: 2 }),
  currency: text('currency').default('USD'),

  // Payment fields (for Phase 9)
  isPaid: boolean('is_paid').default(false),
  stripePaymentIntentId: text('stripe_payment_intent_id'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Type inference for renovation_sessions table
 */
export type RenovationSession = typeof renovationSessions.$inferSelect;
export type NewRenovationSession = typeof renovationSessions.$inferInsert;
