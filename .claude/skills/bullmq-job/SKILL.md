---
name: bullmq-job
description: >
  Scaffolds a complete new BullMQ job type end-to-end: adds the job to the JobTypes interface
  and WORKER_PROFILES in queue.ts, creates the worker file with Zod validation and
  UnrecoverableError branching, adds the Zod schema to job.validators.ts, adds the
  lazy-initialized queue getter, wires the worker startup in server.ts, registers shutdown
  cleanup, and generates the Vitest test file. Use when adding any new background job type.
user-invocable: true
---

# /bullmq-job

End-to-end BullMQ job type scaffolding for the renovation agent monorepo. Adding a new job type touches 6 files — this skill walks through every one in the correct order, using the exact patterns established by the existing workers.

## When to Use

- Adding a new background job type (image processing, PDF generation, API calls, etc.)
- Adding a variant of an existing job type (e.g., `doc:generate-checklist` alongside `doc:generate-plan`)
- Migrating synchronous work to a background queue

## Invocation

```
/bullmq-job <description of the new job>
```

**Examples**:
```
/bullmq-job add ai:analyze-floorplan job with 60s timeout and concurrency 2
/bullmq-job add doc:generate-checklist as variant of doc:generate-plan
/bullmq-job add payment:process-invoice with Stripe API integration
/bullmq-job add notification:push-mobile with rate limiting 10/sec
```

## Files Touched (6)

Every new job type requires changes to these files, in this order:

| # | File | Change |
|---|---|---|
| 1 | `backend/src/config/queue.ts` | Add to `JobTypes` interface, `WORKER_PROFILES`, queue getter |
| 2 | `backend/src/validators/job.validators.ts` | Add Zod schema + inferred type |
| 3 | `backend/src/workers/{name}.worker.ts` | Create worker file (processor + start function) |
| 4 | `backend/src/server.ts` | Import & start worker, add to shutdown cleanup |
| 5 | `backend/tests/unit/workers/{name}.worker.test.ts` | Create test file |
| 6 | `backend/src/config/dead-letter.ts` | No change needed — dead-letter routing is automatic via `createWorker` |

## Workflow

### Step 1: Design the Job

Gather these from the user before writing code:

| Parameter | Question | Example |
|---|---|---|
| **Job name** | `namespace:action` format | `ai:analyze-floorplan` |
| **Job data** | What fields does the job need? | `{ sessionId, roomId, assetId }` |
| **Concurrency** | How many parallel workers? | 2 (CPU-bound = 1, I/O-bound = 2-3) |
| **Timeout** | Max job execution time? | 60s |
| **Rate limiter** | External API rate limit? | `{ max: 5, duration: 60000 }` (optional) |
| **Socket.io events** | Does it emit progress/completion events? | `floorplan:analysis_complete` |

**Concurrency guidelines**:
- CPU-bound (Sharp, Puppeteer): 1
- I/O-bound with rate limits (external APIs): 1-2 with limiter
- I/O-bound without rate limits (DB, storage): 2-3
- Lightweight (email, notifications): 2-5

### Step 2: Add to queue.ts

See [queue-patterns.md](./queue-patterns.md) for the exact code patterns.

**2a. Add to `JobTypes` interface**:
```typescript
export interface JobTypes {
  // ... existing jobs
  'ai:analyze-floorplan': { sessionId: string; roomId: string; assetId: string };
}
```

**2b. Add to `WORKER_PROFILES`**:
```typescript
export const WORKER_PROFILES: Record<JobName, WorkerProfile> = {
  // ... existing profiles
  'ai:analyze-floorplan': {
    concurrency: 2,
    lockDuration: 90_000,       // 1.5x timeout
    timeoutMs: 60_000,          // 60s
    stalledInterval: 30_000,
    maxStalledCount: 1,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  },
};
```

