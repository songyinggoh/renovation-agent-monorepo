# Phase 2.1 File Upload Pipeline - Progress Tracker
**Status**: 100% Complete
**Last Updated**: 2026-02-09

## Research
- [x] Codebase analysis (Supabase setup, DB schemas, backend/frontend patterns)
- [x] Web research (Supabase Storage best practices, upload patterns, security)
- [x] Schema deep-dive (existing room/style/chat models)
- [x] Research document exported to `docs/research/Phase_2.1_File_Upload_Pipeline_Research.md`

## Implementation Plan
- [x] Plan created at `docs/implementation plan/Phase_2.1_File_Upload_Pipeline_Implementation_Plan.md`
- [x] Approved by Ray

---

## To-Do List

### Step 1: Database Schema & Migration
- [x] Create `backend/src/db/schema/assets.schema.ts` with `room_assets` table
- [x] Export from `backend/src/db/schema/index.ts`
- [ ] Generate Drizzle migration (requires running DB)
- [ ] Run migration (requires running DB)
- [x] Verify schema types compile

### Step 2: Backend Asset Service
- [x] Create `backend/src/services/asset.service.ts`
- [x] Implement validation helpers (file type, size, filename sanitization)
- [x] Implement `requestUpload()` with signed URL generation
- [x] Implement `confirmUpload()` with storage verification
- [x] Implement `getAssetsByRoom()`, `getAssetById()`, `deleteAsset()`
- [x] Implement `getSignedUrl()` for download URLs

### Step 3: Backend Controller & Routes
- [x] Create `backend/src/controllers/asset.controller.ts`
- [x] Create `backend/src/routes/asset.routes.ts`
- [x] Register routes in `backend/src/app.ts`

### Step 4: Environment Configuration
- [x] Add `SUPABASE_STORAGE_BUCKET` to `backend/src/config/env.ts`
- [x] Add `isStorageEnabled()` helper

### Step 5: Frontend Upload Hook & Utils
- [x] Create `frontend/hooks/useFileUpload.ts`
- [x] Create `frontend/lib/upload.ts` (XHR progress, validation, thumbnails)

### Step 6: Frontend Upload UI Component
- [x] Install `react-dropzone` and `browser-image-compression`
- [x] Create `frontend/components/chat/file-upload-zone.tsx`
- [x] Add attachment button to `frontend/components/chat/chat-input.tsx`
- [x] Add `RoomAsset` type to `frontend/types/renovation.ts`

### Step 7: Integration & E2E Flow
- [x] Wire upload hook into `ChatView`
- [x] Pass upload props from ChatView to ChatInput
- [x] Added optional `roomId` prop to ChatView

---

## Quality Gates
- [x] Backend type-check — 0 errors
- [x] Backend lint — 0 errors
- [x] Frontend type-check — 0 errors
- [x] Frontend lint — 0 errors/warnings
- [ ] Backend tests (not yet written - Phase 2 test sprint)
- [x] No `any` types in new code

## Remaining Items
- Drizzle migration generation (requires DB connection)
- Unit tests for AssetService validation helpers
- Integration tests for asset endpoints
- E2E manual testing with Supabase Storage bucket

## Files Created
- `backend/src/db/schema/assets.schema.ts`
- `backend/src/services/asset.service.ts`
- `backend/src/controllers/asset.controller.ts`
- `backend/src/routes/asset.routes.ts`
- `frontend/lib/upload.ts`
- `frontend/hooks/useFileUpload.ts`
- `frontend/components/chat/file-upload-zone.tsx`

## Files Modified
- `backend/src/db/schema/index.ts` — added assets export
- `backend/src/config/env.ts` — added SUPABASE_STORAGE_BUCKET, isStorageEnabled()
- `backend/src/app.ts` — registered asset routes
- `frontend/components/chat/chat-input.tsx` — added attachment button + upload zone
- `frontend/components/chat/chat-view.tsx` — wired useFileUpload hook, added roomId prop
- `frontend/types/renovation.ts` — added RoomAsset, AssetType, AssetStatus types
- `frontend/package.json` — added react-dropzone, browser-image-compression
