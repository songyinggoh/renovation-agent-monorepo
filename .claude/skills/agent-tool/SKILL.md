---
name: agent-tool
description: >
  Scaffolds a new LangChain tool end-to-end: creates the tool file with Zod schema and
  error handling, registers it in tools/index.ts, adds to ALLOWED_TOOLS whitelist in
  agent-guards.ts, documents it in the relevant phase prompt(s) in prompts.ts, and
  generates the Vitest test file. Use when adding any new tool to the renovation agent.
user-invocable: true
---

# /agent-tool

End-to-end LangChain tool scaffolding for the renovation agent monorepo. Adding a new tool touches 5 files minimum — this skill walks through every one in the correct order, using the exact patterns established by existing tools.

## When to Use

- Adding a new tool the AI agent can call (DB queries, API calls, file generation, etc.)
- Adding an async/fire-and-forget tool that enqueues BullMQ jobs
- Adding a read-only tool for agent self-awareness (session state, room details, etc.)

## Invocation

```
/agent-tool <description of the new tool>
```

**Examples**:
```
/agent-tool add get_session_summary tool that reads back full session state
/agent-tool add analyze_room_photo tool using vision model
/agent-tool add calculate_budget_summary tool that aggregates costs vs budget
/agent-tool add generate_document async tool that enqueues PDF generation
```

## Files Touched (5 mandatory + 4 conditional)

| # | File | Action | Always? |
|---|------|--------|---------|
| 1 | `backend/src/tools/{name}.tool.ts` | CREATE | Yes |
| 2 | `backend/src/tools/index.ts` | Add import + array entry | Yes |
| 3 | `backend/src/utils/agent-guards.ts` | Add to `ALLOWED_TOOLS` | Yes |
| 4 | `backend/src/config/prompts.ts` | Add to relevant phase prompt(s) | Yes |
| 5 | `backend/tests/unit/tools/{name}.tool.test.ts` | CREATE | Yes |
| 6 | `packages/shared-types/src/socket-events.ts` | Add payload + event type | Only if new Socket.io events |
| 7 | `packages/shared-types/src/index.ts` | Re-export new types | Only if adding shared types |
| 8 | `packages/shared-types/src/constants.ts` | Add domain enum values | Only if new constants |
| 9 | `backend/src/services/*.service.ts` | Create/modify service | If tool needs business logic layer |

**Note**: `backend/src/services/chat.service.ts` needs NO changes — it consumes `renovationTools` generically via `model.bindTools(renovationTools)` and `new ToolNode(renovationTools)`.

## Workflow

### Step 1: Design the Tool

Gather these from the user before writing code:

| Parameter | Question | Example |
|---|---|---|
| **Tool name** | `snake_case` name | `get_session_summary` |
| **Purpose** | What does it do? | Reads back full session state for agent awareness |
| **Input schema** | What Zod fields? | `{ sessionId: z.string().uuid() }` |
| **Return shape** | What JSON does it return? | `{ success: true, data: { phase, rooms, budget } }` |
| **Phase(s)** | Which phase prompts? | ALL, or specific phases like CHECKLIST, PLAN |
| **Sync vs Async** | Does it enqueue a BullMQ job? | Sync (returns result directly) |
| **Socket.io events** | Does it emit real-time events? | No |

**Sync vs Async decision**:
- **Sync**: Tool does work and returns result directly (DB queries, calculations, simple API calls)
- **Async**: Tool enqueues a BullMQ job and returns a job ID immediately (image generation, PDF creation, long-running API calls). Use `formatAsyncToolResponse()` from agent-guards.

### Step 2: Create the Tool File

See [tool-template.md](./tool-template.md) for the complete template.

Create `backend/src/tools/{name}.tool.ts`:

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'MyToolName' });

