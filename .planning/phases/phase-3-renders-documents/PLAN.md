# Phase 3: Document Generation + AI Renders - Implementation Plan

**Date:** 2026-02-17
**Status:** DRAFT - Pending approval
**Depends on:** Phase 2 (complete), Infrastructure Phase I-IV (complete)
**Phase Goal:** Move from chat-only to deliverable outputs: generate PDF renovation plans/checklists and AI room renders with before/after comparisons.

---

## Executive Summary

Phase 3 adds two major capabilities to the renovation agent:

1. **Document Generation (3A)** - Generate downloadable PDF checklists, renovation plans, and shopping lists from structured data already persisted by Phase 2 tools. Uses Puppeteer for HTML-to-PDF with the project's existing design system.

2. **AI Room Renders (3B)** - Generate visual room renders using Google Imagen 3 (via Vertex AI / Gemini API). Store renders as `room_assets` with `assetType='render'`, enable before/after comparison using the existing `before-after-slider` component.

Both features use BullMQ (already configured) for background processing and Socket.io for real-time progress updates.

---

## Observable Truths (Success Criteria)

| # | Truth | How to Verify |
|---|-------|--------------|
| 1 | User can request a PDF checklist during CHECKLIST phase and download it | Chat command or button triggers generation, PDF downloads |
| 2 | User can request a renovation plan PDF during PLAN phase | Agent generates plan document with timeline, products, budget |
| 3 | Documents are versioned (v1, v2...) and stored in Supabase Storage | `document_artifacts` table has version chain, storage paths resolve |
| 4 | User can request an AI render of a room during RENDER phase | Agent calls render tool, image appears in chat after generation |
| 5 | User can compare before photo vs AI render with slider | Before/after slider shows original photo next to AI render |
| 6 | Agent uses generate_document and generate_render tools correctly | Tools registered in LangGraph, phase-aware prompts guide usage |
| 7 | Background jobs process without blocking the chat | BullMQ workers handle PDF and render generation asynchronously |

---

## Architecture Decisions

### AD-1: PDF Generation Library
**Decision:** Puppeteer (HTML-to-PDF)
**Rationale:**
- The project already has a rich design system (Tailwind CSS, design tokens, fonts)
- HTML templates can reuse existing styles for brand consistency
- Complex layouts (tables, images, headers/footers) are trivial in HTML
- Custom fonts (Inter, DM Serif Display) work via CSS `@font-face`
- Puppeteer is battle-tested for server-side PDF generation
- Alternative considered: pdfkit (more lightweight but requires programmatic layout), @react-pdf/renderer (good for React but limited CSS support, ESM issues)

### AD-2: AI Image Generation
**Decision:** Google Imagen 3 via Gemini API (preferred) or Stability AI as fallback
**Rationale:**
- Project already uses Gemini API with `GOOGLE_API_KEY` — minimizes new credentials
- Imagen 3 produces high-quality interior design renders
- If Imagen isn't available via the Gemini API, fall back to Stability AI (SDXL) via API
- Cost: ~$0.04/image at 1024x1024 (Imagen 3), fits renovation use case
- Alternative considered: DALL-E 3 (higher cost, less control), Replicate (more setup)

### AD-3: Background Processing
**Decision:** BullMQ (already configured in `backend/src/config/queue.ts`)
**Rationale:**
- Queue infrastructure already exists with typed job definitions
- `doc:generate-plan` job type already defined
- Add new job types: `doc:generate-checklist`, `render:generate`
- Workers emit progress via Socket.io (using Redis adapter for cross-instance)

### AD-4: Frontend Document Display
**Decision:** Inline chat cards + dedicated Documents tab
**Rationale:**
- Documents appear inline in chat as downloadable cards (consistent with tool result pattern)
- A "Documents" tab in the session sidebar shows all generated documents
- No inline PDF viewer (too heavy) — just download links with preview thumbnails

