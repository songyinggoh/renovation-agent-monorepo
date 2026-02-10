import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { renovationRooms } from './rooms.schema.js';
import { renovationSessions } from './sessions.schema.js';
import { profiles } from './users.schema.js';

/**
 * Asset types for room files
 */
export const ASSET_TYPES = ['photo', 'floorplan', 'render', 'document'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * Asset upload statuses
 */
export const ASSET_STATUSES = ['pending', 'uploaded', 'processing', 'ready', 'failed'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

/**
 * Asset source types
 */
export const ASSET_SOURCES = ['user_upload', 'pinterest', 'ai_generated'] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];

/**
 * JSONB metadata type — extensible per asset type
 */
export interface AssetMetadata {
  width?: number;
  height?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
  roomAngle?: 'overview' | 'detail' | 'closeup' | 'corner';
  lighting?: 'natural' | 'artificial' | 'mixed';
  scale?: string;
  dimensions?: { length: number; width: number; unit: 'ft' | 'm' };
  style?: string;
  prompt?: string;
  modelVersion?: string;
  thumbnailGenerated?: boolean;
  compressionApplied?: boolean;
  originalSize?: number;
  [key: string]: unknown;
}

/**
 * Room assets table
 *
 * Stores metadata for files uploaded to Supabase Storage.
 * The actual files live in Supabase Storage buckets;
 * this table tracks paths, metadata, and relationships.
 */
export const roomAssets = pgTable('room_assets', {
  id: uuid('id').primaryKey().defaultRandom(),

  sessionId: uuid('session_id')
    .notNull()
    .references(() => renovationSessions.id, { onDelete: 'cascade' }),
  roomId: uuid('room_id')
    .notNull()
    .references(() => renovationRooms.id, { onDelete: 'cascade' }),

  assetType: text('asset_type').notNull(), // 'photo' | 'floorplan' | 'render' | 'document'
  storagePath: text('storage_path').notNull(),
  source: text('source').notNull().default('user_upload'),
  status: text('status').notNull().default('pending'),

  originalFilename: text('original_filename').notNull(),
  contentType: text('content_type').notNull(),
  fileSize: integer('file_size').notNull(), // bytes

  displayOrder: integer('display_order').default(0),
  caption: text('caption'),
  altText: text('alt_text'),

  uploadedBy: uuid('uploaded_by')
    .references(() => profiles.id, { onDelete: 'set null' }),

  metadata: jsonb('metadata').$type<AssetMetadata>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_room_assets_session').on(table.sessionId),
  index('idx_room_assets_room').on(table.roomId),
  index('idx_room_assets_type').on(table.roomId, table.assetType),
]);

export type RoomAsset = typeof roomAssets.$inferSelect;
export type NewRoomAsset = typeof roomAssets.$inferInsert;
