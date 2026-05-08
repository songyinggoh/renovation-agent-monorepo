# Phase 3.1: Render Service — Complete Implementation Plan

**Date:** 2026-02-21
**Status:** COMPLETE — All 4 waves implemented and verified (542 tests pass, type-check clean)
**Depends on:** Phase 2 (complete), Infrastructure Phase I-IV (complete)
**Phase Goal:** Harden the existing render pipeline (fix 3 critical bugs), add REST API, OTel tracing, reference-image support, and build complete frontend render components.

## Context

Phase 3.1 (from the Notion roadmap) adds AI room rendering to the renovation agent. Research reveals the **backend is ~90% built** — the render service, worker, image generation adapter, LangGraph tool, queue config, and prompts all exist. However, there are **3 critical bugs**, several hardening gaps, no REST API, no reference-image support, and no frontend render components.

This plan covers the full scope: bug fixes, backend hardening, REST API, OTel tracing, reference-image (edit-mode) support, and complete frontend (render-card, gallery, optimistic UI).

**AI Model:** Keep `gemini-2.0-flash-exp` (free tier, already working). Upgrade to Imagen 4 later.

---

## Execution Waves

### Wave 1: Bug Fixes + Shared Types (foundation — everything depends on this)
### Wave 2: Backend Hardening (parallel-safe, no frontend deps)
### Wave 3: REST API (routes + controller)
### Wave 4: Frontend Components (depends on Wave 1 types + Wave 3 API)

Waves 2 and 3 can execute in parallel after Wave 1.

---

## Wave 1: Bug Fixes + Shared Types

### 1.1 Fix Socket.io sessionId missing from worker emits
**File:** `backend/src/workers/render.worker.ts`
**Bug:** Line 40 emits `{ assetId, roomId }` — missing `sessionId`. Lines 55-61 (`render:complete`) and 83-87 (`render:failed`) also omit `sessionId`. The `useSocketQuerySync` handler for `render:started` guards on `data.sessionId !== sessionId`, so **every render:started event is silently dropped**.
**Fix:** Add `sessionId` to all 3 `emitToSession` call payloads:
```typescript
emitToSession(sessionId, 'render:started', { assetId, roomId, sessionId });
emitToSession(sessionId, 'render:complete', { assetId, roomId, sessionId, contentType, sizeBytes, model });
emitToSession(sessionId, 'render:failed', { assetId, roomId, sessionId, error });
```

### 1.2 Fix shared type definitions missing sessionId
**File:** `packages/shared-types/src/socket-events.ts`
**Bug:** `RenderCompletePayload` (line 77-83) and `RenderFailedPayload` (line 85-89) lack `sessionId` field, unlike `RenderStartedPayload` which has it.
**Fix:** Add `sessionId: string` to both interfaces.

### 1.3 Add render:progress event type
**File:** `packages/shared-types/src/socket-events.ts`
**New type + event:**
```typescript
export type RenderStage = 'queued' | 'generating' | 'uploading' | 'finalizing';

export interface RenderProgressPayload {
  assetId: string;
  roomId: string;
  sessionId: string;
  progress: number; // 0-100
  stage: RenderStage;
}

// Add to ServerToClientEvents:
'render:progress': (data: RenderProgressPayload) => void;
```

### 1.4 Export new types from shared-types barrel
**File:** `packages/shared-types/src/index.ts`
**Add:** `RenderProgressPayload`, `RenderStage` exports.

### 1.5 Fix useSocketQuerySync missing sessionId guards
**File:** `frontend/hooks/useSocketQuerySync.ts`
**Bug:** `handleRenderComplete` (line 130) and `handleRenderFailed` (line 145) don't check `data.sessionId !== sessionId`, causing spurious invalidations in multi-tab scenarios.
**Fix:** Add `if (data.sessionId !== sessionId) return;` guard to both handlers.

### 1.6 Add render:progress handler to useSocketQuerySync
**File:** `frontend/hooks/useSocketQuerySync.ts`
**New handler:** Listen to `render:progress`, use `queryClient.setQueryData` to patch progress directly into cache (no refetch — progress is ephemeral, not in DB). Register + cleanup.

