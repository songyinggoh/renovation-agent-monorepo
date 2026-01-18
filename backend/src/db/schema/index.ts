/**
 * Database schema exports
 *
 * This file aggregates all Drizzle schema definitions for the renovation agent
 * Schemas are organized by domain:
 * - users: User profiles and authentication
 * - sessions: Renovation sessions and project state
 * - rooms: Individual rooms within a renovation
 * - products: AI-recommended products
 * - contractors: AI-recommended contractors
 * - messages: Chat conversation history
 */

// User profiles
export * from './users.schema.js';

// Renovation sessions
export * from './sessions.schema.js';

// Renovation rooms
export * from './rooms.schema.js';

// Product recommendations
export * from './products.schema.js';

// Contractor recommendations
export * from './contractors.schema.js';

// Chat messages
export * from './messages.schema.js';
