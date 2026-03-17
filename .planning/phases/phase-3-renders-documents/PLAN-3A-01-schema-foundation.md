---
plan: "3A.1"
wave: 1
depends_on: []
title: "Schema foundation: planData column, RenovationPlan Zod schema, job type update, env var"
files_modified:
  - backend/src/db/schema/sessions.schema.ts
  - backend/src/db/jsonb-schemas.ts
  - backend/src/config/queue.ts
  - backend/src/validators/job.validators.ts
  - backend/src/config/env.ts
  - backend/.env.example
autonomous: true
must_haves:
  truths:
    - "renovation_sessions table has a plan_data JSONB column"
    - "RenovationPlanSchema Zod schema validates structured plan data at runtime"
    - "doc:generate-plan job type includes documentType discriminator"
    - "SUPABASE_DOCUMENTS_BUCKET env var defaults to renovation-documents"
  artifacts:
    - path: "backend/src/db/jsonb-schemas.ts"
      provides: "RenovationPlanSchema, RenovationPlan type"
      exports: ["RenovationPlanSchema", "RenovationPlan"]
    - path: "backend/src/db/schema/sessions.schema.ts"
      provides: "planData column on renovationSessions"
      contains: "planData"
    - path: "backend/src/config/queue.ts"
      provides: "documentType field on doc:generate-plan JobTypes"
      contains: "documentType"
    - path: "backend/src/config/env.ts"
      provides: "SUPABASE_DOCUMENTS_BUCKET env var"
      contains: "SUPABASE_DOCUMENTS_BUCKET"
  key_links:
    - from: "backend/src/db/schema/sessions.schema.ts"
      to: "backend/src/db/jsonb-schemas.ts"
      via: "RenovationPlan type import for $type<>"
      pattern: "import.*RenovationPlan.*jsonb-schemas"
    - from: "backend/src/validators/job.validators.ts"
      to: "backend/src/config/queue.ts"
      via: "Zod schema shape matches JobTypes interface"
      pattern: "documentType"
---

<objective>
Add the schema foundation that every other Phase 3A plan depends on: the `planData` JSONB column on `renovation_sessions`, the `RenovationPlanSchema` Zod schema in `jsonb-schemas.ts`, the `documentType` field on the `doc:generate-plan` job type, and the `SUPABASE_DOCUMENTS_BUCKET` env var.

Purpose: Without these shared types and schema changes, neither the DocumentService, LangGraph tools, nor the worker can be built. This is the dependency root for all of Phase 3A.

Output: Modified schema files, Zod schemas, job type definitions, env config. Drizzle migration generated.
</objective>

<context>
@backend/src/db/schema/sessions.schema.ts
@backend/src/db/jsonb-schemas.ts
@backend/src/config/queue.ts
@backend/src/validators/job.validators.ts
@backend/src/config/env.ts
@backend/.env.example
@docs/research/PDF_Generation_Pipeline_Research.md (Topic 5: save-plan-state pattern)
</context>

<tasks>

