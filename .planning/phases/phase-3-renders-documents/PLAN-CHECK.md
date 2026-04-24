# Phase 3 Plan Verification Report

**Date:** 2026-02-17
**Reviewer:** Plan Checker (automated cross-reference)
**Plan file:** `.planning/phases/phase-3-renders-documents/PLAN.md`

---

## 1. Goal Achievement: Observable Truths Coverage

**Verdict: ADEQUATE with one gap**

The 7 observable truths cover the phase goal well. However:

- **Gap: No truth covers the `shopping_list` document type.** The plan mentions `generateShoppingList(sessionId)` in task 3.1.3 and `'shopping_list'` as a documentType in the tool input (task 3.1.5), but no truth specifically validates that shopping lists can be generated. Consider adding a truth or merging into truth #1/#2.
- **Minor: Truth #3 mentions "Supabase Storage"** but `isStorageEnabled()` in `env.ts` (line 216) requires Supabase auth to be configured. In Phases 1-7, auth is optional. The plan does not address how documents will be stored when Supabase is not configured (dev mode / anonymous). The existing `AssetService` likely has a fallback pattern (plan mentions this in the risk table), but this needs explicit design.

---

## 2. Schema Compatibility

### 2a. `document_artifacts` table
**File:** `backend/src/db/schema/document-artifacts.schema.ts`

**Verdict: GOOD - minor type mismatch**

The schema has all needed columns:
- `sessionId`, `roomId` (optional), `documentType`, `phase`, `storagePath`, `filename`, `contentType`, `fileSize`, `generatedBy`, `version`, `previousVersionId`, `metadata` (JSONB), `createdAt`, `expiresAt` -- all present.

**Issues:**
1. **Document type name mismatch.** The plan uses `'checklist'`, `'plan'`, `'shopping_list'` as `documentType` values in the tool input (task 3.1.5). The schema's `DOCUMENT_TYPES` array (line 8-16) uses `'checklist_pdf'`, `'plan_pdf'`, `'materials_list'` -- NOT `'checklist'`, `'plan'`, `'shopping_list'`. The tool must either:
   - Map input types to schema types (e.g., `'checklist'` -> `'checklist_pdf'`), or
   - The schema types should be updated to match.
   - **Action required:** Decide on canonical names and add mapping logic.

2. **`documentType` is `text()` not an enum.** The column is `text('document_type')` (line 65), not constrained to `DOCUMENT_TYPES`. This is fine for flexibility but the service should validate against `DOCUMENT_TYPES` before insert.

### 2b. `room_assets` table (render metadata)
**File:** `backend/src/db/schema/assets.schema.ts`

**Verdict: PARTIALLY COMPATIBLE - metadata gaps**

The schema supports renders:
- `assetType` includes `'render'` (line 9)
- `source` includes `'ai_generated'` (line 18)
- `status` includes `'pending'`, `'processing'`, `'ready'`, `'failed'` (line 15)
- `metadata` is JSONB with `AssetMetadata` type (line 27-42)

**Issues:**
1. **Missing render-specific metadata fields.** The plan (task 3.2.1) expects these metadata fields: `prompt`, `modelVersion`, `seed`, `renderType`, `basedOnAssetId`, `approvalStatus`, `generationTimeMs`. The current `AssetMetadata` interface (line 27-42) only has `prompt`, `modelVersion`, and `style`. Missing from the interface definition:
   - `seed?: number` -- not declared (but `[key: string]: unknown` allows it)
   - `renderType?: string` -- not declared
   - `basedOnAssetId?: string` -- not declared
   - `approvalStatus?: string` -- not declared
   - `generationTimeMs?: number` -- not declared
   - The `[key: string]: unknown` index signature (line 41) means these can be stored, but they won't have type safety.
   - **Action required:** Extend the `AssetMetadata` interface to include render-specific fields for type safety.

2. **`roomId` is `notNull()` on `room_assets`** (line 58-59). This is fine for renders (which are always per-room), but the plan should confirm render generation always has a roomId.

---

## 3. Queue Compatibility

**File:** `backend/src/config/queue.ts`

**Verdict: PARTIALLY COMPATIBLE - job type issues**

### What already exists:
- `doc:generate-plan` is already defined (line 30): `{ sessionId: string; roomId: string; format: 'pdf' | 'html' }`
- `image:optimize` and `email:send-notification` have lazy queue accessors (lines 91-101)
- `createQueue()` and `createWorker()` are generic and will work for new job types

### Issues:
1. **`doc:generate-plan` signature mismatch.** The existing definition (line 30) requires `roomId: string` and `format: 'pdf' | 'html'`. The plan's DocumentService `generatePlan(sessionId)` (task 3.1.3) is session-wide, not room-specific. The existing `roomId` is required (not optional). Either:
   - Change `roomId` to optional in the existing job type, or
   - The plan should acknowledge this and update it.
   - **Action required:** Update `doc:generate-plan` to `{ sessionId: string; roomId?: string; format?: 'pdf' | 'html' }`.

