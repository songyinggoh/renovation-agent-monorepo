# Database & Storage Architecture Planning

This directory contains comprehensive database and storage architecture design for the renovation platform's media and file management system.

## Documents Overview

### 1. Core Architecture Design
**`database-storage-architecture.md`** (Main Reference)
- Complete design rationale with 6 major architectural decisions
- Detailed answers to all your questions
- Storage backend comparison (Supabase vs R2 vs S3)
- Cost projections and scaling strategies
- Migration roadmap by implementation phase
- Security and monitoring recommendations

**Key Sections:**
- Decision 1: Unified vs Separate Tables → **Keep Separate**
- Decision 2: Image Variants → **Parent-Child via asset_variants table**
- Decision 3: Documents → **New document_artifacts table**
- Decision 4: AI Renders → **Use room_assets with enhanced metadata**
- Decision 5: Before/After → **Metadata references**
- Decision 6: Video → **Defer to future, separate table when needed**

### 2. Visual Reference
**`database-schema-diagram.md`**
- ASCII ER diagram showing all table relationships
- Storage path organization examples
- Data flow diagrams (upload, variant processing, document generation)
- Index strategy summary
- Constraint documentation
- Query examples for common operations

### 3. Implementation Guide
**`IMPLEMENTATION_GUIDE.md`**
- Step-by-step implementation phases
- Code examples for each feature
- Database queries cheat sheet
- Testing strategies
- Common pitfalls and solutions
- Ready-to-use service implementations

### 4. Migration Scripts
**`../backend/drizzle/migrations/`**
- `0007_add_asset_variants.sql` - Image variants tracking
- `0008_add_document_artifacts.sql` - Generated documents
- `0009_add_constraints_and_indexes.sql` - Data integrity and performance

### 5. Schema Files
**`../backend/src/db/schema/`**
- `asset-variants.schema.ts` - TypeScript schema for variants (NEW)
- `document-artifacts.schema.ts` - TypeScript schema for docs (NEW)
- `index.ts` - Updated exports

## Quick Reference

### Current State (Already Implemented)
- ✅ `room_assets` table - User uploads (photos, floorplans, docs)
- ✅ `style_images` table - Curated moodboard images
- ✅ AssetService - Upload request/confirm flow with validation
- ✅ StyleImageService - Idempotent seeding and public URLs
- ✅ Supabase Storage - Two buckets (user-uploads private, styles public)

### Future Additions (Ready to Implement)
- 🔲 `asset_variants` table - Thumbnails, WebP/AVIF conversions
- 🔲 `document_artifacts` table - AI-generated PDFs
- 🔲 Enhanced constraints and indexes
- 🔲 Background processing queue (BullMQ)
- 🔲 Image optimization pipeline (Sharp)
- 🔲 PDF generation (PDFKit or Puppeteer)

## Implementation Phases

### Phase 1: Current (DONE)
Current user uploads and style catalog functionality

### Phase 2: Image Optimization (Next Sprint)
- Add `asset_variants` table
- Implement thumbnail generation
- Add WebP/AVIF conversion
- Background processing queue

### Phase 3: Document Generation (Phase 3 PLAN)
- Add `document_artifacts` table
- PDF generation for checklists
- PDF generation for renovation plans
- Versioning support

### Phase 4: AI Renders (Phase 4 RENDER)
- Use existing `room_assets` for renders
- Before/after comparison tracking
- AI model integration

## Key Architectural Decisions

### 1. Separate Tables for Different Domains
**User Content**: `room_assets` (session-scoped, private, deletable)
**Catalog Content**: `style_images` (global, public, immutable)
**Generated Content**: `document_artifacts` (versioned, regenerable)

**Rationale**: Different access patterns, lifecycles, and relationships

### 2. Parent-Child Variant Tracking
Original assets in `room_assets`, processed variants in `asset_variants` with foreign key reference.

**Benefits**: Clean separation, independent status tracking, easy regeneration

### 3. Storage Path Hierarchy
```
user-uploads/
  session_{id}/
    room_{id}/
      photos/
        original.jpg
        variants/
          original_thumb.webp
    artifacts/
      checklist_v1.pdf
```

**Benefits**: Easy cleanup, clear organization, prevents collisions

## Storage Backend

### Current: Supabase Storage (Recommended)
- Already integrated
- Authentication built-in
- Signed URLs for private content
- Public URLs for catalog

### When to Migrate: Cloudflare R2
- Storage > 100GB
- Bandwidth > 500GB/month
- Need CDN integration

### When to Migrate: AWS S3
- Need advanced features (lifecycle, versioning, replication)
- Already on AWS infrastructure

**Current Recommendation**: Stay with Supabase Storage until costs exceed $50/month

