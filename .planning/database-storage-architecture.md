# Database & Storage Architecture Design
**Date**: 2026-02-13
**Status**: Recommendation Phase

## Executive Summary

This document provides a comprehensive database and storage architecture design for the renovation platform's media and file management needs. The design addresses current user uploads (room_assets), curated style images (style_images), and future requirements including image optimization, PDFs, AI-generated renders, and video.

## Current State Analysis

### Existing Schema
1. **room_assets table** (User uploads - Phase 2.1)
   - Columns: id, sessionId, roomId, uploadedBy, assetType, storagePath, source, status, originalFilename, contentType, fileSize, displayOrder, caption, altText, metadata (JSONB), timestamps
   - Asset types: photo, floorplan, render, document
   - Indexes: session, room, (room + type)
   - Storage: Private Supabase bucket with signed URLs

2. **style_images table** (Curated moodboards - Phase 2.3)
   - Columns: id, styleId, storagePath, filename, contentType, fileSize, width, height, caption, altText, roomType, tags (JSONB), displayOrder, sourceUrl, timestamps
   - Storage: Public Supabase bucket
   - Indexes: style, (style + roomType)

### Storage Patterns
- **User uploads bucket**: Private, path = `session_{sessionId}/room_{roomId}/{assetType}s/{timestamp}_{filename}`
- **Style bucket**: Public, path = `styles/{styleSlug}/{filename}`
- AssetService: Request → Upload → Confirm flow with validation
- StyleImageService: Idempotent seeding, public URLs

## Architecture Decisions

### Decision 1: Unified vs Separate Tables

**RECOMMENDATION: Keep Separate Tables (Current Approach)**

**Rationale:**
1. **Different access patterns**: User assets require authentication/ownership checks; style images are globally accessible catalog data
2. **Different lifecycles**: User assets are session-scoped and deletable; style images are immutable reference data
3. **Different relationships**: room_assets relate to sessions/rooms/users; style_images relate to style catalog
4. **Query optimization**: Separate indexes for each use case without over-indexing
5. **Future isolation**: Easier to move style images to CDN or separate service

**When to consolidate?** Only if:
- Building a universal media library (not the case here)
- Need cross-asset search/tagging (not primary requirement)
- Storage backend unifies access control (unlikely with Supabase)

### Decision 2: Image Variants Architecture

**RECOMMENDATION: Parent-Child Variant Tracking**

Create a new `asset_variants` table to track processed versions:

```typescript
export const assetVariants = pgTable('asset_variants', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Parent relationship
  parentAssetId: uuid('parent_asset_id')
    .notNull()
    .references(() => roomAssets.id, { onDelete: 'cascade' }),

  // Variant metadata
  variantType: text('variant_type').notNull(), // 'thumbnail' | 'webp' | 'avif' | 'optimized'
  format: text('format').notNull(), // 'jpeg' | 'png' | 'webp' | 'avif'
  quality: integer('quality'), // 1-100

  // Storage
  storagePath: text('storage_path').notNull().unique(),
  contentType: text('content_type').notNull(),
  fileSize: integer('file_size').notNull(),

  // Dimensions
  width: integer('width'),
  height: integer('height'),

  // Processing metadata
  processingStatus: text('processing_status').notNull().default('pending'), // 'pending' | 'processing' | 'ready' | 'failed'
  processingError: text('processing_error'),
  processedAt: timestamp('processed_at'),

  // Configuration used
  processingConfig: jsonb('processing_config'), // { quality: 80, maxWidth: 1200, ... }

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_variants_parent').on(table.parentAssetId),
  index('idx_variants_type').on(table.parentAssetId, table.variantType),
  index('idx_variants_status').on(table.processingStatus),
]);

export type AssetVariant = typeof assetVariants.$inferSelect;
export type NewAssetVariant = typeof assetVariants.$inferInsert;
```

**Benefits:**
- Original asset record remains unchanged
- Each variant independently tracked with own storage path
- Easy to regenerate variants (delete + recreate)
- Supports multiple formats per original (thumbnail.webp, thumbnail.jpeg)
- Processing failures don't corrupt original metadata

