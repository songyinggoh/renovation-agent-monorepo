# Database Architecture Implementation Guide

## Quick Start

### 1. Review Architecture Documents
- `database-storage-architecture.md` - Full design rationale and decisions
- `database-schema-diagram.md` - Visual overview and ER diagram
- This file (IMPLEMENTATION_GUIDE.md) - Step-by-step implementation

### 2. Apply Migrations (When Ready)

**IMPORTANT**: These migrations are provided for future implementation. Do NOT run them until you're ready to implement image optimization and document generation features.

```bash
cd backend

# Review migrations first
cat drizzle/migrations/0007_add_asset_variants.sql
cat drizzle/migrations/0008_add_document_artifacts.sql
cat drizzle/migrations/0009_add_constraints_and_indexes.sql

# When ready to implement:
npm run db:migrate
```

### 3. Verify Schema Updates

The following schema files have been created/updated:
- ✅ `src/db/schema/asset-variants.schema.ts` (new)
- ✅ `src/db/schema/document-artifacts.schema.ts` (new)
- ✅ `src/db/schema/index.ts` (updated with exports)

## Implementation Phases

### Phase 1: Immediate (Current Sprint) - DONE ✅
These are already implemented in your codebase:
- ✅ `room_assets` table for user uploads
- ✅ `style_images` table for curated moodboards
- ✅ AssetService with upload/confirm flow
- ✅ StyleImageService with seeding support

**Optional Enhancements**:
- Add constraints from migration 0007 (improves data integrity)
- Add cleanup job for abandoned pending uploads

### Phase 2: Image Optimization (Next Sprint)
**Goal**: Generate thumbnails and WebP/AVIF variants automatically

**Steps**:
1. Run migration 0005 (asset_variants table)
2. Install image processing library:
   ```bash
   npm install sharp
   # or for Python: pip install Pillow
   ```
3. Create VariantService:
   ```typescript
   // backend/src/services/variant.service.ts
   import sharp from 'sharp';
   import { assetVariants, type NewAssetVariant } from '../db/schema/index.js';

   export class VariantService {
     async generateThumbnail(assetId: string): Promise<AssetVariant> {
       // 1. Fetch parent asset
       // 2. Download from Supabase Storage
       // 3. Resize with sharp to 300x200
       // 4. Upload to variants/ subfolder
       // 5. Insert into asset_variants
     }

     async generateWebP(assetId: string): Promise<AssetVariant> {
       // Similar to thumbnail but full-size WebP conversion
     }
   }
   ```
4. Add background processing:
   ```bash
   npm install bullmq ioredis
   ```
5. Create processing queue:
   ```typescript
   // backend/src/queues/variant-processor.ts
   import { Queue, Worker } from 'bullmq';

   const variantQueue = new Queue('variants', { connection: redisConnection });

   // After upload confirmation:
   await variantQueue.add('generate-thumbnail', { assetId });
   await variantQueue.add('generate-webp', { assetId });

   // Worker processes these jobs
   const worker = new Worker('variants', async (job) => {
     const variantService = new VariantService();
     if (job.name === 'generate-thumbnail') {
       await variantService.generateThumbnail(job.data.assetId);
     }
   });
   ```
6. Update frontend to use variants:
   ```typescript
   // Request thumbnail instead of full image for gallery
   const thumbnailUrl = await api.getAssetVariant(assetId, 'thumbnail');
   ```

### Phase 3: Document Generation (Phase 3 PLAN)
**Goal**: Generate PDF checklists and renovation plans

**Steps**:
1. Run migration 0006 (document_artifacts table)
2. Install PDF generation library:
   ```bash
   npm install pdfkit
   # or: npm install puppeteer (for HTML → PDF)
   ```