2. **Missing job types.** The plan adds `doc:generate-checklist` and `render:generate` -- these do not exist yet (confirmed). The plan correctly identifies them as additions.

3. **Missing lazy queue accessors.** The plan (task 3.1.1) mentions `getDocQueue()` and `getRenderQueue()` -- the plan should also update `closeQueues()` (line 107-111) to include these new queues for proper shutdown.

4. **No `ai:process-message` queue accessor exists.** This is a pre-existing gap (line 29), not a Phase 3 issue, but worth noting.

---

## 4. Tool Registration Pattern

**File:** `backend/src/tools/index.ts`

**Verdict: STRAIGHTFORWARD -- plan is correct**

The current pattern is simple: import tools, add to array (lines 1-16). Adding 2 new tools (`generateDocumentTool`, `generateRenderTool`) follows the exact same pattern. No issues.

**Note:** The `renovationTools` array is used in `chat.service.ts` line 71 (`this.model.bindTools(renovationTools)`) and line 73 (`new ToolNode(renovationTools)`). Both are initialized once in the constructor. This means **adding tools does not require any changes to `chat.service.ts`** -- they'll automatically be included. The plan correctly identifies only `tools/index.ts` as needing modification.

### Existing tool pattern to follow:
**File:** `backend/src/tools/save-intake-state.tool.ts`
- Uses `tool()` from `@langchain/core/tools`
- Zod schema for input validation
- Returns `JSON.stringify(result)` -- string, not object
- Uses `Logger` for structured logging
- Uses `emitToSession()` for Socket.io events
- Wraps in try/catch, returns error as JSON string

**Action:** New tools should follow this exact pattern. The plan's tool descriptions match.

---

## 5. Prompt Pattern

**File:** `backend/src/config/prompts.ts`

**Verdict: COMPATIBLE -- minor concern**

The prompt structure (lines 12-127) uses `PHASE_PROMPTS` keyed by phase name, with `{{SESSION_ID}}` template variable. Each phase lists available tools with `**tool_name**` format and instructions.

### Issues:
1. **RENDER phase is currently a stub.** Lines 82-90 show the RENDER phase has no `### Available Tools:` section and minimal instructions. The plan correctly identifies this needs updating (task 3.3.3).

2. **CHECKLIST phase already has tool docs.** Lines 35-58 already have `search_products`, `save_checklist_state`, `save_product_recommendation`. Adding `generate_document` (task 3.3.4) will fit naturally.

3. **Prompt length concern.** Adding full tool documentation for `generate_document` and `generate_render` will increase prompt token count. With 5 existing tools already documented plus 2 new ones, the system prompt for PLAN/CHECKLIST phases could become long. Consider measuring token impact.

---

## 6. Frontend Pattern: `tool-result-renderer.tsx`

**File:** `frontend/components/chat/tool-result-renderer.tsx`

**Verdict: COMPATIBLE -- pattern is clear**

The existing pattern is:
1. Add tool name to `TOOL_LABELS` map (line 10-16)
2. Add emoji to `iconMap` in `ToolIcon` (line 58-65)
3. Add `case` in `ToolContent` switch (line 69-87)
4. Create dedicated render function (e.g., `DocumentResult`, `RenderResult`)

**Issues:**
1. **Async/progress state not handled.** The current `ToolResultRenderer` is stateless -- it renders the final tool result. For `generate_document` and `generate_render`, the plan expects progress states (spinner -> card). The current architecture doesn't support this because:
   - Tool results are stored as `type: 'tool_result'` messages with final data
   - There's no mechanism to update a rendered tool result in-place
   - **Action required:** The plan needs to clarify: will progress be shown via separate Socket.io events (outside the chat message flow), or will the tool result message be updated? The `SocketEvents` type in `frontend/types/chat.ts` (lines 16-25) doesn't include `doc:generation_*` or `render:*` events yet.

2. **`before-after-slider.tsx` already has labels.** The plan (task 3.5.3) says to "Add labels" but the component already has `beforeLabel` and `afterLabel` props (lines 8-9, 68-73). The plan should note this is already done.

---

## 7. Missing Tasks

### 7a. Controller files -- MISSING FROM PLAN
Every existing route file has a corresponding controller file:
- `routes/asset.routes.ts` -> `controllers/asset.controller.ts`
- `routes/session.routes.ts` -> `controllers/session.controller.ts`
- etc.