### AD-5: Render Display
**Decision:** Inline chat render cards + Before/After comparison
**Rationale:**
- Render results appear inline in chat with thumbnail + status
- Click to expand into full before/after comparison (existing `before-after-slider`)
- Render gallery available in sidebar for browsing all renders per room

---

## Implementation Phases

### Phase 3.1: Document Generation Service (Backend)
**Goal:** Create backend service that generates PDFs from session data

#### Tasks

**3.1.1 Add new BullMQ job types**
- File: `backend/src/config/queue.ts`
- Add `doc:generate-checklist` and `render:generate` job types
- Add `getDocQueue()` and `getRenderQueue()` lazy accessors

**3.1.2 Create PDF template system**
- File: `backend/src/templates/checklist.html` (Handlebars/EJS template)
- File: `backend/src/templates/plan.html`
- File: `backend/src/templates/shopping-list.html`
- Templates use Tailwind CSS classes inline, brand fonts via `@font-face`
- Each template receives typed data context (rooms, products, budget, style)

**3.1.3 Create DocumentService**
- File: `backend/src/services/document.service.ts`
- Methods:
  - `generateChecklist(sessionId, roomId?)` — pulls checklist data from rooms, products from product_recommendations, renders HTML template, converts to PDF via Puppeteer, uploads to Supabase Storage, inserts `document_artifacts` record
  - `generatePlan(sessionId)` — pulls full session data (all rooms, timeline, budget), generates comprehensive plan PDF
  - `generateShoppingList(sessionId)` — aggregates all product recommendations across rooms
  - `getDocuments(sessionId, type?)` — list documents with signed download URLs
  - `getLatestVersion(sessionId, type)` — get most recent version of a document type
- Versioning: query max version for (sessionId, documentType), increment, set previousVersionId
- Storage path: `session_{id}/artifacts/{type}_v{version}.pdf`

**3.1.4 Create document generation worker**
- File: `backend/src/workers/document.worker.ts`
- BullMQ worker for `doc:generate-plan` and `doc:generate-checklist` jobs
- Emits progress via Socket.io: `doc:generation_started`, `doc:generation_progress`, `doc:generation_complete`
- Handles errors with retry (max 2 retries, exponential backoff)

**3.1.5 Create generate_document LangChain tool**
- File: `backend/src/tools/generate-document.tool.ts`
- Input: `{ sessionId, documentType: 'checklist' | 'plan' | 'shopping_list', roomId?: string }`
- Enqueues BullMQ job, returns job ID + "Document generation started" message
- Agent can check status via a companion tool or the frontend polls

**3.1.6 Add document API routes**
- File: `backend/src/routes/document.routes.ts`
- `POST /api/sessions/:sessionId/documents/generate` — trigger generation
- `GET /api/sessions/:sessionId/documents` — list documents
- `GET /api/sessions/:sessionId/documents/:docId/download` — signed download URL
- Mount in `app.ts`

**3.1.7 Install dependencies**
- `pnpm --filter backend add puppeteer` (or `puppeteer-core` + system Chrome)
- `pnpm --filter backend add handlebars` (for HTML templating)

#### Test Plan
- Unit: DocumentService with mocked Puppeteer and DB
- Unit: generate_document tool with mocked queue
- Integration: document.routes with mocked service
- Worker: document.worker with mocked Puppeteer

---

### Phase 3.2: AI Render Service (Backend)
**Goal:** Create backend service that generates AI room renders

#### Tasks

**3.2.1 Create RenderService**
- File: `backend/src/services/render.service.ts`
- Methods:
  - `generateRender(sessionId, roomId, prompt, baseAssetId?)` — calls AI image API, uploads result to Supabase Storage, creates `room_assets` record with `assetType='render'`, `source='ai_generated'`
  - `getRenders(roomId)` — list all renders for a room
  - `approveRender(assetId)` — set metadata.approvalStatus = 'approved'
