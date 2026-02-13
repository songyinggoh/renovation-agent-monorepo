import { pgTable, uuid, text, integer, timestamp, jsonb, index, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { renovationSessions } from './sessions.schema.js';
import { renovationRooms } from './rooms.schema.js';

/**
 * Document types for system-generated artifacts
 */
export const DOCUMENT_TYPES = [
  'checklist_pdf',      // AI-generated checklist PDF (Phase 2 CHECKLIST)
  'plan_pdf',           // Renovation plan PDF (Phase 3 PLAN)
  'estimate_pdf',       // Cost estimate PDF
  'contract_draft',     // Contract template draft
  'progress_report',    // Progress report PDF
  'materials_list',     // Materials shopping list PDF
  'timeline_pdf',       // Project timeline visualization
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * Who/what generated the document
 */
export const GENERATION_SOURCES = ['ai', 'system', 'admin', 'user'] as const;
export type GenerationSource = (typeof GENERATION_SOURCES)[number];

/**
 * JSONB metadata for document contents
 */
export interface DocumentMetadata {
  sections?: string[];           // Section titles in the document
  watermarked?: boolean;         // Has watermark applied
  signed?: boolean;              // Digital signature applied
  interactive?: boolean;         // Has fillable form fields
  language?: string;             // 'en' | 'es' | etc.
  templateId?: string;           // Reference to template used
  generatedFrom?: string;        // UUID of source data
  [key: string]: unknown;
}

/**
 * Document Artifacts Table
 *
 * Stores metadata for system-generated or AI-generated documents (PDFs, contracts, reports).
 * User-uploaded documents should use room_assets with assetType='document'.
 *
 * Rationale for separation:
 * - Different lifecycle: System docs are versioned and regenerable
 * - Different relationships: May be session-wide or room-specific
 * - Different access patterns: Typically one-time download vs browsing gallery
 * - Supports versioning: previous_version_id links to older versions
 * - Supports expiration: expires_at for temporary documents
 */
export const documentArtifacts = pgTable('document_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Session relationship (always required)
  sessionId: uuid('session_id')
    .notNull()
    .references(() => renovationSessions.id, { onDelete: 'cascade' }),

  // Optional room association (null for session-wide docs like estimates)
  roomId: uuid('room_id')
    .references(() => renovationRooms.id, { onDelete: 'cascade' }),

  // Document metadata
  documentType: text('document_type').notNull(),
  phase: text('phase').notNull(),                    // 'CHECKLIST' | 'PLAN' | 'PAYMENT' | etc.

  // Storage
  storagePath: text('storage_path').notNull().unique(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull().default('application/pdf'),
  fileSize: integer('file_size'),                    // bytes

  // Generation metadata
  generatedBy: text('generated_by'),                 // 'ai' | 'system' | 'admin' | 'user'
  generationPrompt: text('generation_prompt'),       // For AI-generated docs, stores the prompt used
  templateVersion: text('template_version'),         // Template version for reproducibility

  // Content metadata
  pageCount: integer('page_count'),
  metadata: jsonb('metadata').$type<DocumentMetadata>(),

  // Versioning
  version: integer('version').notNull().default(1),
  previousVersionId: uuid('previous_version_id')
    .references((): AnyPgColumn => documentArtifacts.id, { onDelete: 'set null' }),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),                // Optional expiration for temporary docs
}, (table) => [
  // Index by session for "get all docs for session"
  index('idx_docs_session').on(table.sessionId),

  // Index by room for "get all docs for room"
  index('idx_docs_room').on(table.roomId),

  // Index by document type for "get all checklists"
  index('idx_docs_type').on(table.documentType),

  // Composite index for "get plan PDFs for session"
  index('idx_docs_phase').on(table.sessionId, table.phase),

  // Index for cleanup queries (expired documents)
  index('idx_docs_expired').on(table.expiresAt),
]);

export type DocumentArtifact = typeof documentArtifacts.$inferSelect;
export type NewDocumentArtifact = typeof documentArtifacts.$inferInsert;