**2c. Add lazy-initialized queue getter**:
```typescript
let _floorplanQueue: Queue<JobTypes['ai:analyze-floorplan']> | null = null;

export function getFloorplanQueue(): Queue<JobTypes['ai:analyze-floorplan']> {
  if (!_floorplanQueue) _floorplanQueue = createQueueWithProfile('ai:analyze-floorplan');
  return _floorplanQueue;
}
```

**2d. Add to `closeQueues()`**:
```typescript
const queues = [_imageQueue, _emailQueue, _docQueue, _renderQueue, _floorplanQueue].filter(Boolean);
```

### Step 3: Add Zod Schema to job.validators.ts

```typescript
export const aiAnalyzeFloorplanJobSchema = z.object({
  sessionId: z.string().uuid(),
  roomId: z.string().uuid(),
  assetId: z.string().uuid(),
});

export type AiAnalyzeFloorplanJobData = z.infer<typeof aiAnalyzeFloorplanJobSchema>;
```

**Naming convention**: `{camelCaseJobName}JobSchema` and `{PascalCaseJobName}JobData`

### Step 4: Create Worker File

Create `backend/src/workers/{name}.worker.ts` following the template in [worker-template.md](./worker-template.md).

**Every worker MUST have**:
1. Zod validation with `UnrecoverableError` on failure
2. Structured `Logger` (never `console.log`)
3. Socket.io event emission via `emitToSession()` (if applicable)
4. `withTimeout()` wrapper on external API calls
5. Error handling that distinguishes permanent vs retriable errors
6. A `start{Name}Worker()` export function

### Step 5: Wire in server.ts

**5a. Import the start function**:
```typescript
import { startFloorplanWorker } from './workers/floorplan.worker.js';
```

**5b. Add worker variable**:
```typescript
let floorplanWorker: ReturnType<typeof startFloorplanWorker> | null = null;
```

**5c. Add startup block** (follows the pattern of STEP 0.7-0.9):
```typescript
// ============================================
// STEP 0.10: Start Floorplan Worker (if Redis available)
// ============================================
try {
  const redisOk = await testRedisConnection();
  if (redisOk) {
    floorplanWorker = startFloorplanWorker();
    logger.info('Floorplan worker started');
  } else {
    logger.warn('Floorplan worker skipped — Redis not available');
  }
} catch { /* graceful degradation */ }
```

**5d. Add to shutdown cleanup**:
```typescript
const workers = [emailWorker, imageWorker, docWorker, renderWorker, floorplanWorker].filter(Boolean);
```

### Step 6: Create Test File

Create `backend/tests/unit/workers/{name}.worker.test.ts` following the template in [test-template.md](./test-template.md).

**Every test file MUST have**:
1. `vi.mock()` blocks for all dependencies (Logger, queue, env, db, socket-emitter)
2. `beforeEach` with `vi.clearAllMocks()` + `vi.resetModules()` + `vi.doMock()`
3. Extract the processor function from `createWorker` mock calls
4. Tests for: Zod validation failure, happy path, error handling

### Step 7: Verify

```bash
cd backend && npm run prep         # lint + build
cd backend && npm run test:unit    # all tests pass
```

### Step 8: Socket.io Events (if applicable)

If the job emits Socket.io events, coordinate with the `api-contract-specialist` agent or manually:

1. Add payload interface to `packages/shared-types/src/socket-events.ts`
2. Add to `ServerToClientEvents`
3. Re-export from `packages/shared-types/src/index.ts`
4. Rebuild: `pnpm --filter @renovation/shared-types build`
5. Add frontend handler (hooks)

## Key References

See companion files for detailed patterns:
- [queue-patterns.md](./queue-patterns.md) — JobTypes, WorkerProfile tuning, queue getters, closeQueues
- [worker-template.md](./worker-template.md) — Complete worker file template with all patterns
- [test-template.md](./test-template.md) — Complete test file template with vi.mock patterns
- [error-handling.md](./error-handling.md) — UnrecoverableError vs Error, permanent error detection, retry strategies