**The plan creates `routes/document.routes.ts` and `routes/render.routes.ts` but does NOT mention creating `controllers/document.controller.ts` or `controllers/render.controller.ts`.** The existing pattern delegates all logic from routes to controllers.

**Action required:** Add these to the file summary:
- `backend/src/controllers/document.controller.ts`
- `backend/src/controllers/render.controller.ts`

### 7b. Validation schemas -- MISSING FROM PLAN
Existing routes use inline validation (see `asset.controller.ts` lines 15-37) or Zod schemas in `validators/`. The plan should specify request validation for new routes.

**The plan creates API routes but doesn't mention Zod request validation schemas for:**
- `POST /api/sessions/:sessionId/documents/generate` body
- `POST /api/sessions/:sessionId/rooms/:roomId/renders` body
- `PATCH /api/sessions/:sessionId/rooms/:roomId/renders/:assetId` body

### 7c. `env.ts` updates -- PARTIALLY ADDRESSED
The plan mentions 3 new env vars (lines 336-342): `IMAGE_GENERATION_PROVIDER`, `STABILITY_API_KEY`, `PUPPETEER_EXECUTABLE_PATH`. These are NOT in `env.ts` currently. The plan doesn't explicitly list `env.ts` as a modified file in the file summary (line 366-369), but it should.

**Action required:** Add `config/env.ts` to the "Modified Backend Files" table with these additions:
```typescript
IMAGE_GENERATION_PROVIDER: z.enum(['gemini', 'stability']).default('gemini'),
STABILITY_API_KEY: z.string().optional(),
PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
```
Also add helper functions: `isImageGenerationEnabled()`, etc.

### 7d. TypeScript types -- PARTIALLY ADDRESSED
The plan's tool input types are defined inline in Zod schemas (following existing pattern). But the plan doesn't mention:
- Frontend TypeScript types for `DocumentArtifact` and render data (needed for `useDocuments` and `useRenders` hooks)
- These should go in `frontend/types/renovation.ts` or a new `frontend/types/documents.ts`

### 7e. Socket.io event types -- MISSING
The plan introduces new Socket.io events (`doc:generation_started`, `doc:generation_progress`, `doc:generation_complete`, `render:started`, `render:progress`, `render:complete`) but doesn't mention updating `frontend/types/chat.ts` `SocketEvents` interface (currently lines 16-25) to include these.

### 7f. Worker startup -- MISSING
The existing `email.worker.ts` exports `startEmailWorker()` which is presumably called from `server.ts`. The plan creates `document.worker.ts` and `render.worker.ts` but doesn't mention where/how workers are started. Need to update `server.ts` to call `startDocumentWorker()` and `startRenderWorker()`.

### 7g. `closeQueues()` update -- MISSING
`queue.ts` line 107-111 has `closeQueues()` that only closes `_imageQueue` and `_emailQueue`. New queues need to be added here for graceful shutdown.

### 7h. `shutdown-manager.ts` integration -- MISSING
New workers need to be registered with the shutdown manager for graceful termination.

### 7i. Templates directory -- MISSING
The plan references `backend/src/templates/checklist.html` and `backend/src/templates/plan.html`, but this directory does not exist. The plan accounts for creating it but doesn't mention a `shopping-list.html` template in the file summary (line 348-361) despite listing `generateShoppingList()` as a method.

---

## 8. Dependency and Infrastructure Issues

### 8a. Puppeteer in ESM
**Verdict: HIGH RISK**

Puppeteer v22+ works with ESM (`import puppeteer from 'puppeteer'`). However:
- The backend uses `node:20-alpine` Docker image (Dockerfile line 2). **Alpine Linux does NOT include Chromium by default.** Puppeteer's bundled Chromium won't work on Alpine without additional system dependencies.
- **Options:**
  1. Use `puppeteer-core` + install Chromium via `apk add chromium` in Dockerfile
  2. Switch to `node:20-slim` (Debian-based, easier Chromium support)
  3. Use `@sparticuz/chromium` (Lambda-compatible, lighter)
- **Action required:** The plan's Dockerfile needs updating. Add to the builder stage:
  ```dockerfile
  RUN apk add --no-cache chromium
  ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
  ```

### 8b. Puppeteer binary size
Chromium adds ~200-300MB to the Docker image. The current production image is minimal (Alpine + node_modules + dist). This is a significant size increase.

**Alternative to consider:** `@react-pdf/renderer` is ESM-compatible, has no binary dependency, and can run in Node.js. However, it uses React-based layout, not HTML/CSS. Trade-off between design system reuse (Puppeteer) vs. image size (react-pdf).

### 8c. Imagen 3 API availability
The plan says Imagen 3 via "Gemini API" using existing `GOOGLE_API_KEY`. As of early 2026, Google's Imagen 3 is available through:
- Vertex AI (requires service account, project ID) -- NOT just an API key
- Gemini API has `generateContent` with image output capability in some models