**Storage Path Pattern:**
```
Original: session_{sessionId}/room_{roomId}/photos/1234_kitchen.jpg
Variants: session_{sessionId}/room_{roomId}/photos/variants/1234_kitchen_thumb_300x200.webp
          session_{sessionId}/room_{roomId}/photos/variants/1234_kitchen_optimized_1200x800.avif
```

### Decision 3: Documents & Generated Files

**RECOMMENDATION: Extend room_assets, Add document_artifacts Table**

**For user-uploaded PDFs**: Use existing `room_assets` with `assetType = 'document'`
- Already supports this type
- Validation already in place (PDF MIME type allowed)

**For AI-generated/system documents**: Create new `document_artifacts` table:

```typescript
export const documentArtifacts = pgTable('document_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),

  sessionId: uuid('session_id')
    .notNull()
    .references(() => renovationSessions.id, { onDelete: 'cascade' }),

  // Optional room association (null for session-wide docs)
  roomId: uuid('room_id')
    .references(() => renovationRooms.id, { onDelete: 'cascade' }),

  // Document metadata
  documentType: text('document_type').notNull(), // 'checklist_pdf' | 'plan_pdf' | 'estimate_pdf' | 'contract_draft'
  phase: text('phase').notNull(), // 'CHECKLIST' | 'PLAN' | 'PAYMENT' etc.

  // Storage
  storagePath: text('storage_path').notNull().unique(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull().default('application/pdf'),
  fileSize: integer('file_size'),

  // Generation metadata
  generatedBy: text('generated_by'), // 'ai' | 'system' | 'admin'
  generationPrompt: text('generation_prompt'), // For AI-generated docs
  templateVersion: text('template_version'), // For template-based generation

  // Content metadata
  pageCount: integer('page_count'),
  metadata: jsonb('metadata'), // { sections: [...], watermarked: true, ... }

  // Versioning
  version: integer('version').notNull().default(1),
  previousVersionId: uuid('previous_version_id')
    .references(() => documentArtifacts.id, { onDelete: 'set null' }),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'), // For temporary docs
}, (table) => [
  index('idx_docs_session').on(table.sessionId),
  index('idx_docs_room').on(table.roomId),
  index('idx_docs_type').on(table.documentType),
  index('idx_docs_phase').on(table.sessionId, table.phase),
]);
```

**Rationale for Separation:**
- User uploads vs system-generated have different lifecycles
- Document artifacts may be versioned (user edits checklist → regenerate PDF)
- Different access patterns (user browsing photos vs downloading a plan PDF)
- Easier to implement expiration for temporary documents

### Decision 4: AI-Generated Renders (Phase 4)

**RECOMMENDATION: Use room_assets with assetType = 'render'**

Enhance with additional metadata in JSONB:

```typescript
interface RenderMetadata extends AssetMetadata {
  // AI generation metadata
  prompt: string;
  negativePrompt?: string;
  modelVersion: string; // 'stable-diffusion-xl' | 'midjourney-v6' | 'gemini-imagen-3'
  seed?: number;
  steps?: number;
  guidanceScale?: number;

  // Render-specific
  renderType: 'ai_generated' | 'user_edited' | 'professional';
  basedOnAssetId?: string; // Reference to original photo if applicable
  styleApplied?: string; // Reference to style catalog entry

  // Comparison tracking
  beforeAssetId?: string; // For before/after pairs
  afterAssetId?: string;

  // Approval workflow
  approvalStatus?: 'draft' | 'pending_review' | 'approved' | 'rejected';
  approvedBy?: string; // userId
  approvedAt?: string; // ISO timestamp
  rejectionReason?: string;
}
```

**Benefits:**
- Renders are conceptually "photos of the future" → same table as photos
- Before/after tracking via metadata references
- Existing signed URL infrastructure works
- Existing display/gallery components can render both

**Storage Path:**
```
session_{sessionId}/room_{roomId}/renders/{timestamp}_ai_{styleSlug}.png
```

### Decision 5: Before/After Comparisons

**RECOMMENDATION: Metadata References + Optional Comparison Table**