### 1.7 Add render:progress handler to useRenderState
**File:** `frontend/hooks/useRenderState.ts`
**Enhancement:** Add `progress?: number` and `stage?: string` to `RenderEntry` interface. Add `handleProgress` Socket.io listener that patches progress/stage into the active render entry. Register + cleanup.

**Tests:** Update `frontend/__tests__/hooks/useRenderState.test.tsx` for new progress handling.

---

## Wave 2: Backend Hardening

### 2.1 Add permanent error detection to render worker
**File:** `backend/src/workers/render.worker.ts`
**Problem:** Content policy blocks (safety filters, prompt blocked) retry 3 times pointlessly.
**Fix:** Add pattern list + `isPermanentError()` check. Throw `UnrecoverableError` on match:
```typescript
const PERMANENT_ERROR_PATTERNS = ['safety filters', 'content policy', 'prompt was blocked', 'invalid prompt', 'moderation'];

function isPermanentError(msg: string): boolean {
  return PERMANENT_ERROR_PATTERNS.some(p => msg.toLowerCase().includes(p));
}
```
Insert before the `isLastAttempt` check in the catch block. Call `failRender` + emit `render:failed` + throw `UnrecoverableError`.

### 2.2 Add render:progress emits to worker
**File:** `backend/src/workers/render.worker.ts`
**Enhancement:** Emit progress at meaningful milestones:
- After validation: `{ progress: 0, stage: 'generating' }`
- After `adapter.generate()` returns: `{ progress: 70, stage: 'uploading' }`
- After `completeRender()`: `{ progress: 95, stage: 'finalizing' }`

Percentages reflect actual wall-clock distribution (generation is ~70% of elapsed time).

### 2.3 Add upload timeout wrapper
**File:** `backend/src/workers/render.worker.ts`
**Problem:** `renderService.completeRender()` uploads to Supabase Storage with no timeout. A slow upload could exceed the BullMQ lock duration.
**Fix:** Wrap with `withTimeout(renderService.completeRender(...), 20_000, 'completeRender')`.

### 2.4 Remove duplicate job options from RenderService
**File:** `backend/src/services/render.service.ts`
**Problem:** Lines 101-106 pass `{ attempts: 3, backoff: ... }` to `queue.add()`, duplicating `WORKER_PROFILES['render:generate'].defaultJobOptions`. Creates drift risk.
**Fix:** Remove the options object from `queue.add()` — let `createQueueWithProfile` defaults apply.

### 2.5 Fix shutdown timeout for render worker
**File:** `backend/src/server.ts` (lines 690-698)
**Problem:** All 4 workers share a single shutdown resource with 5s timeout. Render jobs take up to 90s. In-flight renders will be killed mid-generation.
**Fix:** Split into separate shutdown resources:
```
RenderWorker: 95s timeout (90s job + 5s buffer)
Workers (email, image, doc): 35s timeout
Queues: 5s timeout
```

### 2.6 Add OTel tracing to render worker
**File:** `backend/src/workers/render.worker.ts`
**Enhancement:** Add parent span `job:render:generate` wrapping the full job, with child span `ai.image.generate` for the external API call. Attributes include job.id, render.session_id, render.room_id, render.asset_id, ai.provider, ai.response.size_bytes, render.generation_time_ms.

### 2.7 Add baseAssetId to generate_render tool schema
**File:** `backend/src/tools/generate-render.tool.ts`
**Enhancement:** Add optional `baseAssetId` parameter to the Zod schema:
```typescript
baseAssetId: z.string().uuid().optional().describe('Optional: ID of an existing room photo to use as reference for the render')
```
Pass through to `renderService.requestRender(sessionId, roomId, prompt, baseAssetId)`. Already supported by the service.

### 2.8 Add reference image support to GeminiImageAdapter
**File:** `backend/src/services/image-generation.service.ts`
**Enhancement:** When `options.referenceImageBase64` is provided, pass it as a multimodal input part alongside the text prompt in `generateContent()`:
```typescript
contents: [
  { role: 'user', parts: [
    { inlineData: { mimeType: 'image/jpeg', data: options.referenceImageBase64 } },
    { text: prompt },
  ]},
]
```
This enables edit-mode renders (user uploads room photo, AI generates renovation render based on it).

### 2.9 Wire baseAssetId to reference image in render worker
**File:** `backend/src/workers/render.worker.ts`
**Enhancement:** When job data includes `baseAssetId`:
1. Load the room_assets record to get `storagePath`
2. Download the image from Supabase Storage (or local DB record)
3. Convert to base64
4. Pass as `options.referenceImageBase64` to `adapter.generate()`