- Metadata stored in `room_assets.metadata` JSONB:
  ```typescript
  {
    prompt: string,
    modelVersion: string,
    seed?: number,
    renderType: 'ai_generated',
    basedOnAssetId?: string,  // original photo used as reference
    approvalStatus: 'pending' | 'approved' | 'rejected',
    generationTimeMs?: number,
  }
  ```

**3.2.2 Create AI image generation adapter**
- File: `backend/src/services/image-generation.service.ts`
- Abstract interface for image generation (strategy pattern)
- Implementations:
  - `GeminiImagenAdapter` — uses `@google-cloud/vertexai` or Gemini API for Imagen 3
  - `StabilityAIAdapter` — fallback using Stability AI REST API
- Config: `IMAGE_GENERATION_PROVIDER` env var (default: 'gemini')
- Returns: `{ imageBuffer: Buffer, contentType: string, metadata: { model, seed } }`

**3.2.3 Create render generation worker**
- File: `backend/src/workers/render.worker.ts`
- BullMQ worker for `render:generate` jobs
- Creates `room_assets` record with status='processing' before generation
- Updates to status='ready' on success, status='failed' on error
- Emits Socket.io events: `render:started`, `render:progress`, `render:complete`
- Timeout: 60s per render (image gen APIs can be slow)

**3.2.4 Create generate_render LangChain tool**
- File: `backend/src/tools/generate-render.tool.ts`
- Input: `{ sessionId, roomId, prompt, baseAssetId? }`
- Validates room exists, enqueues BullMQ job
- Returns job ID + "Render generation started" message
- RENDER phase prompt instructs agent to use this tool

**3.2.5 Add render API routes**
- File: `backend/src/routes/render.routes.ts`
- `POST /api/sessions/:sessionId/rooms/:roomId/renders` — trigger render
- `GET /api/sessions/:sessionId/rooms/:roomId/renders` — list renders
- `PATCH /api/sessions/:sessionId/rooms/:roomId/renders/:assetId` — approve/reject
- Mount in `app.ts`

**3.2.6 Install dependencies**
- `pnpm --filter backend add @google-cloud/vertexai` (for Imagen 3)
- Or use existing `@google/generative-ai` if Gemini API supports image generation
- Env var: `IMAGE_GENERATION_PROVIDER` (gemini | stability)
- Env var: `STABILITY_API_KEY` (optional fallback)

#### Test Plan
- Unit: RenderService with mocked image generation adapter
- Unit: generate_render tool with mocked queue
- Unit: GeminiImagenAdapter with mocked API
- Integration: render.routes with mocked service
- Worker: render.worker with mocked adapter

---

### Phase 3.3: Update Agent Prompts & Tool Registry
**Goal:** Wire new tools into the ReAct agent with phase-aware guidance

#### Tasks

**3.3.1 Register new tools**
- File: `backend/src/tools/index.ts`
- Add `generateDocumentTool` and `generateRenderTool` to `renovationTools` array

**3.3.2 Update PLAN phase prompt**
- File: `backend/src/config/prompts.ts`
- Add to PLAN phase:
  - `generate_document` tool documentation
  - Instructions: "When the user is satisfied with their renovation plan, offer to generate a PDF document they can download. Use generate_document with type 'plan' for the full plan, 'checklist' for room checklists, or 'shopping_list' for a product shopping list."

**3.3.3 Update RENDER phase prompt**
- File: `backend/src/config/prompts.ts`
- Add to RENDER phase:
  - `generate_render` tool documentation
  - Instructions: "Help the user visualize their renovation. Use generate_render to create AI renders of rooms. Ask which room to render first, what style/changes to show, and optionally use an existing room photo as reference."

**3.3.4 Update CHECKLIST phase prompt**
- Add `generate_document` tool for checklist generation
- Instructions: "After completing checklists for all rooms, offer to generate a downloadable checklist PDF."

---