**Phase 1 (Simple)**: Use metadata links in room_assets:
```typescript
metadata: {
  beforeAssetId: 'uuid-of-before-photo',
  afterAssetId: 'uuid-of-after-render',
  comparisonType: 'side_by_side' | 'slider' | 'overlay'
}
```

**Phase 2 (Advanced)**: Create dedicated comparison table if needed:
```typescript
export const assetComparisons = pgTable('asset_comparisons', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => renovationSessions.id),
  roomId: uuid('room_id').notNull().references(() => renovationRooms.id),

  beforeAssetId: uuid('before_asset_id')
    .notNull()
    .references(() => roomAssets.id, { onDelete: 'cascade' }),
  afterAssetId: uuid('after_asset_id')
    .notNull()
    .references(() => roomAssets.id, { onDelete: 'cascade' }),

  title: text('title'),
  description: text('description'),
  displayOrder: integer('display_order').default(0),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_comparisons_room').on(table.roomId),
]);
```

**When to create comparison table?**
- Need to track multiple before/after pairs per room
- Want dedicated comparison gallery UI
- Need comparison-specific metadata (annotations, highlights)

### Decision 6: Video Support (Future)

**RECOMMENDATION: New asset_videos Table When Needed**

**Rationale for separate table:**
- Videos have fundamentally different processing (transcoding, thumbnails, streaming)
- Different storage patterns (HLS/DASH segments, multiple resolutions)
- Different performance characteristics (large files, streaming URLs)
- Different analytics needs (play count, completion rate)

**Schema Preview:**
```typescript
export const assetVideos = pgTable('asset_videos', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull(),
  roomId: uuid('room_id'),

  videoType: text('video_type').notNull(), // 'walkthrough' | 'tutorial' | 'progress_timelapse'

  // Master file
  storagePath: text('storage_path').notNull(),
  duration: integer('duration'), // seconds

  // Transcoding status
  transcodingStatus: text('transcoding_status').default('pending'),

  // Streaming URLs
  hlsManifestUrl: text('hls_manifest_url'),
  dashManifestUrl: text('dash_manifest_url'),
  thumbnailUrl: text('thumbnail_url'),

  // Resolutions available
  resolutions: jsonb('resolutions'), // ['360p', '720p', '1080p']

  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Don't create until**: Video feature is actually planned (not in current roadmap)

## Recommended Indexes & Constraints

### room_assets Enhancements
```sql
-- Current indexes (keep these)
CREATE INDEX idx_room_assets_session ON room_assets(session_id);
CREATE INDEX idx_room_assets_room ON room_assets(room_id);
CREATE INDEX idx_room_assets_type ON room_assets(room_id, asset_type);

-- Add these for performance
CREATE INDEX idx_room_assets_status ON room_assets(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_room_assets_source ON room_assets(source, asset_type);
CREATE INDEX idx_room_assets_uploaded_by ON room_assets(uploaded_by) WHERE uploaded_by IS NOT NULL;

-- For cleanup queries (pending uploads older than 1 hour)
CREATE INDEX idx_room_assets_pending_cleanup ON room_assets(created_at, status) WHERE status = 'pending';
```

### style_images Enhancements
```sql
-- Current indexes (keep these)
CREATE INDEX idx_style_images_style ON style_images(style_id);
CREATE INDEX idx_style_images_room_type ON style_images(style_id, room_type);

-- Add for tag searches (if using JSONB queries)
CREATE INDEX idx_style_images_tags ON style_images USING GIN(tags);
```

### Constraints to Add
```sql
-- Ensure assetType is valid
ALTER TABLE room_assets
  ADD CONSTRAINT check_asset_type
  CHECK (asset_type IN ('photo', 'floorplan', 'render', 'document'));

-- Ensure status is valid
ALTER TABLE room_assets
  ADD CONSTRAINT check_asset_status
  CHECK (status IN ('pending', 'uploaded', 'processing', 'ready', 'failed'));

-- Ensure source is valid
ALTER TABLE room_assets
  ADD CONSTRAINT check_asset_source
  CHECK (source IN ('user_upload', 'pinterest', 'ai_generated'));

-- File size limits
ALTER TABLE room_assets
  ADD CONSTRAINT check_file_size
  CHECK (file_size > 0 AND file_size <= 10485760); -- 10MB max

-- Positive dimensions
ALTER TABLE style_images
  ADD CONSTRAINT check_dimensions
  CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0));
