---
phase: phase-3-renders-documents
plan: 3A-02
subsystem: api
tags: [puppeteer, handlebars, pdf, supabase-storage, document-service, chromium]

# Dependency graph
requires:
  - phase: phase-3-renders-documents/3A-01
    provides: document-artifacts schema, RenovationPlanSchema in jsonb-schemas.ts, isPdfEnabled/SUPABASE_DOCUMENTS_BUCKET in env.ts
provides:
  - DocumentService class with generateChecklist, generatePlan, getDocuments, close methods
  - Handlebars templates: checklist.hbs, renovation-plan.hbs with shared print-styles partial
  - Browser pool pattern recycling after 50 jobs
  - Supabase Storage upload with graceful fallback when not configured
  - Version tracking via previousVersionId chain in document_artifacts
affects:
  - phase-3-renders-documents/3A-03 (LangGraph tools call DocumentService)
  - phase-3-renders-documents/3A-04 (REST API calls DocumentService.getDocuments)

# Tech tracking
tech-stack:
  added:
    - puppeteer-core (already in dependencies)
    - "@sparticuz/chromium" (already in devDependencies)
    - handlebars (already in dependencies)
  patterns:
    - Browser pool singleton with recycle-after-N pattern for Puppeteer memory management
    - Handlebars partials for shared print CSS across PDF templates
    - Storage-optional pattern (graceful fallback when Supabase not configured)
    - Version chain linking via previousVersionId in document_artifacts

key-files:
  created:
    - backend/src/services/document.service.ts
    - backend/src/templates/partials/print-styles.hbs
    - backend/src/templates/checklist.hbs
    - backend/src/templates/renovation-plan.hbs
  modified: []

key-decisions:
  - "Used chromium.setGraphicsMode = false (not setHeadlessMode) — @sparticuz/chromium API only has setGraphicsMode setter"
  - "Products array is empty in checklist template data — deferred to future enhancement as plan specified"
  - "RenovationPlanSchema.parse() (not safeParse) for planData — throws on malformed data, caught by worker"
  - "Storage-optional: when supabaseAdmin is null, PDF buffer size is recorded in DB but file not uploaded"
  - "Handlebars partial name is 'print-styles' (with hyphen) to match {{> print-styles}} template syntax"

patterns-established:
  - "DocumentService: singleton class with private browser pool, public generateX/getX/close methods"
  - "Template compilation at module load (not per-request) for performance"
  - "fmtCurrency/fmtDate helpers for template data formatting (separate from Handlebars helpers)"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 3A Plan 02: DocumentService + Handlebars templates Summary

**Puppeteer PDF pipeline via DocumentService with browser pool (recycle/50), 3 Handlebars templates (print-styles partial, checklist, renovation-plan), Supabase Storage upload, and document_artifacts versioning**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T18:43:41Z
- **Completed:** 2026-03-16T18:51:50Z
- **Tasks:** 2/2
- **Files modified:** 4 created

## Accomplishments
- DocumentService with generateChecklist (queries rooms.checklist JSONB, renders PDF), generatePlan (validates planData via RenovationPlanSchema.parse, renders PDF), getDocuments (lists artifacts with signed URLs), and close (browser cleanup)
- Handlebars templates: print-styles partial with A4 @page CSS, badge variants, budget callout, summary grid; checklist template with room/checklist/products iteration; renovation-plan template with warnings, room task tables, contractor cards
- Browser pool: recycle after 50 jobs, force-kills stuck chrome processes, per-page close to prevent tab memory accumulation
- Storage-optional: graceful fallback when Supabase not configured, proceeds with DB record only

## Task Commits

Each task was committed atomically:

1. **Task 3A.2.1: Create Handlebars templates** - `da3d4c3` (feat)
2. **Task 3A.2.2: Create DocumentService** - committed in `59e8dd5` alongside 3A-03 tasks (feat)

Note: document.service.ts was included in the 3A-03 commit because that plan ran concurrently and staged the file before a standalone commit was made.

## Files Created/Modified
- `backend/src/templates/partials/print-styles.hbs` - Shared print CSS partial with @page A4, badge variants, budget callout, summary grid, checklist box, contractor card, warning box
- `backend/src/templates/checklist.hbs` - Checklist PDF template with room iteration, checklist table, products table
- `backend/src/templates/renovation-plan.hbs` - Renovation plan PDF template with summary grid, warnings, room task tables, contractor cards
- `backend/src/services/document.service.ts` - DocumentService class: browser pool, renderPdf, uploadPdf, createSignedUrl, getNextVersion, insertArtifact, generateChecklist, generatePlan, getDocuments, close

## Decisions Made
- Used `chromium.setGraphicsMode = false` only (not `setHeadlessMode`) - the `@sparticuz/chromium` v143 API exposes only `setGraphicsMode` as a setter; headless mode is set via `headless: true` in `puppeteer.launch()`. The research doc's reference to `setHeadlessMode` was for an older API version.
- Products array empty in checklist template: product recommendations deferred to future enhancement as specified in the plan notes.
- `RenovationPlanSchema.parse()` (throws) over `.safeParse()` (returns result) — the worker that calls generatePlan is responsible for catching and handling parse errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed non-existent setHeadlessMode call**
- **Found during:** Task 3A.2.2 (DocumentService implementation)
- **Issue:** Research doc referenced `chromium.setHeadlessMode = true` but @sparticuz/chromium v143 only has `setGraphicsMode` setter in its type definitions; calling `setHeadlessMode` would throw TS2339
- **Fix:** Removed `chromium.setHeadlessMode = true` line; headless mode already handled by `headless: true` in `puppeteer.launch()`
- **Files modified:** `backend/src/services/document.service.ts`
- **Verification:** `npx tsc --noEmit` passes with no errors in document.service.ts
- **Committed in:** `59e8dd5` (part of task commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Fix necessary for TypeScript compilation. No scope change.

## Issues Encountered
- Pre-existing `supervisor.ts` type errors from @langchain/langgraph-supervisor version mismatch — not related to this plan, not fixed (out of scope).

## Next Phase Readiness
- DocumentService is ready for 3A-03 (LangGraph tools) to call `generateChecklist` and `generatePlan`
- DocumentService is ready for 3A-04 (REST API) to call `getDocuments`
- Templates compile correctly and produce valid HTML with print CSS
- No blockers for next wave

---
*Phase: phase-3-renders-documents*
*Completed: 2026-03-16*