**The plan should clarify which API surface is used.** If Vertex AI, this requires `GOOGLE_CLOUD_PROJECT` and service account credentials, not just `GOOGLE_API_KEY`. The plan's AD-2 (line 49-55) is ambiguous.

**Action required:** Research whether `@google/generative-ai` (already in backend deps) supports image generation. If not, `@google-cloud/vertexai` requires different auth.

### 8d. Handlebars ESM compatibility
Handlebars v4 works with ESM via `import Handlebars from 'handlebars'`. No issues expected.

### 8e. `templates/shopping-list.html` missing from file summary
Task 3.1.3 mentions `generateShoppingList()` but the file summary (line 348-361) only lists `templates/checklist.html` and `templates/plan.html`. Missing: `templates/shopping-list.html`.

---

## 9. Route Mounting Pattern

**File:** `backend/src/app.ts`

The plan says to mount routes in `app.ts` (task 3.1.6, 3.2.5). Current pattern (lines 105-110):
```typescript
app.use('/api/sessions', sessionRoutes);
app.use('/api', roomRoutes);
app.use('/api', assetRoutes);
```

The plan's document routes (`/api/sessions/:sessionId/documents/*`) fit the session routes pattern.
The plan's render routes (`/api/sessions/:sessionId/rooms/:roomId/renders`) would need `app.use('/api/sessions', renderRoutes)` or `app.use('/api', renderRoutes)` depending on how the router is structured.

**Note:** The plan's render route prefix (`/api/sessions/:sessionId/rooms/:roomId/renders`) differs from the asset routes pattern (`/api/rooms/:roomId/assets`). The asset routes do NOT nest under sessions -- they use `verifyRoomOwnership` middleware instead. The plan should decide: follow existing pattern (`/api/rooms/:roomId/renders`) or use the nested pattern. Consistency matters.

---

## 10. Summary of Required Actions

### Critical (must fix before implementation):
| # | Issue | Files Affected |
|---|-------|---------------|
| C1 | `doc:generate-plan` job type has required `roomId` + `format`, plan expects optional | `backend/src/config/queue.ts` line 30 |
| C2 | Document type name mismatch (`'checklist'` vs `'checklist_pdf'`) | `document-artifacts.schema.ts` vs tool input |
| C3 | Missing controller files from plan | Need `document.controller.ts`, `render.controller.ts` |
| C4 | Puppeteer won't work on Alpine Docker without Chromium | `backend/Dockerfile` |
| C5 | `env.ts` not listed as modified file; needs 3 new env vars | `backend/src/config/env.ts` |
| C6 | Imagen 3 API auth model unclear (API key vs service account) | Plan AD-2 |

### Important (should fix):
| # | Issue | Files Affected |
|---|-------|---------------|
| I1 | `AssetMetadata` interface missing render-specific typed fields | `assets.schema.ts` lines 27-42 |
| I2 | `closeQueues()` must include new queue instances | `queue.ts` lines 107-111 |
| I3 | Worker startup not addressed (where to call `start*Worker`) | `server.ts` |
| I4 | Frontend Socket.io event types missing for doc/render events | `frontend/types/chat.ts` |
| I5 | Frontend TypeScript types for documents/renders not specified | `frontend/types/` |
| I6 | Supabase Storage unavailable in anonymous mode for doc storage | `env.ts` `isStorageEnabled()` |
| I7 | Progress state in chat -- tool result renderer is stateless | `tool-result-renderer.tsx` |
| I8 | `shopping-list.html` template missing from file summary | Plan file summary table |
| I9 | Route path inconsistency (renders nested under sessions vs assets pattern) | Route design |

### Low priority:
| # | Issue | Files Affected |
|---|-------|---------------|
| L1 | `before-after-slider.tsx` already has label props | Plan task 3.5.3 |
| L2 | Shutdown manager integration for new workers | `shutdown-manager.ts` |
| L3 | System prompt token length with 7 tools | `prompts.ts` |

---

## 11. File Count Accuracy

Plan claims: **11 new backend + 4 modified backend + 7 new frontend + 2 modified frontend = 24 total**

Actual needed (with corrections):
- **New backend:** 11 listed + 2 controllers + 1 missing template = **14**
- **Modified backend:** 4 listed + `env.ts` + `server.ts` (worker startup) + `queue.ts` `closeQueues()` = **6** (queue.ts already listed)
- **New frontend:** 7 listed = **7**
- **Modified frontend:** 2 listed + `types/chat.ts` (Socket events) = **3**

**Corrected total: ~30 files** (vs plan's 24)

---

*Verification complete. The plan is structurally sound but has 6 critical gaps and 9 important gaps that should be addressed before implementation begins.*