<task id="3A.1.1" title="Add RenovationPlanSchema to jsonb-schemas.ts">
  <read_first>
    - backend/src/db/jsonb-schemas.ts -- existing Zod schema patterns (passthrough, naming conventions)
    - docs/research/PDF_Generation_Pipeline_Research.md -- Topic 5 has the exact Zod schema definition
  </read_first>
  <action>
    Add a new section 6 to `backend/src/db/jsonb-schemas.ts` after the ProductCatalogMetadataSchema (section 5).

    Define these schemas in order:

    ```typescript
    // ---------------------------------------------------------------------------
    // 6. renovation_sessions.plan_data  (RenovationPlan)
    // ---------------------------------------------------------------------------
    export const RenovationTaskSchema = z.object({
      id: z.string().describe('Unique task identifier'),
      description: z.string().describe('Human-readable task description'),
      estimatedCost: z.number().nonnegative().describe('Estimated cost in USD'),
      duration: z.number().int().positive().describe('Duration in calendar days'),
      tradeCategory: z.enum([
        'electrical', 'plumbing', 'carpentry', 'painting',
        'flooring', 'tiling', 'hvac', 'general',
      ]).describe('Trade category for contractor matching'),
      priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
      dependencies: z.array(z.string()).default([])
        .describe('IDs of tasks that must complete first'),
    }).passthrough();

    export const RenovationRoomPlanSchema = z.object({
      roomId: z.string().describe('Room UUID'),
      roomName: z.string().describe('Human-readable room name'),
      tasks: z.array(RenovationTaskSchema).min(1),
      estimatedCost: z.number().nonnegative().describe('Total estimated cost for this room'),
      estimatedDays: z.number().int().positive().describe('Total estimated days for this room'),
    }).passthrough();

    export const ContractorRecommendationSchema = z.object({
      specialty: z.string().describe('Contractor trade specialty'),
      estimatedCost: z.number().nonnegative().describe('Estimated cost for this contractor'),
      notes: z.string().optional().describe('Additional notes'),
    }).passthrough();

    export const RenovationPlanSchema = z.object({
      summary: z.string().describe('Executive summary of the renovation plan'),
      totalBudget: z.number().nonnegative().describe('Total estimated cost in USD'),
      totalDays: z.number().int().positive().describe('Total estimated calendar days'),
      startDate: z.string().optional().describe('Proposed start date (ISO 8601)'),
      rooms: z.array(RenovationRoomPlanSchema),
      contractors: z.array(ContractorRecommendationSchema).default([]),
      warnings: z.array(z.string()).default([])
        .describe('Flagged risks or permit requirements'),
      generatedAt: z.string().describe('Plan generation timestamp (ISO 8601)'),
    }).passthrough();

    export type RenovationPlan = z.infer<typeof RenovationPlanSchema>;
    export type RenovationTask = z.infer<typeof RenovationTaskSchema>;
    export type RenovationRoomPlan = z.infer<typeof RenovationRoomPlanSchema>;
    export type ContractorRecommendation = z.infer<typeof ContractorRecommendationSchema>;
    ```

    IMPORTANT notes:
    - Use `.passthrough()` on all schemas to match the existing convention in this file (allows older DB rows with extra keys to still parse).
    - Use `.nonnegative()` not `.positive()` for costs (a $0 room is valid during planning).
    - Use `.describe()` on all fields (the LLM uses these descriptions when populating tool schemas).
    - Do NOT use `.uuid()` on task IDs or roomId -- the agent may generate non-UUID identifiers (e.g., `task-1`). Use plain `.string()`.
    - Use `.string()` not `.string().datetime()` for `generatedAt` and `startDate` -- the agent may produce non-strict ISO formats and `.datetime()` rejects them silently.
  </action>
  <acceptance_criteria>
    - `grep -n "RenovationPlanSchema" backend/src/db/jsonb-schemas.ts` shows the schema definition
    - `grep -n "export type RenovationPlan" backend/src/db/jsonb-schemas.ts` shows the type export
    - `grep -n "RenovationTaskSchema" backend/src/db/jsonb-schemas.ts` shows the nested task schema
    - `grep -c "passthrough" backend/src/db/jsonb-schemas.ts` returns at least 9 (5 existing + 4 new)
    - `cd backend && npx tsc --noEmit` passes with no errors
  </acceptance_criteria>
</task>