```

## Storage Backend Recommendations

### Current: Supabase Storage (RECOMMENDED TO KEEP)

**Pros:**
- Already integrated with Supabase PostgreSQL
- Built-in authentication integration
- Signed URL support (private buckets)
- Public URL support (style images)
- Generous free tier (1GB storage, 2GB bandwidth/month)
- Easy migration path if moving away from Supabase DB later

**Cons:**
- Limited to Supabase ecosystem
- No CDN-level caching controls
- Pricing can scale quickly (paid tier: $0.021/GB storage, $0.09/GB bandwidth)

### Alternative: Cloudflare R2

**When to consider:**
- Storage needs exceed 100GB
- Bandwidth costs become significant (R2 has zero egress fees)
- Want CDN integration (Cloudflare CDN)
- Need more control over caching/purging

**Migration effort**: Medium
- Change storage adapter in services
- Update signed URL generation
- Copy existing files (can be scripted)
- Database schema unchanged (just storagePath values)

### Alternative: AWS S3

**When to consider:**
- Need advanced features (lifecycle policies, versioning, replication)
- Already using AWS infrastructure
- Need S3-compatible ecosystem (Lambda triggers, etc.)

**Migration effort**: Medium-High
- More complex authentication (IAM, presigned URLs)
- Higher operational complexity
- Database schema unchanged

**RECOMMENDATION**: Stay with Supabase Storage until:
1. Monthly storage costs exceed $50/month
2. Bandwidth costs become problematic (>500GB/month)
3. Moving away from Supabase PostgreSQL entirely

## Storage Path Organization Strategy

### User Uploads (Private Bucket)
```
user-uploads/
├── session_{sessionId}/
│   ├── room_{roomId}/
│   │   ├── photos/
│   │   │   ├── {timestamp}_{filename}.jpg
│   │   │   └── variants/
│   │   │       ├── {timestamp}_{filename}_thumb_300x200.webp
│   │   │       └── {timestamp}_{filename}_optimized_1200x800.avif
│   │   ├── floorplans/
│   │   │   └── {timestamp}_{filename}.pdf
│   │   ├── renders/
│   │   │   └── {timestamp}_ai_{styleSlug}.png
│   │   └── documents/
│   │       └── {timestamp}_{filename}.pdf
│   └── artifacts/
│       ├── checklist_{timestamp}.pdf
│       ├── plan_v2_{timestamp}.pdf
│       └── estimate_{timestamp}.pdf
```

**Benefits:**
- Easy session-wide deletion (cascade on session_id)
- Clear file organization for debugging
- Timestamp prevents filename collisions
- Room-scoped for granular access control

### Style Images (Public Bucket)
```
styles/
├── modern-minimalist/
│   ├── kitchen_01.jpg
│   ├── living_01.jpg
│   └── bedroom_01.jpg
├── industrial-chic/
│   ├── kitchen_01.jpg
│   └── office_01.jpg
└── coastal-contemporary/
    └── bathroom_01.jpg
```

**Benefits:**
- Human-readable paths
- Easy CDN caching by prefix
- Simple backup/migration
- Matches style catalog slug structure

## Scaling Considerations

### Query Performance
**Current scale** (~1000 sessions, ~10 assets each):
- Existing indexes sufficient
- No partitioning needed

**At 100k sessions** (~1M assets):
- Consider partitioning room_assets by created_at (monthly/quarterly)
- Add partial indexes for hot queries (status = 'pending')
- Implement archive table for old sessions

### Storage Performance
**Current scale** (<10GB total):
- Supabase single region sufficient
- No CDN needed yet

**At 1TB+**:
- Enable Cloudflare CDN in front of Supabase Storage
- OR migrate to Cloudflare R2 with CDN
- Implement tiered storage (hot = Supabase, cold = S3 Glacier)

### Processing Queue
**When image optimization needed**:
- Use background job queue (BullMQ + Redis)
- Create variant processing on upload confirmation
- Update asset_variants table as processing completes
- Frontend polls or WebSocket notifications for status

## Migration Scripts

### Add asset_variants Table
```typescript
// backend/drizzle/migrations/0007_add_asset_variants.sql
CREATE TABLE asset_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_asset_id UUID NOT NULL REFERENCES room_assets(id) ON DELETE CASCADE,
  variant_type TEXT NOT NULL,
  format TEXT NOT NULL,
  quality INTEGER,
  storage_path TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  processing_error TEXT,
  processed_at TIMESTAMP,
  processing_config JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_variants_parent ON asset_variants(parent_asset_id);