3. Create DocumentService:
   ```typescript
   // backend/src/services/document.service.ts
   import PDFDocument from 'pdfkit';
   import { documentArtifacts } from '../db/schema/index.js';

   export class DocumentService {
     async generateChecklistPdf(sessionId: string): Promise<DocumentArtifact> {
       // 1. Fetch checklist data from DB
       // 2. Generate PDF with PDFKit or Puppeteer
       // 3. Upload to session_{id}/artifacts/checklist_v1.pdf
       // 4. Insert into document_artifacts
       // 5. Return download URL
     }

     async generatePlanPdf(sessionId: string, planData: unknown): Promise<DocumentArtifact> {
       // Similar to checklist
     }
   }
   ```
4. Add endpoints:
   ```typescript
   // backend/src/routes/document.routes.ts
   router.post('/sessions/:sessionId/documents/checklist', async (req, res) => {
     const doc = await documentService.generateChecklistPdf(req.params.sessionId);
     res.json({ documentId: doc.id, downloadUrl: /* signed URL */ });
   });
   ```

### Phase 4: AI Renders (Phase 4 RENDER)
**Goal**: Store AI-generated room renders

**Steps**:
1. No new tables needed (use existing `room_assets` with `assetType='render'`)
2. Enhance metadata for renders:
   ```typescript
   const renderMetadata: AssetMetadata = {
     prompt: 'Modern minimalist kitchen with white cabinets',
     modelVersion: 'stable-diffusion-xl',
     seed: 12345,
     renderType: 'ai_generated',
     basedOnAssetId: originalPhotoId, // Reference to before photo
     beforeAssetId: originalPhotoId,
     afterAssetId: renderId,
     approvalStatus: 'pending_review',
   };
   ```
3. Add render generation endpoint:
   ```typescript
   router.post('/sessions/:sessionId/rooms/:roomId/render', async (req, res) => {
     // 1. Call AI model (Gemini Imagen, Stable Diffusion, etc.)
     // 2. Upload render to storage
     // 3. Create room_assets record with assetType='render'
     // 4. Optionally create before/after comparison
   });
   ```

## Database Queries Cheat Sheet

### Get All Assets for a Room (Gallery)
```typescript
const assets = await db
  .select()
  .from(roomAssets)
  .where(eq(roomAssets.roomId, roomId))
  .orderBy(roomAssets.displayOrder, roomAssets.createdAt);
```

### Get Asset with Thumbnail Variant
```typescript
const asset = await db
  .select({
    asset: roomAssets,
    thumbnail: assetVariants,
  })
  .from(roomAssets)
  .leftJoin(assetVariants, and(
    eq(assetVariants.parentAssetId, roomAssets.id),
    eq(assetVariants.variantType, 'thumbnail'),
    eq(assetVariants.processingStatus, 'ready')
  ))
  .where(eq(roomAssets.id, assetId));
```

### Get All Variants for an Asset
```typescript
const variants = await db
  .select()
  .from(assetVariants)
  .where(eq(assetVariants.parentAssetId, assetId))
  .orderBy(assetVariants.createdAt);
```

### Get Documents for a Session
```typescript
const docs = await db
  .select()
  .from(documentArtifacts)
  .where(eq(documentArtifacts.sessionId, sessionId))
  .orderBy(desc(documentArtifacts.createdAt));
```

### Get Latest Version of a Document
```typescript
const latestPlan = await db
  .select()
  .from(documentArtifacts)
  .where(and(
    eq(documentArtifacts.sessionId, sessionId),
    eq(documentArtifacts.documentType, 'plan_pdf')
  ))
  .orderBy(desc(documentArtifacts.version))
  .limit(1);
```

### Cleanup Abandoned Uploads (Cron Job)
```typescript
// Delete pending uploads older than 1 hour
const abandoned = await db
  .delete(roomAssets)
  .where(and(
    eq(roomAssets.status, 'pending'),
    sql`created_at < NOW() - INTERVAL '1 hour'`
  ))
  .returning();

// Also delete from Supabase Storage
for (const asset of abandoned) {
  await supabaseAdmin.storage
    .from(bucketName)
    .remove([asset.storagePath]);
}
```

