# Phase 2.1 File Upload Pipeline - Implementation Plan

## Overview

- **Objective**: Enable users to upload room photos and floor plans during renovation intake, stored in Supabase Storage with metadata in PostgreSQL
- **Economic Value**: Foundation for visual AI analysis (Phase 2.6), renders (Phase 3), and paid tier (Phase 4)
- **Selected Approach**: Hybrid signed-URL flow (server validates → generates signed URL → client uploads direct → server confirms)

## Research Summary

- **Selected Approach**: Hybrid pre-signed URL flow — best balance of security, performance, and UX
- **Key Trade-offs**: Slightly more complex than direct upload, but gives server-side validation without proxy bandwidth cost
- **Dependencies**: Supabase Storage bucket must be created, `react-dropzone` frontend dependency
- **Full Research**: `docs/research/Phase_2.1_File_Upload_Pipeline_Research.md`

---

## Implementation Strategy

### Step 1: Database Schema & Migration
**Goal**: Create `room_assets` table and register in Drizzle schema

**Files to Create**:
- `backend/src/db/schema/assets.schema.ts`

**Files to Modify**:
- `backend/src/db/schema/index.ts` — add assets export

**Tasks**:
1. Create `room_assets` Drizzle schema with fields: id, roomId, assetType, storagePath, publicUrl, source, status, originalFilename, contentType, fileSize, uploadedBy, metadata, timestamps
2. Export from schema barrel file
3. Generate Drizzle migration: `npm run db:generate`
4. Run migration: `npm run db:migrate`

**Test Specifications**:
- Schema types compile correctly
- Migration runs without errors
- Can insert and query a room_assets record

---

### Step 2: Backend Asset Service
**Goal**: Business logic for asset CRUD and Supabase Storage interactions

**Files to Create**:
- `backend/src/services/asset.service.ts`

**Tasks**:
1. `AssetService` class following existing `RoomService` pattern
2. Methods:
   - `requestUpload(roomId, userId, { filename, contentType, fileSize, assetType })` — validates inputs, creates pending asset record, generates signed upload URL via Supabase admin client, returns `{ assetId, signedUrl, storagePath }`
   - `confirmUpload(assetId)` — verifies file exists in storage, updates status to `uploaded`, generates public URL
   - `getAssetsByRoom(roomId)` — returns all assets for a room
   - `getAssetById(assetId)` — returns single asset
   - `deleteAsset(assetId)` — removes from storage and database
3. Validation helpers:
   - `validateFileType(contentType, assetType)` — check MIME against allowed types
   - `validateFileSize(fileSize)` — enforce 10MB limit
   - `sanitizeFilename(filename)` — strip special chars, preserve extension
   - `buildStoragePath(userId, sessionId, roomId, assetType, filename)` — construct path

**Test Specifications**:
- Unit tests for all validation helpers
- Unit tests for service methods with mocked DB and Supabase
- Test file type validation rejects disallowed MIME types
- Test file size validation rejects >10MB
- Test filename sanitization strips dangerous characters
- Test storage path construction format

---

### Step 3: Backend Controller & Routes
**Goal**: REST API endpoints for the upload flow

**Files to Create**:
- `backend/src/controllers/asset.controller.ts`
- `backend/src/routes/asset.routes.ts`

**Files to Modify**:
- `backend/src/app.ts` — register asset routes

**API Endpoints**:
```
POST   /api/rooms/:roomId/assets/request-upload
  Body: { filename, contentType, fileSize, assetType }
  Returns: { assetId, signedUrl, storagePath, expiresAt }

POST   /api/rooms/:roomId/assets/:assetId/confirm
  Returns: { asset }

GET    /api/rooms/:roomId/assets
  Returns: { assets: RoomAsset[] }

GET    /api/rooms/:roomId/assets/:assetId
  Returns: { asset }

DELETE /api/rooms/:roomId/assets/:assetId
  Returns: { success: true }
```

**Tasks**:
1. Controller functions following `room.controller.ts` pattern (destructure, validate, call service, handle errors)
2. Routes with `authMiddleware`
3. Register in `app.ts`