CREATE INDEX idx_variants_type ON asset_variants(parent_asset_id, variant_type);
CREATE INDEX idx_variants_status ON asset_variants(processing_status);
```

### Add document_artifacts Table
```typescript
// backend/drizzle/migrations/0008_add_document_artifacts.sql
CREATE TABLE document_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES renovation_sessions(id) ON DELETE CASCADE,
  room_id UUID REFERENCES renovation_rooms(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  phase TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size INTEGER,
  generated_by TEXT,
  generation_prompt TEXT,
  template_version TEXT,
  page_count INTEGER,
  metadata JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  previous_version_id UUID REFERENCES document_artifacts(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE INDEX idx_docs_session ON document_artifacts(session_id);
CREATE INDEX idx_docs_room ON document_artifacts(room_id);
CREATE INDEX idx_docs_type ON document_artifacts(document_type);
CREATE INDEX idx_docs_phase ON document_artifacts(session_id, phase);
```

### Add Constraints to Existing Tables
```typescript
// backend/drizzle/migrations/0009_add_constraints_and_indexes.sql
ALTER TABLE room_assets
  ADD CONSTRAINT check_asset_type
  CHECK (asset_type IN ('photo', 'floorplan', 'render', 'document'));

ALTER TABLE room_assets
  ADD CONSTRAINT check_asset_status
  CHECK (status IN ('pending', 'uploaded', 'processing', 'ready', 'failed'));

ALTER TABLE room_assets
  ADD CONSTRAINT check_asset_source
  CHECK (source IN ('user_upload', 'pinterest', 'ai_generated'));

ALTER TABLE room_assets
  ADD CONSTRAINT check_file_size
  CHECK (file_size > 0 AND file_size <= 10485760);

ALTER TABLE style_images
  ADD CONSTRAINT check_dimensions
  CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0));

