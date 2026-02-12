# Phase 2.3: Style Moodboard Image System - Implementation Plan

## Overview

**Objective**: Create a system to store, manage, and serve curated style moodboard images so the AI renovation agent can show visual examples during the INTAKE phase.

**Economic Value**: Enables visual style exploration, dramatically improving user engagement and conversion from "plain text chatbot" to "visual renovation assistant."

## Research Summary

### Current State
- `style_catalog` table exists with 5 seeded styles, `image_urls` JSONB column (empty `[]`)
- `StyleService` has CRUD + seed, `StyleController` exposes REST API at `/api/styles`
- `get_style_examples` LangChain tool returns style metadata but NO images
- `AssetService` handles user uploads to Supabase Storage with signed URLs
- `room_assets` table requires `room_id NOT NULL` - not suitable for app-owned images
- Supabase client configured; `isStorageEnabled()` guards storage operations

### Selected Approach: New `style_images` table + public Supabase Storage bucket

**Rationale**:
- Clean separation from user-uploaded `room_assets` (different lifecycle, access pattern)
- Proper relational model: FK to `style_catalog`, queryable by room type/tags
- Public bucket for app-owned content (no signed URLs needed)
- Follows existing schema patterns (`assets.schema.ts`)
- Idempotent seed script using Unsplash-sourced CC0 images

### Key Trade-offs
- New table vs `image_urls` JSONB: More code, but queryable/indexable and extensible
- Public bucket vs signed URLs: Simpler for app-owned content, CDN-friendly
- Unsplash URLs vs local files: External dependency but zero storage cost for MVP

## Implementation Strategy

### Step 1: Database Schema & Migration
**Goal**: Create `style_images` table
**Files**:
- CREATE: `backend/src/db/schema/style-images.schema.ts`
- MODIFY: `backend/src/db/schema/index.ts` (add export)
- GENERATE: Drizzle migration via `npm run db:generate`

### Step 2: Style Image Service
**Goal**: Service layer for style image CRUD + Supabase Storage integration
**Files**:
- CREATE: `backend/src/services/style-image.service.ts`
  - `getImagesByStyle(styleId)` - fetch images for a style
  - `getImagesBySlug(slug)` - fetch by style slug (convenience)
  - `getPublicUrl(storagePath)` - generate public URL from storage path
  - `uploadImage(styleId, file, metadata)` - upload to Supabase Storage + insert DB
  - `seedImages(manifest)` - bulk upload from manifest (idempotent)
  - `deleteImage(imageId)` - remove from storage + DB

### Step 3: Image Manifest & Seed Data
**Goal**: Curated image manifest + seed script
**Files**:
- CREATE: `backend/src/data/seed-style-images.ts` - Manifest of style -> image entries
- CREATE: `backend/src/scripts/seed-style-images.ts` - Standalone seed script

Manifest structure:
```typescript
{ styleSlug: string; images: Array<{
  url: string;      // Source URL (Unsplash)
  filename: string; // Target filename
  roomType: string; // 'kitchen' | 'living' | etc.
  caption: string;
  altText: string;
  tags: string[];
}> }
```

### Step 4: Update get_style_examples Tool
**Goal**: Return image URLs in tool response so AI can reference them
**Files**:
- MODIFY: `backend/src/tools/get-style-examples.tool.ts`

Response format change:
```json
{
  "name": "Japandi",
  "description": "...",
  "colorPalette": [...],
  "materials": [...],
  "moodboardImages": [
    { "url": "https://...", "caption": "...", "roomType": "bedroom" }
  ]
}
```

### Step 5: API Endpoints
**Goal**: REST endpoints for frontend to fetch style images
**Files**:
- MODIFY: `backend/src/controllers/style.controller.ts` (add image endpoints)
- MODIFY: `backend/src/routes/style.routes.ts` (add routes)

New endpoints:
- `GET /api/styles/:slug/images` - Get all images for a style
- `POST /api/styles/seed-images` - Seed images (dev only)

### Step 6: Environment Config
**Goal**: Add public style bucket config
**Files**:
- MODIFY: `backend/src/config/env.ts` - Add `SUPABASE_STYLE_BUCKET` with default `style-assets`

### Step 7: Tests
**Goal**: Unit + integration tests
**Files**:
- CREATE: `backend/tests/unit/services/style-image.service.test.ts`
- MODIFY: `backend/tests/integration/api/styles.test.ts` (if exists, else create)

### Step 8: Quality Gates
- `npm run lint` - 0 errors
- `npm run type-check` - 0 errors (backend)
- `npm test:unit` - all passing
- No `any` types in new code

## Build Sequence (Dependency Order)
1. Step 1 (Schema) - no dependencies
2. Step 6 (Env config) - no dependencies
3. Step 2 (Service) - depends on Step 1, 6
4. Step 3 (Seed data) - depends on Step 2
5. Step 4 (Tool update) - depends on Step 2
6. Step 5 (API endpoints) - depends on Step 2
7. Step 7 (Tests) - depends on Steps 2-6
8. Step 8 (Quality gates) - depends on all

## Success Metrics
- `style_images` table created with proper FK to `style_catalog`
- 5+ images per style, 5 styles = 25+ seed images in manifest
- `get_style_examples` tool returns image URLs
- API endpoints serve style images to frontend
- All quality gates passing
