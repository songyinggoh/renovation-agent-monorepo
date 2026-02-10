# Phase 2.1 File Upload Pipeline Research
**Date**: 2026-02-09
**Status**: Complete

## Problem Statement

Implement a multi-file upload pipeline enabling users to upload room photos and floor plans during the renovation intake phase. Files must be stored in Supabase Storage with metadata tracked in a new `room_assets` database table. The solution must integrate with the existing chat UX and room management system.

### Requirements
- Multi-file upload with progress indication
- Support for room photos (JPG/PNG/WEBP) and floor plans (JPG/PNG/PDF)
- Supabase Storage integration (bucket-based, organized by user/session/room)
- New `room_assets` table with Drizzle ORM schema
- Pre-signed URL flow for secure uploads
- Integration with existing chat and room management systems

---

## Current State Analysis

### What Already Exists

| Component | Status | Notes |
|-----------|--------|-------|
| Supabase client (frontend) | ✅ Ready | `@supabase/ssr` browser + server clients in `frontend/lib/supabase/` |
| Supabase admin (backend) | ✅ Ready | `backend/src/config/supabase.ts` — admin client with service role key |
| Rooms table + CRUD | ✅ Ready | Full routes, controller, service at `backend/src/{routes,controllers,services}/room.*` |
| Chat messages with image fields | ✅ Ready | `imageUrl`, `imageAnalysis`, `type: 'image'` fields in `chat_messages` |
| Socket.io (10MB buffer) | ✅ Ready | `maxHttpBufferSize: 10e6` already configured |
| Express body parser (10MB) | ✅ Ready | `express.json({ limit: '10mb' })` |
| Auth middleware | ✅ Ready | Supabase JWT verification, optional for phases 1-7 |
| `room_assets` table | ❌ Missing | Needs Drizzle schema + migration |
| File upload routes | ❌ Missing | No upload endpoints exist |
| File upload middleware | ❌ Missing | No multer/busboy installed |
| Frontend upload UI | ❌ Missing | ChatInput has text only, no file picker |
| Supabase Storage buckets | ❌ Missing | No buckets configured |

### Key Integration Points

1. **`chat_messages` table** already has `imageUrl`, `imageAnalysis`, and `type: 'image'` — can store uploaded image references in conversation context
2. **`renovation_rooms` table** has `renderUrls` JSONB field — already designed for image URL arrays
3. **Socket.io events** follow `chat:*` namespace — file events can use `file:*` namespace
4. **`fetchWithAuth()`** in `frontend/lib/api.ts` handles auth headers but sets `Content-Type: application/json` — needs extension for multipart

---

## Solution Vectors Evaluated

### Solution 1: Frontend Direct Upload via Supabase JS Client
**Description**: Frontend uses `supabase.storage.from('bucket').upload()` directly.

- **Pros**: Simplest implementation, no backend involvement, built-in progress events, Supabase handles auth via RLS
- **Cons**: Requires RLS policies on storage, less control over validation, metadata must be saved via separate API call
- **Complexity**: Low
- **Security**: Medium — relies on RLS policies, client-side validation only
- **Fit Score**: 7/10

```typescript
// Frontend direct upload
const { data, error } = await supabase.storage
  .from('room-assets')
  .upload(`${userId}/${sessionId}/${roomId}/${filename}`, file, {
    cacheControl: '3600',
    upsert: false,
  });
```

### Solution 2: Backend Pre-signed Upload URLs
**Description**: Backend generates signed upload URLs, frontend PUTs directly to Supabase Storage.

- **Pros**: Server-side validation before upload, no file data through backend, scalable, secure
- **Cons**: Two-step flow (get URL, then upload), more complex frontend logic, signed URL expiration handling
- **Complexity**: Medium
- **Security**: High — server validates permissions and file constraints before granting upload access
- **Fit Score**: 8/10

```typescript
// Backend generates signed URL
const { data } = await supabaseAdmin.storage
  .from('room-assets')
  .createSignedUploadUrl(`${userId}/${sessionId}/${roomId}/${filename}`);

// Frontend uploads directly
await fetch(data.signedUrl, { method: 'PUT', body: file });
```

### Solution 3: Backend Proxy Upload
**Description**: Frontend sends file to Express backend via multipart/form-data, backend streams to Supabase Storage.

- **Pros**: Full server-side control, validation, virus scanning possible, single API call
- **Cons**: Double bandwidth (client→backend→storage), backend memory pressure, requires multer, slower
- **Complexity**: Medium-High
- **Security**: Highest — full server-side inspection
- **Fit Score**: 6/10

```typescript
// Backend receives and forwards
router.post('/upload', multer().single('file'), async (req, res) => {
  const { data } = await supabaseAdmin.storage
    .from('room-assets')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype });
});
```

### Solution 4: Hybrid Approach (Recommended)
**Description**: Backend validates and generates signed upload URLs + saves metadata. Frontend uploads directly to Supabase Storage using the signed URL. After upload completes, frontend confirms to backend which saves the asset record.