**File:** `backend/src/validators/job.validators.ts`
**Enhancement:** Add `baseAssetId: z.string().uuid().optional()` to `renderGenerateJobSchema`.

**File:** `backend/src/config/queue.ts`
**Enhancement:** Add `baseAssetId?: string` to the `render:generate` JobTypes interface.

### 2.10 Update render worker tests
**File:** `backend/tests/unit/workers/render.worker.test.ts`
**Updates:** Add test cases for permanent error detection, progress events, upload timeout, reference image support.

---

## Wave 3: REST API

### 3.1 Create render controller
**File:** `backend/src/controllers/render.controller.ts` (NEW)
**Methods:**
- `listRenders(req, res)` — GET `/rooms/:roomId/renders` — calls `renderService.getRenders(roomId)`, returns `{ renders: [...] }`
- `requestRender(req, res)` — POST `/rooms/:roomId/renders` — validates body (Zod), calls `renderService.requestRender()`, returns `{ assetId, jobId }`
- `approveRender(req, res)` — PATCH `/rooms/:roomId/renders/:assetId` — updates `room_assets.metadata.approvalStatus`

**Validation schemas (inline Zod):**
```typescript
const requestRenderSchema = z.object({
  prompt: z.string().min(10).max(1000),
  baseAssetId: z.string().uuid().optional(),
});

const approveRenderSchema = z.object({
  approvalStatus: z.enum(['approved', 'rejected']),
});
```

### 3.2 Create render routes
**File:** `backend/src/routes/render.routes.ts` (NEW)
```
GET  /rooms/:roomId/renders          → renderController.listRenders
POST /rooms/:roomId/renders          → renderController.requestRender
PATCH /rooms/:roomId/renders/:assetId → renderController.approveRender
```
Uses `optionalAuthMiddleware`. Follows the asset routes pattern (`/api/rooms/:roomId/...`).

### 3.3 Mount routes
**File:** `backend/src/app.ts`
**Add:** `app.use('/api', renderRoutes);`

### 3.4 Add render route tests
**File:** `backend/tests/unit/controllers/render.controller.test.ts` (NEW)
**Coverage:** List renders, request render (valid + invalid), approve/reject, room not found, rate limit.

---

## Wave 4: Frontend Components

### 4.1 Create RenderCard component
**File:** `frontend/components/renovation/render-card.tsx` (NEW)
**Props:** `{ render: RoomAsset, onCompare?: () => void, onApprove?: () => void, onReject?: () => void }`
**UI:**
- Thumbnail image (or shimmer animation when status='processing')
- Status badge: processing (amber pulse), ready (green), failed (red)
- Prompt snippet (truncated)
- Progress bar when `renderProgress` is available
- Actions: Compare (opens before-after), Approve, Reject
- Uses `--phase-render` color token

### 4.2 Create RenderGallery component
**File:** `frontend/components/renovation/render-gallery.tsx` (NEW)
**Props:** `{ roomId: string, sessionId: string, renders: RoomAsset[] }`
**UI:**
- Grid of RenderCards
- Filter by status (all, approved, pending, failed)
- Empty state: "No renders yet — ask the AI to generate one"
- Integrates with `useRenderState` for real-time progress overlay

### 4.3 Create useRequestRender mutation hook
**File:** `frontend/hooks/useRequestRender.ts` (NEW)
**Pattern:** TanStack Query `useMutation` with optimistic UI:
- `onMutate`: Cancel queries, snapshot rooms, add placeholder render with `status: 'processing'`
- `onError`: Roll back to snapshot
- `onSuccess`: No-op (Socket.io events drive cache from here)
- Mutation calls: `POST /api/rooms/:roomId/renders`

### 4.4 Add render result to chat tool renderer
**File:** `frontend/components/chat/tool-result-renderer.tsx`
**Enhancement:** Add `generate_render` case that shows inline RenderCard with generation progress, transitioning to the completed render image. Uses `useRenderState` to track async status.

### 4.5 Update barrel exports
**File:** `frontend/components/renovation/index.ts`
**Add:** Export `RenderCard` and `RenderGallery`.

---

## File Summary

