# Database Schema Architecture - Visual Overview

## Entity Relationship Diagram (Text Format)

```
┌─────────────────────┐
│ profiles            │
│ (users)             │
├─────────────────────┤
│ • id (PK)           │
│ • email             │
│ • ...               │
└──────────┬──────────┘
           │
           │ userId (FK, nullable)
           │
┌──────────▼──────────┐
│ renovation_sessions │
├─────────────────────┤
│ • id (PK)           │─────────┐
│ • userId (FK)       │         │
│ • title             │         │
│ • phase             │         │
│ • totalBudget       │         │
│ • stylePreferences  │         │
└──────────┬──────────┘         │
           │                    │
           │ sessionId (FK)     │ sessionId (FK)
           │                    │
┌──────────▼──────────┐         │
│ renovation_rooms    │         │
├─────────────────────┤         │
│ • id (PK)           │─────┐   │
│ • sessionId (FK)    │     │   │
│ • name              │     │   │
│ • type              │     │   │
│ • budget            │     │   │
│ • requirements      │     │   │
└─────────────────────┘     │   │
                            │   │
           ┌────────────────┘   │
           │ roomId (FK)        │
           │                    │
┌──────────▼──────────┐         │
│ room_assets         │         │
│ (USER UPLOADS)      │         │
├─────────────────────┤         │
│ • id (PK)           │─────┐   │
│ • sessionId (FK)    │     │   │
│ • roomId (FK)       │     │   │
│ • uploadedBy (FK)   │     │   │
│ • assetType         │     │   │
│ • storagePath       │     │   │
│ • source            │     │   │
│ • status            │     │   │
│ • contentType       │     │   │
│ • fileSize          │     │   │
│ • metadata (JSONB)  │     │   │
└─────────────────────┘     │   │
                            │   │
           ┌────────────────┘   │
           │ parentAssetId (FK) │
           │                    │
┌──────────▼──────────┐         │
│ asset_variants      │         │
│ (PROCESSED IMAGES)  │         │
├─────────────────────┤         │
│ • id (PK)           │         │
│ • parentAssetId (FK)│         │
│ • variantType       │         │
│ • format            │         │
│ • storagePath       │         │
│ • processingStatus  │         │
│ • width/height      │         │
│ • processingConfig  │         │
└─────────────────────┘         │
                                │
                                │
           ┌────────────────────┘
           │ sessionId (FK)
           │
┌──────────▼──────────┐
│ document_artifacts  │
│ (GENERATED DOCS)    │
├─────────────────────┤
│ • id (PK)           │
│ • sessionId (FK)    │
│ • roomId (FK, null) │
│ • documentType      │
│ • phase             │
│ • storagePath       │
│ • generatedBy       │
│ • version           │
│ • previousVersionId │
│ • expiresAt         │
└─────────────────────┘


┌─────────────────────┐
│ style_catalog       │
│ (SEPARATE DOMAIN)   │
├─────────────────────┤
│ • id (PK)           │─────┐
│ • slug              │     │
│ • name              │     │
│ • description       │     │
└─────────────────────┘     │
                            │ styleId (FK)
                            │
┌───────────────────────────▼─┐
│ style_images                │
│ (CURATED MOODBOARDS)        │
├─────────────────────────────┤
│ • id (PK)                   │
│ • styleId (FK)              │
│ • storagePath               │
│ • contentType               │
│ • width/height              │
│ • roomType                  │
│ • tags (JSONB)              │
└─────────────────────────────┘
```

## Table Hierarchy & Purposes

### User Content Domain
```
SESSION (renovation project)
  ├── ROOMS (individual spaces)
  │     └── ASSETS (user uploads: photos, floorplans, renders, docs)
  │           └── VARIANTS (thumbnails, WebP, AVIF conversions)
  └── DOCUMENTS (generated PDFs: plans, checklists, estimates)
```

### Catalog Domain (Separate)
```
STYLES (design styles)
  └── STYLE_IMAGES (curated moodboard photos)
```

## Storage Architecture

