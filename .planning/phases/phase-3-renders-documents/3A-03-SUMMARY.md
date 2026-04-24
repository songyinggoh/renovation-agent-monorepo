---
phase: phase-3-renders-documents
plan: 3A-03
subsystem: api
tags: [langchain, langgraph, bullmq, drizzle, zod, typescript]

# Dependency graph
requires:
  - phase: phase-3-renders-documents/3A-01
    provides: RenovationPlanSchema in jsonb-schemas.ts, planData column in sessions schema, doc:generate-plan job type in queue.ts
provides:
  - savePlanStateTool: validates RenovationPlanSchema, writes to sessions.planData via Drizzle
  - generateDocumentTool: enqueues doc:generate-plan BullMQ job with documentType
  - renovationTools array updated with 9 tools total
  - ALLOWED_TOOLS whitelist updated with save_plan_state and generate_document
  - CHECKLIST prompt documents generate_document with usage instructions
  - PLAN prompt documents save_plan_state + generate_document with usage instructions
affects:
  - phase-3-renders-documents/3A-04 (worker will process jobs enqueued by generateDocumentTool)
  - any future phase using the agent's tool set

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "LangGraph tool pattern: tool() from @langchain/core/tools with Zod schema, Logger, try/catch, JSON.stringify return"
    - "Async tool pattern: getDocQueue().add() + formatAsyncToolResponse() for fire-and-forget BullMQ jobs"
    - "ALLOWED_TOOLS whitelist auto-derives AllowedToolName type via 'as const'"

key-files:
  created:
    - backend/src/tools/save-plan-state.tool.ts
    - backend/src/tools/generate-document.tool.ts
  modified:
    - backend/src/tools/index.ts
    - backend/src/utils/agent-guards.ts
    - backend/src/config/prompts.ts

key-decisions:
  - "Job name in queue.add() set to 'doc:generate-plan' to match JobTypes key pattern (plan specified 'doc:generate' which would be inconsistent)"
  - "Imports in tools/index.ts sorted alphabetically to maintain consistency"

patterns-established:
  - "Async BullMQ tool pattern: call getXxxQueue().add(jobName, payload) then return formatAsyncToolResponse()"
  - "Synchronous DB tool pattern: validate with Zod safeParse, verify session exists, update JSONB column, return JSON result"

requirements-completed: []

# Metrics
duration: 7min
completed: 2026-03-16
---

# Phase 3A Plan 03: LangGraph tools Summary

**Two new agent tools wired to the PDF pipeline: `save_plan_state` persists structured plan JSONB, `generate_document` enqueues BullMQ doc jobs - both registered and whitelisted, CHECKLIST + PLAN prompts updated**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-16T18:43:20Z
- **Completed:** 2026-03-16T18:50:50Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `save-plan-state.tool.ts`: validates input against `RenovationPlanSchema`, verifies session exists in DB, writes to `sessions.planData` JSONB column, returns structured JSON result
- Created `generate-document.tool.ts`: calls `getDocQueue().add('doc:generate-plan', {...})`, uses `formatAsyncToolResponse()` pattern for fire-and-forget async coordination
- Registered both tools in `renovationTools` array (9 total) and `ALLOWED_TOOLS` whitelist
- Updated CHECKLIST phase prompt to document `generate_document` with usage guidance and post-checklist instruction
- Updated PLAN phase prompt to document both `save_plan_state` (must-call-before-PDF) and `generate_document`

## Task Commits

Each task was committed atomically:

1. **Task 3A.3.1: Create save_plan_state and generate_document LangGraph tools** - `aa3ab3d` (feat)
2. **Task 3A.3.2: Register tools in index.ts, whitelist in ALLOWED_TOOLS, update phase prompts** - `59e8dd5` (feat)

**Plan metadata:** (see docs commit below)

## Files Created/Modified
- `backend/src/tools/save-plan-state.tool.ts` - New tool: validates RenovationPlanSchema, persists plan to sessions.planData
- `backend/src/tools/generate-document.tool.ts` - New tool: enqueues doc:generate-plan BullMQ job
- `backend/src/tools/index.ts` - Added imports and array entries for both new tools (9 tools total)
- `backend/src/utils/agent-guards.ts` - Added 'save_plan_state' and 'generate_document' to ALLOWED_TOOLS (9 entries)
- `backend/src/config/prompts.ts` - Updated CHECKLIST and PLAN phase prompts with tool documentation and instructions

## Decisions Made
- Job name in `queue.add()` corrected from plan's `'doc:generate'` to `'doc:generate-plan'` to match the `JobTypes` key pattern established in queue.ts (all other workers use the full job type key as job name)
- Imports in `tools/index.ts` sorted alphabetically for consistency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected job name from 'doc:generate' to 'doc:generate-plan'**
- **Found during:** Task 3A.3.1 (generate-document.tool.ts creation)
- **Issue:** Plan code snippet specified `queue.add('doc:generate', ...)` but existing pattern in `render.service.ts` uses the full JobTypes key (`'render:generate'`). Using `'doc:generate'` would be inconsistent and potentially confusing.
- **Fix:** Used `'doc:generate-plan'` to match the established JobTypes key pattern
- **Files modified:** backend/src/tools/generate-document.tool.ts
- **Verification:** Matches JobTypes['doc:generate-plan'] key in queue.ts
- **Committed in:** aa3ab3d (Task 3A.3.1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor naming correction for consistency. No scope change.

## Issues Encountered
- Pre-existing `supervisor.ts` TypeScript errors (unrelated to this plan) show up in `tsc --noEmit` output - confirmed pre-existing before any changes, not introduced by this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tools are ready for 3A.4 (worker REST API) - the `generate_document` tool will enqueue jobs that the doc worker (already skeleton-implemented) processes
- `save_plan_state` stores structured data that feeds the PDF template renderer
- Both tools are live in the agent's tool set and will be invoked during CHECKLIST/PLAN phases

---
*Phase: phase-3-renders-documents*
*Completed: 2026-03-16*