## Cost Projections

| Scale | Storage | Bandwidth | Monthly Cost |
|-------|---------|-----------|--------------|
| 1k sessions | 10GB | 100GB | ~$9 |
| 10k sessions | 100GB | 1TB | ~$92 |
| 100k sessions | 1TB | 10TB | ~$921 |

**Optimization strategies**: Aggressive compression, lazy variant generation, CDN caching

## Database Indexes

### High-Traffic Queries
- Get assets for room: `idx_room_assets_room`
- Get variant for asset: `idx_variants_type (parent_asset_id, variant_type)`
- Get style images: `idx_style_images_room_type (style_id, room_type)`
- Get documents for phase: `idx_docs_phase (session_id, phase)`

### Cleanup Queries
- Find abandoned uploads: `idx_room_assets_pending_cleanup (created_at, status) WHERE status='pending'`
- Find expired docs: `idx_docs_expired (expires_at)`

## Security Considerations

### Access Control
- User uploads: Require authentication, verify session ownership
- Style images: Public read, admin-only write
- Signed URLs: 15-minute expiry (uploads), 1-hour expiry (downloads)

### Input Validation
- File type whitelist (no executables)
- File size limits (10MB images, 50MB PDFs)
- Filename sanitization (prevent path traversal)
- Content-Type verification (magic bytes, not just extension)

### Data Privacy
- Minimal PII in metadata
- Hard delete from storage + DB (GDPR compliance)
- Consider auto-expire for abandoned sessions (>6 months)

## Testing Strategy

### Unit Tests
- Asset upload flow (request → upload → confirm)
- Variant generation (thumbnail, WebP, AVIF)
- Document generation (PDF creation, versioning)
- Cleanup jobs (abandoned uploads, expired docs)

### Integration Tests
- End-to-end upload with variant generation
- Document generation with storage verification
- Multi-version document workflow
- Before/after comparison tracking

### Performance Tests
- 1000 assets upload (concurrent)
- Variant processing queue (throughput)
- Storage cleanup (bulk delete)

## Monitoring Metrics

### Database
- Asset count by type/status
- Storage usage by session
- Pending uploads count
- Failed variant processing rate

### Storage
- Total storage used (GB)
- Bandwidth used (GB/month)
- Average file size by type
- Upload success rate

### Alerts
- Pending uploads > 100 (queue stuck)
- Storage > 80% quota
- Bandwidth > 80% quota
- Failed processing > 5%

## Migration Checklist

When ready to implement:

- [ ] Review `database-storage-architecture.md` (full design)
- [ ] Review `database-schema-diagram.md` (visual reference)
- [ ] Review `IMPLEMENTATION_GUIDE.md` (step-by-step)
- [ ] Run migration 0005 (asset_variants)
- [ ] Run migration 0006 (document_artifacts)
- [ ] Run migration 0007 (constraints and indexes)
- [ ] Implement VariantService
- [ ] Set up background queue (BullMQ + Redis)
- [ ] Implement DocumentService
- [ ] Add cleanup cron jobs
- [ ] Update frontend to use variants
- [ ] Add monitoring dashboard

## FAQ

**Q: Should I run migrations now?**
A: Only run migrations when you're ready to implement the features. Migration 0007 (constraints) can be applied now for immediate data integrity improvements.

**Q: Do I need to migrate away from Supabase Storage?**
A: No, stay with Supabase until costs exceed $50/month or you hit bandwidth limits. Migration path is documented if needed.

**Q: How do I track before/after photos?**
A: Use metadata references in room_assets (see Decision 5 in architecture doc). Create dedicated comparison table only if needed for complex UI.

**Q: Where do user-uploaded PDFs go?**
A: Use existing room_assets with assetType='document'. The document_artifacts table is only for system-generated docs.

**Q: How do I handle AI-generated renders?**
A: Use room_assets with assetType='render' and enhanced metadata (prompt, modelVersion, etc). See Decision 4 in architecture doc.

## Support Files Location

```
.planning/
├── README.md (this file)
├── database-storage-architecture.md (main design)
├── database-schema-diagram.md (visual reference)
└── IMPLEMENTATION_GUIDE.md (step-by-step)

backend/
├── drizzle/migrations/
│   ├── 0007_add_asset_variants.sql
│   ├── 0008_add_document_artifacts.sql
│   └── 0009_add_constraints_and_indexes.sql
└── src/db/schema/
    ├── asset-variants.schema.ts (new)
    ├── document-artifacts.schema.ts (new)
    └── index.ts (updated)
```

## Credits

Architecture designed: 2026-02-13
Database planner: Claude Sonnet 4.5
Based on existing implementation by: renovation-agent-monorepo team