**Test Specifications**:
- Integration tests for each endpoint
- Test auth middleware blocks unauthenticated requests
- Test validation returns 400 for invalid inputs
- Test 404 for non-existent room/asset

---

### Step 4: Environment Configuration
**Goal**: Add optional Supabase Storage config vars

**Files to Modify**:
- `backend/src/config/env.ts` — add `SUPABASE_STORAGE_BUCKET` optional string, add `isStorageEnabled()` helper

**Tasks**:
1. Add `SUPABASE_STORAGE_BUCKET` to Zod schema (optional, default: `room-assets`)
2. Add `isStorageEnabled()` helper (requires Supabase auth + bucket name)

**Test Specifications**:
- Env validates with and without storage vars
- `isStorageEnabled()` returns correct boolean

---

### Step 5: Frontend Upload Hook
**Goal**: React hook managing multi-file upload state and flow

**Files to Create**:
- `frontend/hooks/useFileUpload.ts`
- `frontend/lib/upload.ts`

**Tasks**:
1. `useFileUpload(roomId)` hook:
   - State: `files` (array with id, file, status, progress, error, assetId)
   - `addFiles(files: File[])` — validate client-side, add to queue
   - `uploadFile(fileId)` — request signed URL → upload via XHR → confirm
   - `uploadAll()` — upload all pending files
   - `removeFile(fileId)` — remove from queue or delete if uploaded
   - `clearCompleted()` — remove completed files from UI
2. `upload.ts` utilities:
   - `uploadWithProgress(url, file, onProgress)` — XHR-based upload with progress callback
   - `validateFile(file, assetType)` — client-side type/size validation
   - `generateThumbnail(file)` — canvas-based thumbnail for preview

**Test Specifications**:
- Hook manages file state correctly
- Client-side validation rejects invalid files
- Progress callback fires during upload
- Error states handled for failed uploads

---

### Step 6: Frontend Upload UI Component
**Goal**: Drag-and-drop upload zone integrated with chat

**Dependencies to Install**:
- `react-dropzone`

**Files to Create**:
- `frontend/components/chat/file-upload-zone.tsx`

**Files to Modify**:
- `frontend/components/chat/chat-input.tsx` — add attachment button that opens upload zone
- `frontend/types/renovation.ts` — add `RoomAsset` type

**Tasks**:
1. `FileUploadZone` component:
   - Drag-and-drop area with `react-dropzone`
   - Visual states: idle, drag-over, uploading, complete, error
   - File previews with thumbnails
   - Per-file progress bars
   - Remove/retry actions per file
   - Styled with shadcn/ui + design system tokens
   - Accessible (keyboard navigation, ARIA labels)
2. `ChatInput` modification:
   - Paperclip/attach button next to send button
   - Opens `FileUploadZone` above input area
   - Upload count badge when files are queued
3. `RoomAsset` type in frontend types

**Test Specifications**:
- Component renders in all states
- Drag-and-drop triggers file selection
- File previews display correctly
- Progress bars update during upload
- Error state shows retry option

---

### Step 7: Integration & E2E Flow
**Goal**: Wire everything together, ensure complete upload flow works

**Files to Modify**:
- `frontend/components/chat/chat-view.tsx` — show uploaded assets in context
- `frontend/components/chat/message-list.tsx` — render image messages

**Tasks**:
1. When user uploads photos in chat, create a system/assistant message acknowledging the upload
2. Display uploaded images as thumbnails in the message thread
3. Link uploaded assets to the current room context
4. Handle edge cases: upload during disconnection, session switching, concurrent uploads

**Test Specifications**:
- Full upload flow works: select files → progress → complete → visible in chat
- Assets persist across page refreshes
- Assets appear in room detail view
- Deleted assets are removed from storage and UI

---

## Success Metrics

### Technical
- All tests passing (unit + integration)
- Coverage >= 80% on new code
- Lint + type-check passing
- No `any` types

### Functional
- User can upload 1-5 photos per room via drag-and-drop or file picker
- Upload progress is visible per file
- Uploaded images display as thumbnails in chat and room view
- Files persist in Supabase Storage with correct path structure
- Asset metadata stored in `room_assets` table
- Invalid files (wrong type, too large) rejected with clear error messages
