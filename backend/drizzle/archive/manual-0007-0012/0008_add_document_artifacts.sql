-- Migration: Add document_artifacts table for system-generated documents
-- Purpose: Track AI-generated PDFs (checklists, plans, estimates) separate from user uploads
-- Date: 2026-02-13

CREATE TABLE IF NOT EXISTS document_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Session relationship (required)
  session_id UUID NOT NULL REFERENCES renovation_sessions(id) ON DELETE CASCADE,

  -- Optional room association
  room_id UUID REFERENCES renovation_rooms(id) ON DELETE CASCADE,

  -- Document metadata
  document_type TEXT NOT NULL,
  phase TEXT NOT NULL,

  -- Storage
  storage_path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size INTEGER,

  -- Generation metadata
  generated_by TEXT,
  generation_prompt TEXT,
  template_version TEXT,

  -- Content metadata
  page_count INTEGER,
  metadata JSONB,

  -- Versioning
  version INTEGER NOT NULL DEFAULT 1,
  previous_version_id UUID REFERENCES document_artifacts(id) ON DELETE SET NULL,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_docs_session ON document_artifacts(session_id);
CREATE INDEX IF NOT EXISTS idx_docs_room ON document_artifacts(room_id);
CREATE INDEX IF NOT EXISTS idx_docs_type ON document_artifacts(document_type);
CREATE INDEX IF NOT EXISTS idx_docs_phase ON document_artifacts(session_id, phase);
CREATE INDEX IF NOT EXISTS idx_docs_expired ON document_artifacts(expires_at);

-- Constraints for data integrity
ALTER TABLE document_artifacts
  ADD CONSTRAINT check_document_type
  CHECK (document_type IN ('checklist_pdf', 'plan_pdf', 'estimate_pdf', 'contract_draft', 'progress_report', 'materials_list', 'timeline_pdf'));

ALTER TABLE document_artifacts
  ADD CONSTRAINT check_document_phase
  CHECK (phase IN ('INTAKE', 'CHECKLIST', 'PLAN', 'RENDER', 'PAYMENT', 'COMPLETE', 'ITERATE'));

ALTER TABLE document_artifacts
  ADD CONSTRAINT check_document_generated_by
  CHECK (generated_by IS NULL OR generated_by IN ('ai', 'system', 'admin', 'user'));

ALTER TABLE document_artifacts
  ADD CONSTRAINT check_document_file_size
  CHECK (file_size IS NULL OR file_size > 0);

ALTER TABLE document_artifacts
  ADD CONSTRAINT check_document_page_count
  CHECK (page_count IS NULL OR page_count > 0);

ALTER TABLE document_artifacts
  ADD CONSTRAINT check_document_version
  CHECK (version > 0);

-- Comment on table
COMMENT ON TABLE document_artifacts IS 'Stores metadata for system-generated documents (PDFs, reports, contracts). User-uploaded docs use room_assets.';
COMMENT ON COLUMN document_artifacts.session_id IS 'Required: references the renovation session';
COMMENT ON COLUMN document_artifacts.room_id IS 'Optional: NULL for session-wide docs (estimates), populated for room-specific docs';
COMMENT ON COLUMN document_artifacts.document_type IS 'Type: checklist_pdf, plan_pdf, estimate_pdf, contract_draft, etc.';
COMMENT ON COLUMN document_artifacts.phase IS 'Phase when generated: CHECKLIST, PLAN, RENDER, etc.';
COMMENT ON COLUMN document_artifacts.generated_by IS 'Who/what generated: ai, system, admin, user';
COMMENT ON COLUMN document_artifacts.previous_version_id IS 'Links to previous version for audit trail';
COMMENT ON COLUMN document_artifacts.expires_at IS 'Optional expiration for temporary documents';