### Find Failed Variant Processing
```typescript
const failed = await db
  .select()
  .from(assetVariants)
  .where(eq(assetVariants.processingStatus, 'failed'))
  .orderBy(desc(assetVariants.createdAt));
```

## Storage Operations

### Upload Original Asset (Existing)
```typescript
// 1. Request upload
const { assetId, signedUrl } = await assetService.requestUpload({
  sessionId, roomId, filename, contentType, fileSize, assetType: 'photo'
});

// 2. Frontend uploads to signedUrl
await fetch(signedUrl, { method: 'PUT', body: file });

// 3. Confirm upload
await assetService.confirmUpload(assetId);
```

### Generate Thumbnail Variant (New)
```typescript
// 1. Fetch original asset
const asset = await assetService.getAssetById(assetId);
if (!asset) throw new Error('Asset not found');

// 2. Download from storage
const { data: fileData } = await supabaseAdmin.storage
  .from(bucketName)
  .download(asset.storagePath);

// 3. Process with Sharp
const thumbnail = await sharp(await fileData.arrayBuffer())
  .resize(300, 200, { fit: 'cover' })
  .webp({ quality: 80 })
  .toBuffer();

// 4. Upload variant
const variantPath = asset.storagePath.replace(/\/([^\/]+)$/, '/variants/$1_thumb_300x200.webp');
await supabaseAdmin.storage
  .from(bucketName)
  .upload(variantPath, thumbnail, { contentType: 'image/webp' });

// 5. Create variant record
await db.insert(assetVariants).values({
  parentAssetId: assetId,
  variantType: 'thumbnail',
  format: 'webp',
  storagePath: variantPath,
  contentType: 'image/webp',
  fileSize: thumbnail.length,
  width: 300,
  height: 200,
  processingStatus: 'ready',
  processedAt: new Date(),
  processingConfig: { quality: 80, maxWidth: 300, maxHeight: 200 }
});
```

### Generate PDF Document (New)
```typescript
import PDFDocument from 'pdfkit';

// 1. Create PDF
const doc = new PDFDocument();
const chunks: Buffer[] = [];
doc.on('data', chunk => chunks.push(chunk));
doc.on('end', () => { /* PDF complete */ });

doc.fontSize(24).text('Renovation Checklist', { align: 'center' });
doc.fontSize(12).text('Session: Kitchen Renovation');
// ... add content ...
doc.end();

const pdfBuffer = Buffer.concat(chunks);

// 2. Upload to storage
const storagePath = `session_${sessionId}/artifacts/checklist_v1.pdf`;
await supabaseAdmin.storage
  .from(bucketName)
  .upload(storagePath, pdfBuffer, { contentType: 'application/pdf' });

// 3. Create document record
await db.insert(documentArtifacts).values({
  sessionId,
  documentType: 'checklist_pdf',
  phase: 'CHECKLIST',
  storagePath,
  filename: 'checklist_v1.pdf',
  fileSize: pdfBuffer.length,
  generatedBy: 'ai',
  version: 1,
});
```

## Monitoring Dashboard Queries

### Storage Usage by Session
```sql
SELECT
  s.id,
  s.title,
  COUNT(ra.id) as asset_count,
  SUM(ra.file_size) as total_bytes,
  ROUND(SUM(ra.file_size) / 1024.0 / 1024.0, 2) as total_mb
FROM renovation_sessions s
LEFT JOIN room_assets ra ON ra.session_id = s.id
GROUP BY s.id, s.title
ORDER BY total_bytes DESC
LIMIT 10;
```

### Variant Processing Status
```sql
SELECT
  processing_status,
  variant_type,
  COUNT(*) as count
FROM asset_variants
GROUP BY processing_status, variant_type
ORDER BY processing_status, variant_type;
```

### Asset Type Distribution
```sql
SELECT
  asset_type,
  source,
  status,
  COUNT(*) as count
FROM room_assets
GROUP BY asset_type, source, status
ORDER BY asset_type, source, status;
```

