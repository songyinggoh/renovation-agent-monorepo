# Tool File Template

## Sync Tool (returns result directly)

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { Logger } from '../utils/logger.js';
// Import services as needed:
// import { MyService } from '../services/my.service.js';
// Import DB if doing direct queries:
// import { db } from '../db/index.js';
// import { myTable } from '../db/schema/index.js';
// import { eq } from 'drizzle-orm';

const logger = new Logger({ serviceName: 'MyToolName' });

// Module-level service instance (singleton per worker process)
// const myService = new MyService();

export const myToolNameTool = tool(
  async ({ sessionId, param1 }): Promise<string> => {
    logger.info('Tool invoked: my_tool_name', { sessionId, param1 });

    try {
      // Option A: Direct DB query
      // const rows = await db
      //   .select()
      //   .from(myTable)
      //   .where(eq(myTable.sessionId, sessionId));

      // Option B: Service call
      // const result = await myService.doWork(sessionId, param1);

      return JSON.stringify({
        success: true,
        message: 'Description of what happened.',
        data: result,
      });
    } catch (error) {
      logger.error('my_tool_name failed', error as Error, { sessionId });
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute my_tool_name',
      });
    }
  },
  {
    name: 'my_tool_name',
    description:
      'One-paragraph description the LLM uses to decide WHEN to call this tool. ' +
      'Be specific about inputs and outputs. Mention constraints.',
    schema: z.object({
      sessionId: z.string().uuid().describe('The current renovation session ID'),
      param1: z.string().describe('Description of this parameter'),
      param2: z.number().optional().describe('Optional parameter with default behavior'),
    }),
  }
);
```

## Async Tool (enqueues BullMQ job, returns job ID)

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { Logger } from '../utils/logger.js';
import { formatAsyncToolResponse } from '../utils/agent-guards.js';
import { getMyQueue } from '../config/queue.js';

const logger = new Logger({ serviceName: 'MyAsyncToolName' });

export const myAsyncToolNameTool = tool(
  async ({ sessionId, roomId, prompt }): Promise<string> => {
    logger.info('Tool invoked: my_async_tool_name', { sessionId, roomId });

    try {
      const queue = getMyQueue();
      const job = await queue.add(
        'my:job-type',
        { sessionId, roomId, prompt },
        { jobId: `my-${sessionId}-${roomId}-${Date.now()}` }
      );

      logger.info('Job enqueued', { jobId: job.id, sessionId, roomId });

      return formatAsyncToolResponse('my_async_tool_name', job.id!, 30);
    } catch (error) {
      logger.error('my_async_tool_name failed to enqueue', error as Error, { sessionId });
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start job',
      });
    }
  },
  {
    name: 'my_async_tool_name',
    description:
      'Starts an async [description] job. Returns a job ID. ' +
      'Do NOT call this tool again for the same request. ' +
      'The user will see results via real-time updates.',
    schema: z.object({
      sessionId: z.string().uuid().describe('The current renovation session ID'),
      roomId: z.string().uuid().describe('The room to process'),
      prompt: z.string().describe('Instructions for the job'),
    }),
  }
);
```

## Tool with Nested Zod Schema

For complex inputs, define sub-schemas above the tool:

```typescript
const RoomPreferencesSchema = z.object({
  style: z.string().describe('Design style slug'),
  budget: z.number().positive().describe('Room budget in user currency'),
  priorities: z.array(z.string()).describe('Ranked list of priorities'),
});

export const saveRoomPreferencesTool = tool(
  async ({ sessionId, roomId, preferences }): Promise<string> => {
    // preferences is already typed as { style, budget, priorities }
    // ...
  },
  {
    name: 'save_room_preferences',
    description: '...',
    schema: z.object({
      sessionId: z.string().uuid().describe('Session ID'),
      roomId: z.string().uuid().describe('Room ID'),
      preferences: RoomPreferencesSchema.describe('Room design preferences'),
    }),
  }
);
```
