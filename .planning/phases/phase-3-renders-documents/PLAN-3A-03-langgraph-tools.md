---
plan: "3A.3"
wave: 2
depends_on: ["3A.1"]
title: "LangGraph tools: save_plan_state + generate_document, tool registration, prompt updates"
files_modified:
  - backend/src/tools/save-plan-state.tool.ts
  - backend/src/tools/generate-document.tool.ts
  - backend/src/tools/index.ts
  - backend/src/config/prompts.ts
  - backend/src/utils/agent-guards.ts
autonomous: true
must_haves:
  truths:
    - "save_plan_state tool validates RenovationPlanSchema and writes to sessions.planData"
    - "generate_document tool enqueues doc:generate-plan BullMQ job with documentType"
    - "Both tools are registered in renovationTools array"
    - "Both tools are whitelisted in ALLOWED_TOOLS"
    - "CHECKLIST and PLAN phase prompts document the new tools"
  artifacts:
    - path: "backend/src/tools/save-plan-state.tool.ts"
      provides: "savePlanStateTool LangGraph tool"
      exports: ["savePlanStateTool"]
    - path: "backend/src/tools/generate-document.tool.ts"
      provides: "generateDocumentTool LangGraph tool"
      exports: ["generateDocumentTool"]
    - path: "backend/src/tools/index.ts"
      provides: "Updated renovationTools array with both new tools"
      contains: "savePlanStateTool"
    - path: "backend/src/config/prompts.ts"
      provides: "Updated CHECKLIST and PLAN prompts with tool documentation"
      contains: "generate_document"
    - path: "backend/src/utils/agent-guards.ts"
      provides: "Updated ALLOWED_TOOLS with save_plan_state and generate_document"
      contains: "save_plan_state"
  key_links:
    - from: "backend/src/tools/save-plan-state.tool.ts"
      to: "backend/src/db/schema/sessions.schema.ts"
      via: "Drizzle update on renovationSessions.planData"
      pattern: "renovationSessions"
    - from: "backend/src/tools/save-plan-state.tool.ts"
      to: "backend/src/db/jsonb-schemas.ts"
      via: "RenovationPlanSchema for input validation"
      pattern: "RenovationPlanSchema"
    - from: "backend/src/tools/generate-document.tool.ts"
      to: "backend/src/config/queue.ts"
      via: "getDocQueue().add() to enqueue BullMQ job"
      pattern: "getDocQueue"
    - from: "backend/src/tools/index.ts"
      to: "backend/src/tools/save-plan-state.tool.ts"
      via: "import savePlanStateTool"
      pattern: "savePlanStateTool"
---

<objective>
Create the two new LangGraph tools (`save_plan_state` and `generate_document`), register them in the tool array, whitelist them in ALLOWED_TOOLS, and update the agent phase prompts to document their usage.

Purpose: These tools are the agent's interface to the PDF pipeline. `save_plan_state` persists the structured plan data that `generate_document` (via the worker) transforms into PDFs. This plan runs in parallel with Wave 2's DocumentService/templates because it only depends on Wave 1's schema types, not the PDF rendering code.

Output: 2 new tool files, updated index.ts, updated prompts.ts, updated agent-guards.ts.
</objective>

<context>
@backend/src/tools/save-checklist-state.tool.ts (pattern: tool() from @langchain/core/tools, Zod schema, Logger, error handling)
@backend/src/tools/generate-render.tool.ts (pattern: async tool that enqueues BullMQ job via service, formatAsyncToolResponse)
@backend/src/tools/index.ts (renovationTools array, import pattern)
@backend/src/config/prompts.ts (PHASE_PROMPTS structure, CHECKLIST and PLAN sections, {{SESSION_ID}} template var)
@backend/src/utils/agent-guards.ts (ALLOWED_TOOLS array, AllowedToolName type)
@backend/src/db/jsonb-schemas.ts (RenovationPlanSchema -- from Wave 1)
@backend/src/config/queue.ts (getDocQueue, JobTypes['doc:generate-plan'] -- updated in Wave 1)
</context>

<tasks>

