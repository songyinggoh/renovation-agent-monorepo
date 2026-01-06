import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * User profiles table
 *
 * NOTE: This table is OPTIONAL for Phases 1-7 (core features)
 * It will be fully utilized in Phase 8 when Supabase Auth is integrated
 *
 * For now, userId references can be nullable in other tables
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  fullName: text('full_name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * Type inference for profiles table
 */
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
