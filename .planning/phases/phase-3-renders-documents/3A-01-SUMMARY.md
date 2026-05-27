---
phase: phase-3-renders-documents
plan: 3A-01
subsystem: database
tags: [drizzle, zod, jsonb, bullmq, postgres, typescript]

# Dependency graph
requires: []
provides:
  - RenovationPlanSchema Zod schema with full nested structure (task, room, contractor, plan)
  - planData JSONB column on renovation_sessions table (typed via Drizzle $type<RenovationPlan>)
  - doc:generate-plan job type with documentType discriminator and optional roomId
  - SUPABASE_DOCUMENTS_BUCKET env var defaulting to renovation-documents
  - Drizzle migration 0008_married_stardust.sql (ALTER TABLE ADD COLUMN plan_data jsonb)
affects:
  - phase-3-renders-documents/3A-02 (DocumentService needs RenovationPlan type and planData column)
  - phase-3-renders-documents/3A-03 (LangGraph save_plan_state tool writes to planData)
  - phase-3-renders-documents/3A-04 (doc worker uses documentType discriminator)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JSONB schema pattern: Zod .passthrough() on all nested schemas for forward DB compatibility"
    - "Job type discriminator: documentType enum instead of format field for BullMQ doc jobs"
    - "SUPABASE_DOCUMENTS_BUCKET env var: separate bucket per asset type pattern"

key-files:
  created:
    - backend/drizzle/0008_married_stardust.sql
  modified:
    - backend/src/db/jsonb-schemas.ts
    - backend/src/db/schema/sessions.schema.ts
    - backend/src/config/queue.ts
    - backend/src/validators/job.validators.ts
    - backend/src/config/env.ts
    - backend/.env.example
    - backend/src/workers/doc.worker.ts

key-decisions:
  - "Use plain .string() (not .uuid()) for task IDs and roomId in RenovationPlanSchema - the LLM agent may generate task-1 style identifiers, not UUIDs"
  - "Use plain .string() (not .string().datetime()) for generatedAt and startDate - agent may produce non-strict ISO format strings"
  - "Use .nonnegative() not .positive() for all cost fields - $0 cost is valid during early planning"
  - "All nested schemas use .passthrough() to match the existing convention in jsonb-schemas.ts, allowing older DB rows with extra fields to still parse"
  - "roomId made optional in doc:generate-plan job type - plan PDFs are session-wide; only checklist PDFs target a specific room"
  - "documentType discriminator replaces format field: checklist_pdf | plan_pdf"

patterns-established:
  - "RenovationPlanSchema pattern: top-level Zod schema wraps nested room and task schemas, all exported as types"
  - "JSONB column with $type<T>(): import type from jsonb-schemas.ts, use .$type<T>() in Drizzle column definition"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-16
---

# Phase 3A Plan 01: Schema Foundation Summary

**RenovationPlanSchema Zod schema with 4 nested types, planData JSONB column on renovation_sessions, doc:generate-plan job type updated with documentType discriminator, SUPABASE_DOCUMENTS_BUCKET env var, and Drizzle migration 0008**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-16T18:36:14Z
- **Completed:** 2026-03-16T18:41:23Z
- **Tasks:** 2
- **Files modified:** 7 modified, 1 created

## Accomplishments
- Added RenovationPlanSchema to jsonb-schemas.ts with full nested structure: RenovationTaskSchema, RenovationRoomPlanSchema, ContractorRecommendationSchema, RenovationPlanSchema
- Added planData nullable JSONB column to renovation_sessions, typed via Drizzle `.$type<RenovationPlan>()`
- Updated doc:generate-plan job type from `{ sessionId, roomId, format }` to `{ sessionId, documentType, roomId? }` throughout queue, validators, and worker
- Added SUPABASE_DOCUMENTS_BUCKET env var with default `renovation-documents`
- Generated Drizzle migration `0008_married_stardust.sql` with single `ALTER TABLE renovation_sessions ADD COLUMN plan_data jsonb`

## Task Commits

Each task was committed atomically:

1. **Task 3A.1.1: Add RenovationPlanSchema to jsonb-schemas.ts** - `417d079` (feat)
2. **Task 3A.1.2: Add planData column, update job types, env var, migration** - `1c094e3` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `backend/src/db/jsonb-schemas.ts` - Added section 6: RenovationTaskSchema, RenovationRoomPlanSchema, ContractorRecommendationSchema, RenovationPlanSchema + 4 type exports
- `backend/src/db/schema/sessions.schema.ts` - Added planData JSONB column + RenovationPlan type import from jsonb-schemas
- `backend/src/config/queue.ts` - Updated JobTypes['doc:generate-plan'] with documentType discriminator, optional roomId
- `backend/src/validators/job.validators.ts` - Updated docGeneratePlanJobSchema to match new job shape
- `backend/src/config/env.ts` - Added SUPABASE_DOCUMENTS_BUCKET with default 'renovation-documents'
- `backend/.env.example` - Added commented SUPABASE_DOCUMENTS_BUCKET documentation
- `backend/src/workers/doc.worker.ts` - Updated destructuring to use documentType; updated logger and socket emit
- `backend/drizzle/0008_married_stardust.sql` - ALTER TABLE "renovation_sessions" ADD COLUMN "plan_data" jsonb

## Decisions Made
- Used plain `.string()` for task IDs (not `.uuid()`) - LLM agent generates `task-1` style IDs
- Used plain `.string()` for date fields (not `.datetime()`) - agent may produce non-strict ISO formats
- Used `.nonnegative()` for costs (not `.positive()`) - $0 cost valid during planning
- All schemas use `.passthrough()` matching existing jsonb-schemas.ts convention for forward DB compatibility

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in `src/dev-agents/supervisor.ts` (unrelated to this plan, present before execution). All files modified in this plan compile cleanly.

## User Setup Required

None - no external service configuration required. `SUPABASE_DOCUMENTS_BUCKET` uses a default value and does not require immediate setup.

## Next Phase Readiness
- Schema foundation complete: RenovationPlanSchema, planData column, job type discriminator, env var all in place
- Plan 3A-02 (DocumentService + templates) can now import RenovationPlan type and reference planData column
- Plan 3A-03 (LangGraph save_plan_state tool) can write to planData and use RenovationPlanSchema for validation
- Plan 3A-04 (worker + REST API) inherits documentType discriminator from updated job types
- Migration must be applied (`npm run db:migrate`) before any code writing to planData runs

---
*Phase: phase-3-renders-documents*
*Completed: 2026-03-16*