- **Pros**: Best of all worlds — server-side validation, no proxy bandwidth, single metadata API, clean separation
- **Cons**: Three-step flow (request → upload → confirm), slightly more complex
- **Complexity**: Medium
- **Security**: High
- **Fit Score**: 9/10

**Flow**:
```
1. Frontend → POST /api/rooms/:roomId/assets/upload-url
   Body: { filename, contentType, fileSize, assetType }
   Backend validates: file type, size, room ownership, generates signed URL
   Returns: { signedUrl, storagePath, assetId }

2. Frontend → PUT signedUrl (direct to Supabase Storage)
   Tracks progress via XMLHttpRequest/fetch

3. Frontend → POST /api/rooms/:roomId/assets/:assetId/confirm
   Backend verifies file exists in storage, marks asset as 'uploaded'
```

---

## Recommended Approach: Solution 4 (Hybrid)

### Rationale
- **Security**: Server validates file constraints and room ownership before any upload
- **Performance**: No file data flows through Express — direct to Supabase Storage
- **UX**: Progress tracking via XHR upload events
- **Reliability**: Confirm step ensures metadata consistency
- **Scalability**: Backend stays lightweight, storage handles the heavy lifting

### Architecture

```
┌─────────────┐     1. Request URL      ┌──────────────┐
│   Frontend   │ ──────────────────────> │   Backend    │
│  (Next.js)   │ <────────────────────── │  (Express)   │
│              │   {signedUrl, assetId}  │              │
│              │                         │  Validates:  │
│              │     2. PUT file         │  - file type │
│              │ ──────────────────────> │  - file size │
│              │    (direct upload)      │  - ownership │
│              │                         └──────────────┘
│              │         ┌──────────────┐
│              │ ──────> │  Supabase    │
│              │         │  Storage     │
│              │         └──────────────┘
│              │
│              │     3. Confirm upload   ┌──────────────┐
│              │ ──────────────────────> │   Backend    │
└─────────────┘                         │  Saves asset │
                                        │  record in   │
                                        │  room_assets │
                                        └──────────────┘
```

---

## Database Schema Design

### New Table: `room_assets`

```typescript
// backend/src/db/schema/assets.schema.ts
import { pgTable, uuid, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';
import { renovationRooms } from './rooms.schema.js';
import { profiles } from './users.schema.js';

export const roomAssets = pgTable('room_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id')
    .notNull()
    .references(() => renovationRooms.id, { onDelete: 'cascade' }),

  assetType: text('asset_type').notNull(),
  // 'photo' | 'floorplan' | 'render' | 'material_sample' | 'inspiration'

  storagePath: text('storage_path').notNull(),
  // e.g., 'room-assets/{userId}/{sessionId}/{roomId}/{filename}'

  publicUrl: text('public_url'),
  // Cached public/signed URL for quick access

  source: text('source').notNull().default('user_upload'),
  // 'user_upload' | 'pinterest' | 'ai_generated'

  status: text('status').notNull().default('pending'),
  // 'pending' | 'uploaded' | 'processing' | 'ready' | 'failed'

  originalFilename: text('original_filename'),
  contentType: text('content_type'),
  fileSize: integer('file_size'), // bytes

  uploadedBy: uuid('uploaded_by')
    .references(() => profiles.id, { onDelete: 'set null' }),

  metadata: jsonb('metadata'),
  // { width, height, exif, thumbnailPath, aiAnalysis }

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type RoomAsset = typeof roomAssets.$inferSelect;
export type NewRoomAsset = typeof roomAssets.$inferInsert;
```

### Storage Bucket Structure

```
room-assets/
  └── {userId}/
      └── {sessionId}/
          └── {roomId}/
              ├── photos/
              │   ├── kitchen-before-001.jpg
              │   └── kitchen-before-002.jpg
              ├── floorplans/
              │   └── kitchen-layout.pdf
              └── renders/
                  └── kitchen-render-v1.webp
```

---

## File Validation Rules