<task id="3A.3.1" title="Create save_plan_state and generate_document LangGraph tools">
  <read_first>
    - backend/src/tools/save-checklist-state.tool.ts -- pattern: tool() definition, Zod schema input, Logger, try/catch, JSON.stringify return
    - backend/src/tools/generate-render.tool.ts -- pattern: async tool that calls service.requestRender, uses formatAsyncToolResponse
    - backend/src/utils/agent-guards.ts -- formatAsyncToolResponse helper function signature
    - backend/src/db/jsonb-schemas.ts -- RenovationPlanSchema (from Wave 1)
    - backend/src/config/queue.ts -- getDocQueue(), JobTypes['doc:generate-plan'] with documentType field (from Wave 1)
    - docs/research/PDF_Generation_Pipeline_Research.md -- Topic 5: save-plan-state tool definition pattern
  </read_first>
  <action>
    **1. Create `backend/src/tools/save-plan-state.tool.ts`:**

    Follow the `save-checklist-state.tool.ts` pattern (NOT the Command pattern from the research -- the existing codebase uses simple string returns, not Command objects).

    ```typescript
    import { tool } from '@langchain/core/tools';
    import { z } from 'zod';
    import { eq } from 'drizzle-orm';
    import { db } from '../db/index.js';
    import { renovationSessions } from '../db/schema/sessions.schema.js';
    import { RenovationPlanSchema } from '../db/jsonb-schemas.js';
    import { Logger } from '../utils/logger.js';

    const logger = new Logger({ serviceName: 'SavePlanStateTool' });

    export const savePlanStateTool = tool(
      async ({ sessionId, plan }): Promise<string> => {
        logger.info('Tool invoked: save_plan_state', {
          sessionId,
          totalBudget: plan.totalBudget,
          roomCount: plan.rooms.length,
        });

        try {
          // Validate plan data with RenovationPlanSchema
          const validated = RenovationPlanSchema.safeParse(plan);
          if (!validated.success) {
            const issues = validated.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
            logger.warn('Invalid plan data', undefined, { sessionId, issues });
            return JSON.stringify({
              success: false,
              error: `Invalid plan data: ${issues}`,
            });
          }

          // Verify session exists
          const [session] = await db
            .select({ id: renovationSessions.id })
            .from(renovationSessions)
            .where(eq(renovationSessions.id, sessionId))
            .limit(1);

          if (!session) {
            return JSON.stringify({
              success: false,
              error: 'Session not found',
            });
          }

          // Persist planData to the JSONB column
          await db
            .update(renovationSessions)
            .set({
              planData: validated.data,
              updatedAt: new Date(),
            })
            .where(eq(renovationSessions.id, sessionId));

          const result = {
            success: true,
            message: `Renovation plan saved successfully. Total: $${validated.data.totalBudget.toLocaleString()}, ${validated.data.totalDays} days, ${validated.data.rooms.length} rooms.`,
            sessionId,
            totalBudget: validated.data.totalBudget,
            totalDays: validated.data.totalDays,
            roomCount: validated.data.rooms.length,
          };

          logger.info('Plan state saved', {
            sessionId,
            totalBudget: validated.data.totalBudget,
            totalDays: validated.data.totalDays,
            roomCount: validated.data.rooms.length,
          });

          return JSON.stringify(result);
        } catch (error) {
          logger.error('save_plan_state failed', error as Error, { sessionId });
          return JSON.stringify({
            success: false,
            error: 'Failed to save plan state',
          });
        }
      },
      {
        name: 'save_plan_state',
        description:
          'Save the complete structured renovation plan to the database. Call this once the plan is fully elaborated with rooms, tasks, budget, and timeline. This data is required before generating a plan PDF document.',
        schema: z.object({
          sessionId: z.string().uuid().describe('The current session ID'),
          plan: RenovationPlanSchema.describe('The complete renovation plan object'),
        }),
      }
    );
    ```

    **2. Create `backend/src/tools/generate-document.tool.ts`:**

    Follow the `generate-render.tool.ts` pattern (enqueue BullMQ job, return formatAsyncToolResponse).

    ```typescript
    import { tool } from '@langchain/core/tools';
    import { z } from 'zod';
    import { getDocQueue } from '../config/queue.js';
    import { formatAsyncToolResponse } from '../utils/agent-guards.js';
    import { Logger } from '../utils/logger.js';

    const logger = new Logger({ serviceName: 'GenerateDocumentTool' });

    export const generateDocumentTool = tool(
      async ({ sessionId, documentType, roomId }): Promise<string> => {
        logger.info('Tool invoked: generate_document', {
          sessionId,
          documentType,
          roomId,
        });

        try {
          const queue = getDocQueue();
          const job = await queue.add(
            'doc:generate',
            {
              sessionId,
              documentType,
              ...(roomId ? { roomId } : {}),
            },
          );

          logger.info('Document generation job enqueued', {
            jobId: job.id,
            sessionId,
            documentType,
            roomId,
          });

          return formatAsyncToolResponse('generate_document', job.id ?? sessionId, 30);
        } catch (error) {
          logger.error('generate_document failed', error as Error, {
            sessionId,
            documentType,
          });
          return JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to generate document',
          });
        }
      },
      {
        name: 'generate_document',
        description:
          'Generate a PDF document for the renovation session. Use documentType "checklist_pdf" to generate a checklist PDF (optionally scoped to a room with roomId), or "plan_pdf" to generate the full renovation plan PDF (requires save_plan_state to have been called first). The document generates asynchronously -- inform the user it will appear shortly.',
        schema: z.object({
          sessionId: z.string().uuid().describe('The current session ID'),
          documentType: z.enum(['checklist_pdf', 'plan_pdf']).describe(
            'Type of document to generate: "checklist_pdf" for room checklists, "plan_pdf" for the full renovation plan'
          ),
          roomId: z.string().uuid().optional().describe(
            'Optional room ID to scope a checklist PDF to a single room. Ignored for plan_pdf.'
          ),
        }),
      }
    );
    ```
  </action>
  <acceptance_criteria>
    - `test -f backend/src/tools/save-plan-state.tool.ts && echo "exists"` prints "exists"
    - `test -f backend/src/tools/generate-document.tool.ts && echo "exists"` prints "exists"
    - `grep -n "export const savePlanStateTool" backend/src/tools/save-plan-state.tool.ts` finds the export
    - `grep -n "export const generateDocumentTool" backend/src/tools/generate-document.tool.ts` finds the export
    - `grep -n "name: 'save_plan_state'" backend/src/tools/save-plan-state.tool.ts` finds the tool name
    - `grep -n "name: 'generate_document'" backend/src/tools/generate-document.tool.ts` finds the tool name
    - `grep -n "RenovationPlanSchema" backend/src/tools/save-plan-state.tool.ts` confirms schema import
    - `grep -n "getDocQueue" backend/src/tools/generate-document.tool.ts` confirms queue usage
    - `grep -n "formatAsyncToolResponse" backend/src/tools/generate-document.tool.ts` confirms response pattern
    - `cd backend && npx tsc --noEmit` passes with no errors
  </acceptance_criteria>
