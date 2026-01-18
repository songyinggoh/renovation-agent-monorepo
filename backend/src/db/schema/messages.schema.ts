import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { renovationSessions } from './sessions.schema.js';
import { profiles } from './users.schema.js';

/**
 * Chat messages table
 *
 * Stores all chat interactions between users and the AI agent
 * Supports both text and image messages
 *
 * NOTE: userId is NULLABLE for Phases 1-7 to support anonymous chat
 */
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => renovationSessions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'set null' }), // Nullable for Phases 1-7

  // Message content
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(), // Text content

  // Message type
  type: text('type').notNull().default('text'), // 'text' | 'image' | 'tool_call' | 'tool_result'

  // Image messages
  imageUrl: text('image_url'), // For user-uploaded images or AI-generated images
  imageAnalysis: text('image_analysis'), // AI analysis of uploaded images

  // Tool interactions
  toolName: text('tool_name'), // Name of the tool called (e.g., 'generate_checklist', 'create_plan')
  toolInput: jsonb('tool_input'), // Tool input parameters
  toolOutput: jsonb('tool_output'), // Tool output data

  // Additional metadata
  metadata: jsonb('metadata'), // Token counts, model info, etc.

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Type inference for chat_messages table
 */
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