| Constraint | Value | Enforcement |
|-----------|-------|-------------|
| Max file size | 10 MB per file | Backend (pre-upload validation) |
| Max files per room | 20 | Backend (count check) |
| Max files per upload batch | 5 | Frontend UX |
| Allowed photo types | `image/jpeg`, `image/png`, `image/webp` | Backend + Frontend |
| Allowed floorplan types | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` | Backend + Frontend |
| Max filename length | 255 chars | Backend |
| Filename sanitization | Strip special chars, preserve extension | Backend |

---

## Frontend Upload UX

### Component: `FileUploadZone`

**Approach**: Use `react-dropzone` for drag-and-drop with shadcn/ui styling.

**Features**:
- Drag-and-drop zone with visual feedback
- Click to browse files
- Image thumbnails preview before upload
- Per-file progress bars
- Error states per file (too large, wrong type)
- Integration with ChatInput (attachment button) or standalone in room edit view

**Library Options** (ranked by fit):
1. **Supabase UI Dropzone** — Official shadcn-based component. Install via `npx shadcn@latest add "https://supabase.com/ui/r/dropzone.json"`. Includes `useSupabaseUpload` hook. Best fit for Phase 8+ when auth is enabled.
2. **react-dropzone** — 10k+ stars, ~8KB, mature. Best for custom signed-URL flow (Phases 1-7). Wrap with shadcn/ui primitives.
3. **Dice UI File Upload** — shadcn-native, accessible, composable. Newer option.
4. **uploadthing** — Full-stack solution with own backend. Overkill when using Supabase Storage.

### Progress Tracking

Use `XMLHttpRequest` for upload progress (fetch API doesn't support upload progress):

```typescript
const uploadWithProgress = (url: string, file: File, onProgress: (pct: number) => void) => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => resolve(xhr.response));
    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.open('PUT', url);
    xhr.send(file);
  });
};
```

---

## Backend Implementation Plan

### New Files to Create

| File | Purpose |
|------|---------|
| `backend/src/db/schema/assets.schema.ts` | Drizzle schema for `room_assets` |
| `backend/src/services/asset.service.ts` | Business logic for asset CRUD + signed URLs |
| `backend/src/controllers/asset.controller.ts` | Express handlers for upload flow |
| `backend/src/routes/asset.routes.ts` | REST endpoints |

### Files to Modify

| File | Change |
|------|--------|
| `backend/src/db/schema/index.ts` | Add `assets.schema.js` export |
| `backend/src/app.ts` | Register asset routes |
| `backend/src/config/env.ts` | Add `SUPABASE_STORAGE_BUCKET` optional var |

### API Endpoints

```
POST   /api/rooms/:roomId/assets/request-upload
  Body: { filename, contentType, fileSize, assetType }
  Returns: { assetId, signedUrl, storagePath }

POST   /api/rooms/:roomId/assets/:assetId/confirm
  Returns: { asset: RoomAsset }

GET    /api/rooms/:roomId/assets
  Returns: { assets: RoomAsset[] }

GET    /api/rooms/:roomId/assets/:assetId
  Returns: { asset: RoomAsset }

DELETE /api/rooms/:roomId/assets/:assetId
  Returns: { success: true }
```

---

## Frontend Implementation Plan

### New Files to Create

| File | Purpose |
|------|---------|
| `frontend/components/chat/file-upload-zone.tsx` | Drag-and-drop upload component |
| `frontend/hooks/useFileUpload.ts` | Upload state management hook |
| `frontend/lib/upload.ts` | Upload utilities (progress, validation) |

### Files to Modify

| File | Change |
|------|--------|
| `frontend/components/chat/chat-input.tsx` | Add attachment/upload button |
| `frontend/components/chat/chat-view.tsx` | Show upload previews in message area |
| `frontend/types/renovation.ts` | Add `RoomAsset` type |
| `frontend/package.json` | Add `react-dropzone` dependency |

---

## Image Optimization

### Client-Side Compression
Compress images before upload using `browser-image-compression`. Room photos from phones are often 5-15 MB; compressing to ~2 MB at 80% quality retains sufficient detail while reducing upload time and storage costs.

```typescript
import imageCompression from 'browser-image-compression';

async function compressBeforeUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file; // Skip PDFs
  const options = { maxSizeMB: 2, maxWidthOrHeight: 3840, useWebWorker: true, initialQuality: 0.8 };
  const compressed = await imageCompression(file, options);
  return compressed.size < file.size ? compressed : file;
}
```

### Thumbnails
Use Supabase on-the-fly image transformations (Pro plan) rather than pre-generating thumbnails:
```typescript
const { data } = supabase.storage.from('room-assets')
  .createSignedUrl(path, 3600, { transform: { width: 200, height: 200, resize: 'cover', quality: 60 } });
```

---

## Dependencies to Install

### Backend
- None required (Supabase admin client already installed handles Storage API)

### Frontend
- `react-dropzone` — drag-and-drop file input
- `browser-image-compression` — client-side image compression before upload

---

## Security Considerations

1. **Server-side file type validation** — check MIME type and file extension match
2. **File size enforcement** — reject before generating signed URL
3. **Path sanitization** — prevent path traversal in filenames
4. **Room ownership verification** — ensure user owns the session containing the room
5. **Signed URL expiration** — 15-minute TTL for upload URLs
6. **Storage RLS policies** — restrict bucket access by authenticated user
7. **Content-Type enforcement** — signed URL should lock content type

---

## Strategic Evaluation

### Goals Alignment
- **Phase 2 objective**: Move from text-only to visual intake — file upload is the foundation
- **Unblocks**: Style moodboards (2.3), AI vision analysis (2.6), renders (Phase 3)
- **User value**: Enables photo-based renovation planning, the core product differentiator

### Economic Value
- Directly enables the paid tier (Phase 4) — renders and PDFs require room photos
- Reduces back-and-forth — photos convey room context better than text descriptions

### Implementation Feasibility
- **Risk**: Low — well-understood patterns, Supabase Storage is mature
- **Effort**: Medium — ~8-12 files to create/modify, 1 migration
- **Dependencies**: Supabase project must have Storage enabled (may need bucket creation via dashboard or migration)
