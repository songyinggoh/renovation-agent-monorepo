---
phase: phase-3-renders-documents
plan: 3A-04
subsystem: api
tags: [bullmq, puppeteer, express, zod, socket.io, graceful-shutdown, pdf-generation]

# Dependency graph
requires:
  - phase: phase-3-renders-documents/3A-01
    provides: doc:generate-plan queue setup and docGeneratePlanJobSchema
  - phase: phase-3-renders-documents/3A-02
    provides: DocumentService with generateChecklist/generatePlan/getDocuments/close
  - phase: phase-3-renders-documents/3A-03
    provides: LangGraph generate_document tool that enqueues doc:generate-plan jobs

provides:
  - Real Puppeteer-based doc worker (replaces no-op skeleton) with DocumentService delegation
  - Proactive BullMQ lock extension every 20s for long-running Puppeteer jobs
  - Permanent vs retryable error classification (classifyPuppeteerError + UnrecoverableError)
  - Exported documentService singleton for graceful shutdown in server.ts
  - REST API: POST /api/sessions/:sessionId/documents/generate (202 queued response)
  - REST API: GET /api/sessions/:sessionId/documents (list with signed URLs)
  - REST API: GET /api/sessions/:sessionId/documents/:docId/download (signed URL)
  - 400 validation on invalid document type query param (not silently empty)
  - DocumentService Puppeteer browser pool registered in graceful shutdown

affects:
  - frontend document download/list components
  - phase-iv-otel (worker span instrumentation for doc worker)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Singleton service exported from worker module for shutdown lifecycle management
    - BullMQ lock extension pattern (setInterval + job.extendLock) for long-running jobs
    - Puppeteer error classification: permanent (ProtocolError, business errors) vs retryable
    - Zod validation on optional query params returning 400 instead of empty results

key-files:
  created:
    - backend/src/controllers/document.controller.ts
    - backend/src/routes/document.routes.ts
  modified:
    - backend/src/workers/doc.worker.ts
    - backend/src/app.ts
    - backend/src/server.ts

key-decisions:
  - "documentService singleton exported from doc.worker.ts so server.ts can call close() for Chromium cleanup"
  - "DocumentService Browser Pool shutdown registered BEFORE Workers & Queues to prevent orphaned Chromium"
  - "listDocumentsTypeSchema returns 400 on invalid type (not silently empty) per must_haves truth"
  - "classifyPuppeteerError includes business logic errors (No plan data found, Session not found) as permanent to prevent futile retries"
  - "Lock extension every 20s (same as LOCK_EXTEND_INTERVAL_MS) to prevent BullMQ stall detection during Puppeteer page.pdf()"

patterns-established:
  - "Worker singleton export pattern: export const service = new Service() for shutdown lifecycle"
  - "Lock extension pattern: setInterval in try/finally, clearInterval in finally block"
  - "Error classification: classify in catch, re-throw as UnrecoverableError or original Error"

requirements-completed: []

# Metrics
duration: 6min
completed: 2026-03-16
---

# Phase 3A Plan 04: Doc Worker + REST API Summary

**BullMQ Puppeteer doc worker with proactive lock extension, error classification, REST document API (generate/list/download), and Chromium subprocess cleanup in graceful shutdown**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-16T18:54:24Z
- **Completed:** 2026-03-16T19:00:48Z
- **Tasks:** 3/3
- **Files modified:** 5

## Accomplishments

- Replaced no-op doc.worker.ts skeleton with full Puppeteer-based implementation delegating to DocumentService
- Created complete REST API for document operations with Zod validation and ownership middleware
- Registered DocumentService browser pool cleanup in server.ts graceful shutdown to prevent Chromium subprocess leaks

## Task Commits

Each task was committed atomically:

1. **Task 3A.4.1: Rewrite doc.worker.ts with real Puppeteer implementation** - `3dad1fe` (feat)
2. **Task 3A.4.2: Create document controller, routes, and mount in app.ts** - `cb0a118` (feat)
3. **Task 3A.4.3: Register documentService.close() in server.ts graceful shutdown** - `96868da` (feat)

## Files Created/Modified

- `backend/src/workers/doc.worker.ts` - Full Puppeteer worker: DocumentService integration, lock extension, error classification, Socket.io events with sessionId
- `backend/src/controllers/document.controller.ts` - Three handlers: generateDocument (202), listDocuments (400 on invalid type), getDownloadUrl (signed URL or 503)
- `backend/src/routes/document.routes.ts` - Document REST routes with optionalAuthMiddleware + verifySessionOwnership
- `backend/src/app.ts` - Added import and mount for documentRoutes at /api
- `backend/src/server.ts` - Updated doc.worker.ts import to include documentService, added 'DocumentService Browser Pool' shutdown resource

## Decisions Made

- **documentService singleton export:** The DocumentService instance is created at module level in doc.worker.ts and exported so server.ts can call `documentService.close()` during shutdown, killing the Chromium subprocess. This avoids creating a second instance in server.ts.
- **Shutdown ordering:** DocumentService Browser Pool cleanup is registered BEFORE the Workers & Queues block. This ensures Chromium is killed before the BullMQ worker connection closes, preventing orphaned processes.
- **400 on invalid query type:** The `listDocumentsTypeSchema` uses `.optional()` with `safeParse` to catch invalid `type` query values and return 400 (not silently return all documents).
- **Business logic errors as permanent:** `classifyPuppeteerError` treats "No plan data found", "Session not found", "No rooms found", "PDF generation is disabled", and "JSONB validation failed" as `UnrecoverableError` to prevent futile BullMQ retries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused variable lint error in listDocuments error map**
- **Found during:** Task 3A.4.2 (controller creation), running `npm run lint`
- **Issue:** The error detail map callback had parameter `i` that was never referenced in the body (the message was a static string, not using `i.message`)
- **Fix:** Changed `i =>` to `() =>` in the `listDocumentsTypeSchema` error map
- **Files modified:** `backend/src/controllers/document.controller.ts`
- **Verification:** `npm run lint` passes with 0 errors
- **Committed in:** `cb0a118` (Task 3A.4.2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug - unused variable in lint)
**Impact on plan:** Minor lint fix. No scope creep, no behavior change.

## Issues Encountered

- `npm run prep` (lint + build) fails due to pre-existing `supervisor.ts` TypeScript errors (AgentGraph type mismatch). This is documented in STATE.md accumulated decisions ("Skip supervisor.ts type errors - pre-existing, not introduced by 3A work"). Lint passes cleanly, and `npx tsc --noEmit` errors are exclusively in `src/dev-agents/supervisor.ts` (lines 71-76), not in any 3A files.

## User Setup Required

None - no external service configuration required for this plan.

## Next Phase Readiness

- Phase 3A is fully complete: schema foundation (3A-01), DocumentService + templates (3A-02), LangGraph tools (3A-03), and worker + REST API (3A-04) are all committed
- Document generation pipeline is end-to-end wired: LangGraph tool → BullMQ queue → Puppeteer worker → Socket.io events → REST API
- Frontend can now call POST /api/sessions/:sessionId/documents/generate and GET /api/sessions/:sessionId/documents to trigger and list PDF generation
- Graceful shutdown handles Chromium subprocess cleanup correctly (10s timeout)
- Blocker: Supabase Storage must be configured (SUPABASE_DOCUMENTS_BUCKET env var) for signed URLs to work; without it, download URLs return null (503) but document records are still created

---
*Phase: phase-3-renders-documents*
*Completed: 2026-03-16*