<task id="3A.1.2" title="Add planData column to sessions schema + update job types + env var">
  <read_first>
    - backend/src/db/schema/sessions.schema.ts -- current table shape, import style
    - backend/src/config/queue.ts -- current JobTypes interface and doc:generate-plan shape
    - backend/src/validators/job.validators.ts -- current docGeneratePlanJobSchema shape
    - backend/src/config/env.ts -- existing env var pattern (SUPABASE_STORAGE_BUCKET)
    - backend/.env.example -- current env var documentation
  </read_first>
  <action>
    **1. Update `backend/src/db/schema/sessions.schema.ts`:**

    Add import at the top:
    ```typescript
    import { type RenovationPlan } from '../jsonb-schemas.js';
    ```

    Add `planData` column to the `renovationSessions` table definition, after the `stylePreferences` column:
    ```typescript
    // AI-generated structured renovation plan (Phase 3: Documents)
    planData: jsonb('plan_data').$type<RenovationPlan>(),
    ```

    Note: This is nullable (no `.notNull()`) -- sessions only get plan data when the agent calls `save_plan_state` during the PLAN phase.

    **2. Update `backend/src/config/queue.ts` JobTypes interface:**

    Change the `'doc:generate-plan'` entry from:
    ```typescript
    'doc:generate-plan': { sessionId: string; roomId: string; format: 'pdf' | 'html' };
    ```
    to:
    ```typescript
    'doc:generate-plan': { sessionId: string; documentType: 'checklist_pdf' | 'plan_pdf'; roomId?: string };
    ```

    Key changes:
    - `roomId` is now **optional** (plan PDFs are session-wide, only checklist PDFs may target a room)
    - `format` field removed, replaced by `documentType` discriminator
    - Two supported types: `checklist_pdf` and `plan_pdf`

    **3. Update `backend/src/validators/job.validators.ts`:**

    Replace the `docGeneratePlanJobSchema` definition:
    ```typescript
    export const docGeneratePlanJobSchema = z.object({
      sessionId: z.string().uuid(),
      documentType: z.enum(['checklist_pdf', 'plan_pdf']),
      roomId: z.string().uuid().optional(),
    });
    ```

    Update the type export:
    ```typescript
    export type DocGeneratePlanJobData = z.infer<typeof docGeneratePlanJobSchema>;
    ```

    **4. Update `backend/src/config/env.ts`:**

    Add `SUPABASE_DOCUMENTS_BUCKET` to the envSchema, in the "Supabase Storage" section (after `SUPABASE_STYLE_BUCKET`):
    ```typescript
    SUPABASE_DOCUMENTS_BUCKET: z.string().default('renovation-documents'),
    ```

    **5. Update `backend/.env.example`:**

    In the "Supabase Storage" section, add:
    ```
    # SUPABASE_DOCUMENTS_BUCKET=renovation-documents
    ```

    **6. Update `backend/src/workers/doc.worker.ts`:**

    The existing worker destructures `{ sessionId, roomId, format }` from parsed job data. Update it to match the new shape:
    ```typescript
    const { sessionId, documentType, roomId } = parsed.data;
    ```

    Also update the logger call and the emitToSession call to use `documentType` instead of `format`:
    ```typescript
    logger.info('Document generation job received (no-op)', {
      jobId: job.id,
      sessionId,
      documentType,
      roomId,
    });

    emitToSession(sessionId, 'doc:generated', { sessionId, documentType, roomId });
    ```

    And update the `DocJobData` type alias at the top if needed (it derives from `JobTypes['doc:generate-plan']` so it will auto-update).

    **7. Generate Drizzle migration:**

    Run `cd backend && npm run db:generate` to generate a migration for the new `plan_data` column. The migration file will be created in `backend/drizzle/` as `0008_*.sql`.

    Verify the generated SQL adds a single column:
    ```sql
    ALTER TABLE "renovation_sessions" ADD COLUMN "plan_data" jsonb;
    ```

    If the generated migration contains anything beyond this single ALTER TABLE, investigate and adjust.
  </action>
  <acceptance_criteria>
    - `grep -n "planData" backend/src/db/schema/sessions.schema.ts` shows the column definition
    - `grep -n "import.*RenovationPlan.*jsonb-schemas" backend/src/db/schema/sessions.schema.ts` shows the type import
    - `grep -n "documentType" backend/src/config/queue.ts` shows the new field in JobTypes
    - `grep -n "documentType" backend/src/validators/job.validators.ts` shows the updated Zod schema
    - `grep -n "SUPABASE_DOCUMENTS_BUCKET" backend/src/config/env.ts` shows the env var
    - `grep -n "SUPABASE_DOCUMENTS_BUCKET" backend/.env.example` shows the documentation
    - `grep -n "documentType" backend/src/workers/doc.worker.ts` shows the updated destructuring
    - `ls backend/drizzle/0008_*.sql` exists (migration was generated)
    - `grep "plan_data" backend/drizzle/0008_*.sql` shows the ALTER TABLE
    - `cd backend && npx tsc --noEmit` passes with no errors
  </acceptance_criteria>
</task>

</tasks>

<verification>
```bash
cd backend
npx tsc --noEmit         # Type-check passes (all imports resolve, JobTypes match validators)
npm run lint             # No linter errors
ls drizzle/0008_*.sql    # Migration file exists
grep "plan_data" drizzle/0008_*.sql  # Migration adds the column
```
</verification>

<success_criteria>
- `RenovationPlanSchema` exported from `jsonb-schemas.ts` with full nested structure
- `planData` column defined on `renovationSessions` with `$type<RenovationPlan>()`
- `doc:generate-plan` job type uses `documentType: 'checklist_pdf' | 'plan_pdf'` and optional `roomId`
- `docGeneratePlanJobSchema` Zod schema matches the updated JobTypes
- `SUPABASE_DOCUMENTS_BUCKET` env var defaults to `'renovation-documents'`
- `doc.worker.ts` uses the new `documentType` field (not old `format`)
- Drizzle migration `0008_*.sql` generated with `ALTER TABLE ... ADD COLUMN plan_data jsonb`
- `npx tsc --noEmit` passes in backend
</success_criteria>

<output>
After completion, create `.planning/phases/phase-3-renders-documents/3A-01-SUMMARY.md`
</output>