## Testing Strategy

### Unit Tests (AssetVariants)
```typescript
describe('VariantService', () => {
  it('should generate thumbnail variant', async () => {
    const asset = await createTestAsset({ assetType: 'photo' });
    const variant = await variantService.generateThumbnail(asset.id);

    expect(variant.variantType).toBe('thumbnail');
    expect(variant.format).toBe('webp');
    expect(variant.processingStatus).toBe('ready');
    expect(variant.width).toBe(300);
    expect(variant.height).toBe(200);
  });

  it('should handle processing failures', async () => {
    const asset = await createTestAsset({ contentType: 'invalid/type' });

    await expect(variantService.generateThumbnail(asset.id))
      .rejects.toThrow('Unsupported image format');

    const variant = await db.select().from(assetVariants)
      .where(eq(assetVariants.parentAssetId, asset.id));

    expect(variant[0].processingStatus).toBe('failed');
  });
});
```

### Integration Tests (DocumentArtifacts)
```typescript
describe('DocumentService', () => {
  it('should generate checklist PDF', async () => {
    const session = await createTestSession();
    const doc = await documentService.generateChecklistPdf(session.id);

    expect(doc.documentType).toBe('checklist_pdf');
    expect(doc.phase).toBe('CHECKLIST');
    expect(doc.fileSize).toBeGreaterThan(0);

    // Verify file exists in storage
    const { data, error } = await supabaseAdmin.storage
      .from(bucketName)
      .download(doc.storagePath);

    expect(error).toBeNull();
    expect(data).toBeDefined();
  });

  it('should version documents correctly', async () => {
    const session = await createTestSession();

    const v1 = await documentService.generatePlanPdf(session.id, { plan: 'v1' });
    const v2 = await documentService.generatePlanPdf(session.id, { plan: 'v2' });

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v2.previousVersionId).toBe(v1.id);
  });
});
```

## Common Pitfalls & Solutions

### Pitfall 1: Storage Path Collisions
**Problem**: Multiple uploads with same filename
**Solution**: Use timestamp prefix (already implemented in buildStoragePath)
```typescript
const storagePath = `session_${id}/room_${id}/${type}s/${Date.now()}_${filename}`;
```

### Pitfall 2: Orphaned Storage Files
**Problem**: DB record deleted but file remains in storage
**Solution**: Always delete from storage first, then DB
```typescript
// Delete storage first
await supabaseAdmin.storage.from(bucket).remove([path]);
// Then delete DB record
await db.delete(roomAssets).where(eq(roomAssets.id, assetId));
```

### Pitfall 3: Missing Cascade Deletes
**Problem**: Variants not deleted when parent asset deleted
**Solution**: Use ON DELETE CASCADE (already in schema)
```sql
parent_asset_id UUID REFERENCES room_assets(id) ON DELETE CASCADE
```

### Pitfall 4: Large Transaction Timeouts
**Problem**: Processing 100 variants in one transaction times out
**Solution**: Process in batches with individual transactions
```typescript
const pending = await db.select().from(assetVariants)
  .where(eq(assetVariants.processingStatus, 'pending'))
  .limit(10);

for (const variant of pending) {
  await processVariant(variant.id); // Individual transaction
}
```

## Next Steps

1. **Review the architecture docs** to understand design decisions
2. **Add constraints** (migration 0007) if you want immediate data integrity improvements
3. **Plan Phase 2** (image optimization) - when you're ready to implement thumbnails/WebP
4. **Plan Phase 3** (document generation) - when Phase 3 PLAN is active

## Questions?

Refer to:
- `database-storage-architecture.md` - Full design rationale
- `database-schema-diagram.md` - Visual ER diagram and examples
- This guide (IMPLEMENTATION_GUIDE.md) - Step-by-step how-to

All migration files are ready to run when you're ready to implement the features.