export const myToolNameTool = tool(
  async ({ sessionId }): Promise<string> => {
    logger.info('Tool invoked: my_tool_name', { sessionId });
    try {
      // Do work...
      return JSON.stringify({ success: true, data: result });
    } catch (error) {
      logger.error('my_tool_name failed', error as Error, { sessionId });
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
  {
    name: 'my_tool_name',
    description: 'Precise description the LLM uses to decide when to call this tool.',
    schema: z.object({
      sessionId: z.string().uuid().describe('The current session ID'),
    }),
  }
);
```

**Conventions**:
- Import `tool` from `@langchain/core/tools` (NOT `DynamicTool`)
- Always import `z` from `zod` for the schema
- Always use `Logger` — never `console.log`
- All imports use `.js` extension (ESM)
- Tool function returns `Promise<string>` — always JSON
- Outer `try/catch` returns `{ success: false, error }` — never throws
- Tool `name` is `snake_case`, must exactly match `ALLOWED_TOOLS` entry
- Service instances created at module level (singleton)

### Step 3: Register in tools/index.ts

```typescript
import { myToolNameTool } from './my-tool-name.tool.js';

export const renovationTools = [
  // ...existing tools
  myToolNameTool,
];
```

### Step 4: Add to ALLOWED_TOOLS in agent-guards.ts

```typescript
export const ALLOWED_TOOLS = [
  // ...existing tools
  'my_tool_name',     // must exactly match tool's name property
] as const;
```

**If this is missed**: The `createSafeShouldContinue()` guard will log a warning and return `END`, silently preventing the agent from ever calling the tool.

### Step 5: Document in prompts.ts

Add a bullet to the `### Available Tools:` section of every phase prompt where the tool should be available:

```typescript
- **my_tool_name**: Describe exactly when the LLM should call this tool. One sentence.
```

**Phase selection guidance**:
- Read-only tools (get_session_summary): Usually ALL phases
- State-writing tools (save_intake_state): Usually 1-2 specific phases
- Async tools (generate_render): Usually the phase that triggers the work

### Step 6: Create Test File

See [test-template.md](./test-template.md) for the complete template.

Create `backend/tests/unit/tools/{name}.tool.test.ts`:

**Every test file MUST have**:
1. `vi.hoisted()` for mock values needed inside `vi.mock()` factories
2. `vi.mock()` blocks for Logger, services, db, agent-guards
3. Import the tool AFTER all mocks (critical for hoisting)
4. Tests for: tool metadata, happy path, error handling

### Step 7: Verify

```bash
cd backend && npm run prep         # lint + build
cd backend && npm run test:unit    # all tests pass
```

### Step 8: Conditional — Socket.io Events

If the tool emits new Socket.io events, also update:
1. `packages/shared-types/src/socket-events.ts` — payload interface + event in `ServerToClientEvents`
2. `packages/shared-types/src/index.ts` — re-export
3. Rebuild: `pnpm --filter @renovation/shared-types build`

Use `/socket-event` skill for this if available.

### Step 9: Conditional — Async Tool Pattern

If the tool is async (enqueues BullMQ job):

```typescript
import { formatAsyncToolResponse } from '../utils/agent-guards.js';

// In the tool function:
const job = await getMyQueue().add('my:job-type', { sessionId, ... });
return formatAsyncToolResponse('my_tool_name', job.id!, 30);
```

Add to the tool description: `"Do NOT call this tool again for the same request. The user will see results via real-time updates."`

Use `/bullmq-job` skill to scaffold the worker.

## Quick Reference

| Convention | Pattern |
|---|---|
| Tool file naming | `{kebab-case}.tool.ts` |
| Tool export naming | `{camelCase}Tool` |
| Tool `name` property | `snake_case` |
| Return type | `Promise<string>` (always JSON) |
| Error return | `{ success: false, error: string }` |
| Success return | `{ success: true, data: any, message?: string }` |
| Async return | `formatAsyncToolResponse(name, jobId, estimatedSec)` |
| Service instantiation | Module-level singleton |
| Logger service name | PascalCase tool name |

## Common Mistakes

| Mistake | Fix |
|---|---|
| Tool name in `ALLOWED_TOOLS` doesn't match tool's `name` property | Copy-paste the exact string; both must be identical `snake_case` |
| Forgot to add to `ALLOWED_TOOLS` | Agent silently can't call the tool — check logs for "attempted invalid tools" |
| Forgot to add to phase prompt | Agent doesn't know the tool exists — add to `### Available Tools` section |
| Tool throws instead of returning error JSON | Wrap entire body in try/catch, return `{ success: false }` |
| Missing `.js` extension on imports | Build fails — ESM requires `.js` on all internal imports |
| `chat.service.ts` modified | Not needed — `renovationTools` array is consumed generically |

## Key References

- [tool-template.md](./tool-template.md) — Complete tool file template with sync and async variants
- [test-template.md](./test-template.md) — Complete test file template with vi.mock patterns