### User Uploads Bucket (Private)
```
user-uploads/
├── session_{uuid}/
│   ├── room_{uuid}/
│   │   ├── photos/
│   │   │   ├── 1234567890_kitchen.jpg        ← Original (room_assets)
│   │   │   └── variants/
│   │   │       ├── 1234567890_kitchen_thumb_300x200.webp   ← Variant
│   │   │       └── 1234567890_kitchen_optimized_1200x.avif ← Variant
│   │   ├── floorplans/
│   │   ├── renders/
│   │   └── documents/
│   └── artifacts/
│       ├── checklist_v1.pdf     ← Document Artifact
│       ├── plan_v2.pdf          ← Document Artifact
│       └── estimate.pdf         ← Document Artifact
```

### Style Images Bucket (Public)
```
styles/
├── modern-minimalist/
│   ├── kitchen_01.jpg
│   ├── living_01.jpg
│   └── bedroom_01.jpg
├── industrial-chic/
└── coastal-contemporary/
```

## Asset Types & Storage Mapping

| Asset Category | Table | Bucket | Access | Purpose |
|----------------|-------|--------|--------|---------|
| User Photos | `room_assets` | user-uploads (private) | Signed URL | Before photos, inspiration |
| User Floorplans | `room_assets` | user-uploads (private) | Signed URL | Room dimensions, layouts |
| AI Renders | `room_assets` | user-uploads (private) | Signed URL | Generated visualizations |
| User PDFs | `room_assets` | user-uploads (private) | Signed URL | Contractor quotes, docs |
| Thumbnails | `asset_variants` | user-uploads (private) | Signed URL | Fast loading previews |
| Optimized Images | `asset_variants` | user-uploads (private) | Signed URL | WebP/AVIF conversions |
| Generated PDFs | `document_artifacts` | user-uploads (private) | Signed URL | AI plans, checklists |
| Style Moodboards | `style_images` | styles (public) | Public URL | Design inspiration catalog |

## Data Flow Examples

### Upload Flow (User Photo)
```
1. Frontend → POST /api/assets/request-upload
   ↓
2. AssetService.requestUpload()
   ↓
3. INSERT INTO room_assets (status='pending')
   ↓
4. Supabase.createSignedUploadUrl()
   ↓
5. Return { assetId, signedUrl, token }
   ↓
6. Frontend → PUT to signedUrl (uploads file)
   ↓
7. Frontend → POST /api/assets/{assetId}/confirm
   ↓
8. AssetService.confirmUpload()
   ↓
9. UPDATE room_assets SET status='uploaded'
   ↓
10. Background job: Generate variants (thumbnail, WebP)
   ↓
11. INSERT INTO asset_variants (parentAssetId, variantType='thumbnail')
```

### Variant Processing Flow
```
1. Background worker fetches pending variants
   ↓
2. UPDATE asset_variants SET processingStatus='processing'
   ↓
3. Download original from Supabase Storage
   ↓
4. Process with Sharp/Pillow (resize, convert, optimize)
   ↓
5. Upload variant to storage_path
   ↓
6. UPDATE asset_variants SET processingStatus='ready', processedAt=NOW()
   ↓
7. Frontend polls or receives WebSocket notification
```

### Document Generation Flow (Phase 3 PLAN)
```
1. AI generates renovation plan data (JSON)
   ↓
2. DocumentService.generatePlanPdf(sessionId, planData)
   ↓
3. Template engine renders PDF (Puppeteer, PDFKit, etc.)
   ↓
4. Upload PDF to storage: session_{id}/artifacts/plan_v1.pdf
   ↓
5. INSERT INTO document_artifacts (sessionId, documentType='plan_pdf', version=1)
   ↓
6. Return signed download URL to frontend
```

## Index Strategy Summary

### High-Traffic Queries
```sql
-- Get all assets for a room (gallery view)
SELECT * FROM room_assets WHERE room_id = ?;
-- Index: idx_room_assets_room ✓

-- Get thumbnail variant for an asset
SELECT * FROM asset_variants WHERE parent_asset_id = ? AND variant_type = 'thumbnail';
-- Index: idx_variants_type (parent_asset_id, variant_type) ✓

-- Get all pending processing tasks
SELECT * FROM asset_variants WHERE processing_status = 'pending';
-- Index: idx_variants_status ✓

-- Get style images for a room type
SELECT * FROM style_images WHERE style_id = ? AND room_type = ?;
-- Index: idx_style_images_room_type (style_id, room_type) ✓

-- Get documents for a phase
SELECT * FROM document_artifacts WHERE session_id = ? AND phase = ?;
-- Index: idx_docs_phase (session_id, phase) ✓
```