CREATE INDEX idx_room_assets_status ON room_assets(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_room_assets_source ON room_assets(source, asset_type);
CREATE INDEX idx_room_assets_pending_cleanup ON room_assets(created_at, status) WHERE status = 'pending';
CREATE INDEX idx_style_images_tags ON style_images USING GIN(tags);
```

## Implementation Roadmap

### Phase 1: Immediate (Current Sprint)
- ✅ Keep current room_assets and style_images tables
- ✅ Add constraints and indexes (migration 0007)
- Add cleanup job for pending assets (>1 hour old)

### Phase 2: Image Optimization (Next Sprint)
- Create asset_variants table (migration 0005)
- Implement VariantService with Sharp/Pillow
- Add background processing queue (BullMQ)
- Update frontend to request optimized variants

### Phase 3: Document Generation (Phase 3 PLAN)
- Create document_artifacts table (migration 0006)
- Implement DocumentService for PDF generation
- Add versioning logic
- Integrate with PLAN phase workflow

### Phase 4: AI Renders (Phase 4 RENDER)
- Extend room_assets metadata for render-specific fields
- Implement RenderService with AI model integration
- Add before/after comparison support
- Update frontend gallery components

### Phase 5: Optimization & Scaling (As Needed)
- Add Cloudflare CDN caching
- Implement tiered storage
- Add partitioning if asset count > 1M
- Consider R2 migration if costs become significant

## Monitoring & Observability

### Database Metrics to Track
```sql
-- Asset count by type
SELECT asset_type, COUNT(*) FROM room_assets GROUP BY asset_type;

-- Storage usage by session
SELECT session_id, SUM(file_size) as total_bytes
FROM room_assets
GROUP BY session_id
ORDER BY total_bytes DESC
LIMIT 10;

-- Pending uploads (should be cleaned up)
SELECT COUNT(*)
FROM room_assets
WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour';

-- Variant processing backlog
SELECT processing_status, COUNT(*)
FROM asset_variants
GROUP BY processing_status;
```

### Storage Metrics to Track
- Total storage used (GB)
- Bandwidth used (GB/month)
- Average file size by type
- Upload success rate (confirmed / requested)
- Variant generation success rate

### Alerts to Configure
- Pending uploads > 100 (processing queue stuck)
- Storage > 80% of quota
- Bandwidth > 80% of quota
- Failed variant generation rate > 5%

## Security Considerations

### Access Control
- **User uploads**: Require authentication, verify session ownership
- **Style images**: Public read, admin-only write
- **Document artifacts**: Require authentication, verify session ownership
- **Signed URLs**: 15-minute expiry for uploads, 1-hour for downloads

### Data Privacy
- PII in metadata: Store minimal data, avoid EXIF GPS coordinates
- Deletion: Hard delete from storage + DB (GDPR compliance)
- Retention: Consider auto-expire for abandoned sessions (>6 months inactive)

### Input Validation
- File type whitelist (no executables)
- File size limits (10MB for images, 50MB for PDFs)
- Filename sanitization (prevent path traversal)
- Content-Type verification (magic bytes check, not just extension)

## Cost Projections

### Supabase Storage Pricing (Paid Tier)
- Storage: $0.021/GB/month
- Bandwidth: $0.09/GB

**Example: 10k active sessions**
- Avg 20 assets per session = 200k assets
- Avg 500KB per asset = 100GB storage = $2.10/month
- Avg 10 downloads/asset/month = 2M downloads = 1000GB bandwidth = $90/month
- **Total: ~$92/month**

**Example: 100k active sessions**
- 2M assets
- 1TB storage = $21/month
- 10TB bandwidth = $900/month
- **Total: ~$921/month**

### Cost Optimization Strategies
1. **Aggressive compression**: WebP/AVIF reduces storage by 30-50%
2. **Lazy variant generation**: Only create thumbnails on first access
3. **CDN caching**: Cloudflare free tier caches hot assets
4. **Tiered storage**: Move old sessions to S3 Glacier ($0.004/GB)
5. **User bandwidth quotas**: Limit downloads for free tier users

## Answers to Original Questions

### 1. Separate vs Unified Tables?
**KEEP SEPARATE.** Different access patterns, lifecycles, and relationships justify the separation. room_assets for user content, style_images for catalog content.

### 2. How to Track Image Variants?
**NEW asset_variants TABLE** with parent-child relationship. Each variant (thumbnail, WebP, AVIF) is a separate row linked to original. Supports independent processing status and regeneration.

### 3. Indexes & Constraints for Scale?
**ADD:** Status indexes, source indexes, pending cleanup index, GIN index on tags, CHECK constraints for valid enums, file size constraints. See "Recommended Indexes & Constraints" section.

### 4. Generic Documents Table?
**YES - document_artifacts TABLE** for system-generated docs (PDFs, estimates, plans). User-uploaded docs stay in room_assets with assetType='document'. Separation supports versioning and phase-based generation.

### 5. Storage Path Organization?
**HIERARCHICAL by session/room** for user uploads: `session_{id}/room_{id}/{type}s/{file}`. Style images: `styles/{slug}/{file}`. See "Storage Path Organization Strategy" section.

### 6. Original vs Derivatives Relationship?
**PARENT-CHILD via asset_variants table.** Original in room_assets, variants reference parentAssetId. Cascade delete ensures cleanup. Variants stored in `/variants/` subfolder.

## Conclusion

The recommended architecture:
1. **Keeps** existing table separation (room_assets + style_images)
2. **Adds** asset_variants for image optimization
3. **Adds** document_artifacts for generated PDFs
4. **Enhances** indexes and constraints for performance/integrity
5. **Stays** with Supabase Storage (migration path documented)
6. **Scales** to 100k sessions with minimal changes

This design supports all current needs (user uploads, style catalog) and future requirements (optimization, PDFs, AI renders, video) with clear migration paths.