### New Files (6)
| File | Purpose |
|------|---------|
| `backend/src/controllers/render.controller.ts` | REST API controller |
| `backend/src/routes/render.routes.ts` | REST API routes |
| `backend/tests/unit/controllers/render.controller.test.ts` | Route tests |
| `frontend/components/renovation/render-card.tsx` | Render display card |
| `frontend/components/renovation/render-gallery.tsx` | Render grid |
| `frontend/hooks/useRequestRender.ts` | Optimistic mutation hook |

### Modified Files (14)
| File | Changes |
|------|---------|
| `packages/shared-types/src/socket-events.ts` | Fix sessionId on 2 payloads, add RenderProgressPayload + RenderStage |
| `packages/shared-types/src/index.ts` | Export new types |
| `backend/src/workers/render.worker.ts` | Fix 3 sessionId emits, add progress emits, permanent error detection, upload timeout, OTel tracing, reference image support |
| `backend/src/services/render.service.ts` | Remove duplicate job options |
| `backend/src/services/image-generation.service.ts` | Add reference image support to GeminiImageAdapter |
| `backend/src/tools/generate-render.tool.ts` | Add baseAssetId to schema |
| `backend/src/config/queue.ts` | Add baseAssetId to render:generate JobTypes |
| `backend/src/validators/job.validators.ts` | Add baseAssetId to renderGenerateJobSchema |
| `backend/src/server.ts` | Split shutdown resources for render worker (95s timeout) |
| `backend/src/app.ts` | Mount render routes |
| `backend/tests/unit/workers/render.worker.test.ts` | Update for new features |
| `frontend/hooks/useSocketQuerySync.ts` | Fix sessionId guards, add render:progress handler |
| `frontend/hooks/useRenderState.ts` | Add progress/stage to RenderEntry, add progress handler |
| `frontend/components/chat/tool-result-renderer.tsx` | Add generate_render case |

### Existing files reused (no changes needed)
| File | Reuse |
|------|-------|
| `backend/src/services/render.service.ts` | `requestRender`, `completeRender`, `failRender`, `getRenders` |
| `backend/src/services/image-generation.service.ts` | `GeminiImageAdapter`, `StabilityAIAdapter`, factory |
| `backend/src/services/asset.service.ts` | `buildStoragePath` |
| `backend/src/utils/socket-emitter.ts` | `emitToSession` |
| `backend/src/utils/agent-guards.ts` | `formatAsyncToolResponse`, `ALLOWED_TOOLS` |
| `frontend/components/renovation/before-after-slider.tsx` | Already has `beforeLabel`/`afterLabel` props |

---

## Research Artifacts

- **Gemini API research:** `.planning/phases/phase-3-renders-documents/RESEARCH-render-api.md`
- **Original Phase 3 plan:** `.planning/phases/phase-3-renders-documents/PLAN.md`
- **Plan check (gap analysis):** `.planning/phases/phase-3-renders-documents/PLAN-CHECK.md`

---

## Verification Plan

### Unit Tests
```bash
cd backend && npm run test:unit  # All existing + new tests pass
```
Expected: render.worker.test.ts covers progress events, permanent errors, upload timeout, reference image. render.controller.test.ts covers all REST endpoints.

### Type Check
```bash
cd frontend && npm run type-check  # Shared types propagate correctly
cd backend && npm run prep         # Lint + build clean
```

### Manual E2E Verification
1. Start backend + frontend (`npm run dev`)
2. Create a session, add rooms through INTAKE/CHECKLIST
3. Transition to RENDER phase
4. Ask the agent to generate a render — verify:
   - `render:started` event fires (check browser console)
   - `render:progress` events show 0% -> 70% -> 95%
   - `render:complete` event fires
   - Render image appears in chat (tool result)
   - RenderCard shows in gallery
5. Test REST API: `GET /api/rooms/:roomId/renders` returns render list
6. Test reference image: Upload room photo, then request render with that photo as reference
7. Test error handling: Send a prompt that triggers content policy, verify `UnrecoverableError` (no retries)
8. Test shutdown: Send SIGTERM during render generation, verify worker drains gracefully

### Socket.io Bug Verification
- Open 2 browser tabs with different sessions
- Trigger render in tab 1
- Verify tab 2 does NOT show spurious invalidation (sessionId guard working)