</task>

<task id="3A.3.2" title="Register tools in index.ts, whitelist in ALLOWED_TOOLS, update phase prompts">
  <read_first>
    - backend/src/tools/index.ts -- current imports and renovationTools array
    - backend/src/utils/agent-guards.ts -- ALLOWED_TOOLS array, AllowedToolName type
    - backend/src/config/prompts.ts -- CHECKLIST and PLAN phase prompt text, {{SESSION_ID}} pattern
  </read_first>
  <action>
    **1. Update `backend/src/tools/index.ts`:**

    Add two new imports (in alphabetical order with existing imports):
    ```typescript
    import { generateDocumentTool } from './generate-document.tool.js';
    import { savePlanStateTool } from './save-plan-state.tool.js';
    ```

    Add both tools to the `renovationTools` array:
    ```typescript
    export const renovationTools = [
      getStyleExamplesTool,
      searchProductsTool,
      saveIntakeStateTool,
      saveChecklistStateTool,
      saveProductRecommendationTool,
      generateRenderTool,
      saveRendersStateTool,
      savePlanStateTool,
      generateDocumentTool,
    ];
    ```

    **2. Update `backend/src/utils/agent-guards.ts`:**

    Add `'save_plan_state'` and `'generate_document'` to the `ALLOWED_TOOLS` array:
    ```typescript
    export const ALLOWED_TOOLS = [
      'get_style_examples',
      'search_products',
      'save_intake_state',
      'save_checklist_state',
      'save_product_recommendation',
      'generate_render',
      'save_renders_state',
      'save_plan_state',
      'generate_document',
    ] as const;
    ```

    The `AllowedToolName` type auto-derives from this array, so no other changes needed.

    **3. Update `backend/src/config/prompts.ts` -- CHECKLIST phase:**

    In the CHECKLIST phase prompt, add `generate_document` to the "Available Tools" section. Add this block after the existing `save_product_recommendation` entry:

    ```
    - **generate_document**: After completing checklists for all rooms, offer to generate a downloadable checklist PDF. Parameters:
      - sessionId: The current session ID
      - documentType: Use "checklist_pdf"
      - roomId: (optional) Scope to a specific room, or omit for all rooms
      The document generates asynchronously -- inform the user it will appear shortly.
    ```

    Also add to the Instructions section:
    ```
    - After completing checklists for all rooms, offer to generate a checklist PDF using generate_document
    ```

    **4. Update `backend/src/config/prompts.ts` -- PLAN phase:**

    In the PLAN phase prompt, add BOTH `save_plan_state` and `generate_document` to the "Available Tools" section. Add these blocks after the existing tools:

    ```
    - **save_plan_state**: Once you've built a complete renovation plan with rooms, tasks, budget, and timeline, use this tool to save the structured plan data. Parameters:
      - sessionId: The current session ID
      - plan: Object with { summary, totalBudget, totalDays, rooms: [{ roomId, roomName, tasks, estimatedCost, estimatedDays }], contractors, warnings, generatedAt }
      You MUST call this before generating a plan PDF.
    - **generate_document**: After saving the plan, offer to generate a downloadable PDF. Parameters:
      - sessionId: The current session ID
      - documentType: Use "plan_pdf" for the full renovation plan, or "checklist_pdf" for room checklists
      The document generates asynchronously -- inform the user it will appear shortly.
    ```

    Also update the Instructions section to include:
    ```
    - Once the plan is complete, save it using save_plan_state
    - After saving, offer to generate a plan PDF using generate_document
    ```

    **IMPORTANT:** Keep the `{{SESSION_ID}}` template variable reference at the end of each phase. Do NOT modify other phases (INTAKE, RENDER, etc.).
  </action>
  <acceptance_criteria>
    - `grep -n "savePlanStateTool" backend/src/tools/index.ts` finds the import and array entry
    - `grep -n "generateDocumentTool" backend/src/tools/index.ts` finds the import and array entry
    - `grep -c "Tool" backend/src/tools/index.ts` returns at least 9 (7 existing + 2 new)
    - `grep -n "save_plan_state" backend/src/utils/agent-guards.ts` finds it in ALLOWED_TOOLS
    - `grep -n "generate_document" backend/src/utils/agent-guards.ts` finds it in ALLOWED_TOOLS
    - `grep -c "'" backend/src/utils/agent-guards.ts | head -1` -- ALLOWED_TOOLS array has 9 entries
    - `grep -n "generate_document" backend/src/config/prompts.ts` finds it in CHECKLIST and PLAN prompts
    - `grep -n "save_plan_state" backend/src/config/prompts.ts` finds it in PLAN prompt
    - `grep -c "generate_document" backend/src/config/prompts.ts` returns at least 2 (CHECKLIST + PLAN)
    - `cd backend && npx tsc --noEmit` passes with no errors
  </acceptance_criteria>
</task>

</tasks>

<verification>
```bash
cd backend
npx tsc --noEmit                     # Type-check passes
npm run lint                         # No linter errors
grep "save_plan_state" src/utils/agent-guards.ts  # In ALLOWED_TOOLS
grep "generate_document" src/utils/agent-guards.ts  # In ALLOWED_TOOLS
grep "savePlanStateTool" src/tools/index.ts   # In renovationTools
grep "generateDocumentTool" src/tools/index.ts  # In renovationTools
```
</verification>

<success_criteria>
- `save_plan_state` tool validates plan data, writes to `sessions.planData`, returns JSON result
- `generate_document` tool enqueues `doc:generate-plan` job with `documentType` field
- Both tools registered in `renovationTools` array
- Both tools whitelisted in `ALLOWED_TOOLS`
- CHECKLIST prompt documents `generate_document` tool
- PLAN prompt documents both `save_plan_state` and `generate_document` tools
- `npx tsc --noEmit` passes in backend
</success_criteria>

<output>
After completion, create `.planning/phases/phase-3-renders-documents/3A-03-SUMMARY.md`
</output>