### Phase 3.4: Frontend — Document Components
**Goal:** Display generated documents in chat and sidebar

#### Tasks

**3.4.1 Create DocumentCard component**
- File: `frontend/components/renovation/document-card.tsx`
- Props: `{ document: DocumentArtifact, onDownload: () => void }`
- Shows: icon by type, title, version badge, date, file size, download button
- Uses phase token color for the relevant phase
- Skeleton loading state

**3.4.2 Create DocumentList component**
- File: `frontend/components/renovation/document-list.tsx`
- Grid of DocumentCards for a session
- Grouped by document type
- Empty state with "No documents yet" message

**3.4.3 Add document tool result to chat**
- File: `frontend/components/chat/tool-result-renderer.tsx`
- Add `generate_document` case with inline DocumentCard
- Show generation progress (spinner → card with download link)

**3.4.4 Add Documents tab to session view**
- File: `frontend/app/app/sessions/[id]/documents/page.tsx` (or tab in existing layout)
- Fetch documents via `GET /api/sessions/:id/documents`
- Render DocumentList

**3.4.5 Add useDocuments hook**
- File: `frontend/hooks/useDocuments.ts`
- TanStack Query hook for fetching/invalidating documents
- Listen to Socket.io `doc:generation_complete` to auto-refetch

**3.4.6 Install dependencies**
- None needed (uses existing shadcn/ui primitives)

---

### Phase 3.5: Frontend — Render Components
**Goal:** Display AI renders in chat with before/after comparison

#### Tasks

**3.5.1 Create RenderCard component**
- File: `frontend/components/renovation/render-card.tsx`
- Props: `{ render: RoomAsset, onCompare?: () => void, onApprove?: () => void }`
- Shows: thumbnail, prompt snippet, status badge (generating/ready/failed), actions
- Generating state: shimmer animation + progress text
- Phase token: `--phase-render`

**3.5.2 Create RenderGallery component**
- File: `frontend/components/renovation/render-gallery.tsx`
- Grid of RenderCards for a room
- Filter by status (all, approved, pending)
- Empty state

**3.5.3 Enhance BeforeAfterSlider for render comparison**
- File: `frontend/components/renovation/before-after-slider.tsx`
- Ensure it works with Supabase Storage signed URLs
- Add labels ("Original Photo" / "AI Render")
- Add approve/reject buttons below slider

**3.5.4 Add render tool result to chat**
- File: `frontend/components/chat/tool-result-renderer.tsx`
- Add `generate_render` case
- Show generation progress → render image → "Compare" button opens before/after

**3.5.5 Add Renders section to room view**
- Render gallery accessible from room detail or session sidebar
- Fetch via `GET /api/sessions/:id/rooms/:roomId/renders`

**3.5.6 Add useRenders hook**
- File: `frontend/hooks/useRenders.ts`
- TanStack Query hook
- Listen to Socket.io `render:complete` for auto-refetch

**3.5.7 Add real-time render progress**
- Listen to `render:started`, `render:progress`, `render:complete` Socket.io events
- Update RenderCard status in real-time (no polling)

---

## Database Changes

### No new tables needed
- `document_artifacts` already exists with all required columns
- `room_assets` already supports `assetType='render'` with JSONB metadata

### New BullMQ job types
Add to `queue.ts`:
```typescript
'doc:generate-checklist': { sessionId: string; roomId?: string };
'render:generate': { sessionId: string; roomId: string; prompt: string; baseAssetId?: string };
```

### Env vars
```env
# Optional - defaults to gemini
IMAGE_GENERATION_PROVIDER=gemini
# Only needed if using Stability AI fallback
STABILITY_API_KEY=
# Puppeteer settings
PUPPETEER_EXECUTABLE_PATH=  # Override Chrome path if needed
```

---

## File Summary