### Cleanup Queries
```sql
-- Find abandoned uploads (pending > 1 hour)
SELECT * FROM room_assets WHERE status = 'pending' AND created_at < NOW() - INTERVAL '1 hour';
-- Index: idx_room_assets_pending_cleanup (created_at, status) WHERE status='pending' ✓

-- Find expired documents
SELECT * FROM document_artifacts WHERE expires_at < NOW();
-- Index: idx_docs_expired (expires_at) ✓
```

## Constraints & Data Integrity

### Enums (CHECK Constraints)
```sql
-- Asset types
room_assets.asset_type IN ('photo', 'floorplan', 'render', 'document')

-- Asset statuses
room_assets.status IN ('pending', 'uploaded', 'processing', 'ready', 'failed')

-- Asset sources
room_assets.source IN ('user_upload', 'pinterest', 'ai_generated')

-- Variant types
asset_variants.variant_type IN ('thumbnail', 'optimized', 'webp', 'avif', ...)

-- Processing statuses
asset_variants.processing_status IN ('pending', 'processing', 'ready', 'failed')

-- Document types
document_artifacts.document_type IN ('checklist_pdf', 'plan_pdf', 'estimate_pdf', ...)
```

### Business Rules
```sql
-- File size limits (10MB for assets)
room_assets.file_size > 0 AND file_size <= 10485760

-- Positive dimensions
style_images.width > 0 AND height > 0 (if not null)

-- Valid dimensions
asset_variants.width > 0 AND height > 0 (if not null)
```

### Cascading Deletes
```
DELETE session
  ↓ CASCADE
  DELETE rooms, room_assets, document_artifacts
    ↓ CASCADE
    DELETE asset_variants (parent_asset_id → room_assets)
```

## Migration Order

When implementing these changes, run migrations in this order:

1. **0007_add_asset_variants.sql**
   - Creates asset_variants table
   - Adds indexes
   - No dependencies (references existing room_assets)

2. **0008_add_document_artifacts.sql**
   - Creates document_artifacts table
   - Adds indexes
   - No dependencies (references existing tables)

3. **0009_add_constraints_and_indexes.sql**
   - Adds CHECK constraints to room_assets
   - Adds CHECK constraints to style_images
   - Adds performance indexes
   - Must run after tables exist

## Future Extensions (Not Yet Implemented)

### Asset Comparisons (Before/After)
```sql
CREATE TABLE asset_comparisons (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES renovation_sessions,
  room_id UUID REFERENCES renovation_rooms,
  before_asset_id UUID REFERENCES room_assets,
  after_asset_id UUID REFERENCES room_assets,
  title TEXT,
  display_order INTEGER
);
```

### Video Assets (Future)
```sql
CREATE TABLE asset_videos (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  room_id UUID,
  video_type TEXT, -- 'walkthrough' | 'tutorial' | 'timelapse'
  storage_path TEXT NOT NULL,
  duration INTEGER, -- seconds
  transcoding_status TEXT,
  hls_manifest_url TEXT,
  thumbnail_url TEXT,
  resolutions JSONB -- ['360p', '720p', '1080p']
);
```

## Key Takeaways

1. **Separation of Concerns**: User content (room_assets) vs catalog (style_images) vs generated docs (document_artifacts)

2. **Parent-Child Pattern**: Variants reference originals, documents reference sessions/rooms

3. **Status Tracking**: All mutable entities have status fields (pending → processing → ready)

4. **Cascade Safety**: Foreign keys with ON DELETE CASCADE for automatic cleanup

5. **Storage Path Uniqueness**: Every file has unique storagePath (prevents collisions)

6. **JSONB Flexibility**: metadata/tags/processingConfig allow extension without schema changes

7. **Index Strategy**: Composite indexes for hot queries, partial indexes for cleanup

8. **Constraints for Integrity**: CHECK constraints enforce valid enums and business rules