### New Backend Files (11)
| File | Purpose |
|------|---------|
| `services/document.service.ts` | PDF generation orchestration |
| `services/render.service.ts` | AI render orchestration |
| `services/image-generation.service.ts` | AI image API adapter (strategy pattern) |
| `workers/document.worker.ts` | BullMQ worker for PDF generation |
| `workers/render.worker.ts` | BullMQ worker for render generation |
| `tools/generate-document.tool.ts` | LangChain tool for document generation |
| `tools/generate-render.tool.ts` | LangChain tool for render generation |
| `routes/document.routes.ts` | Document API endpoints |
| `routes/render.routes.ts` | Render API endpoints |
| `templates/checklist.html` | Checklist PDF HTML template |
| `templates/plan.html` | Renovation plan PDF HTML template |

### Modified Backend Files (4)
| File | Change |
|------|--------|
| `config/queue.ts` | Add job types, queue accessors |
| `config/prompts.ts` | Update PLAN, RENDER, CHECKLIST prompts |
| `tools/index.ts` | Register 2 new tools |
| `app.ts` | Mount document + render routes |

### New Frontend Files (7)
| File | Purpose |
|------|---------|
| `components/renovation/document-card.tsx` | Document display card |
| `components/renovation/document-list.tsx` | Document grid |
| `components/renovation/render-card.tsx` | Render display card |
| `components/renovation/render-gallery.tsx` | Render grid |
| `hooks/useDocuments.ts` | TanStack Query for documents |
| `hooks/useRenders.ts` | TanStack Query for renders |
| `app/app/sessions/[id]/documents/` | Documents tab page |

### Modified Frontend Files (2)
| File | Change |
|------|--------|
| `components/chat/tool-result-renderer.tsx` | Add document + render result cases |
| `components/renovation/before-after-slider.tsx` | Add labels, approve/reject |

---

## Execution Order

```
Phase 3.1 (Document Service)     ──┐
Phase 3.2 (Render Service)       ──┤── Can run in parallel
                                    │
Phase 3.3 (Prompts & Tools)      ──┘── Depends on 3.1 + 3.2 (tools must exist)
                                    │
Phase 3.4 (Frontend Documents)   ──┐── Depends on 3.1 (API must exist)
Phase 3.5 (Frontend Renders)     ──┘── Depends on 3.2 (API must exist)
```

**Estimated sub-phases:**
- 3.1: ~6-8 hours (Puppeteer setup, templates, service, worker, routes, tests)
- 3.2: ~6-8 hours (image API integration, service, worker, routes, tests)
- 3.3: ~1-2 hours (prompt updates, tool registration)
- 3.4: ~4-5 hours (4 components, hook, route page, chat integration)
- 3.5: ~4-5 hours (4 components, hook, chat integration, Socket.io events)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Imagen 3 not available via Gemini API key | HIGH | Stability AI fallback adapter ready; strategy pattern allows swap |
| Puppeteer heavy in Docker | MEDIUM | Use `puppeteer-core` + system Chrome; or switch to `@react-pdf/renderer` if Puppeteer proves problematic |
| Render generation > 30s timeout | MEDIUM | BullMQ handles async; Socket.io events for progress; no HTTP timeout concern |
| PDF templates need iteration | LOW | HTML templates are easy to modify; Handlebars partials for reuse |
| Supabase Storage not configured (dev) | LOW | Mock storage fallback already exists in AssetService; same pattern for documents |

---

## Test Coverage Targets

| Area | Target | Test Types |
|------|--------|------------|
| DocumentService | 80%+ | Unit (mocked Puppeteer + DB) |
| RenderService | 80%+ | Unit (mocked image API + DB) |
| ImageGenerationService | 80%+ | Unit (mocked HTTP) |
| Workers | 80%+ | Unit (mocked services) |
| LangChain tools | 80%+ | Unit (mocked queue) |
| API routes | 80%+ | Integration (supertest) |
| Frontend components | Basic | Render + interaction tests |

---

*Plan created: 2026-02-17*
*Ready for: Plan review → Approval → Execution*
