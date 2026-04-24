# Worker File Template

Complete template for `backend/src/workers/{name}.worker.ts`. Replace `{Name}`, `{name}`, `{job-name}`, and data fields.

## Minimal Worker (no external API, no Socket.io)

Based on `doc.worker.ts` — the simplest pattern:

```typescript
import { type Job, UnrecoverableError } from 'bullmq';
import { createWorker, type JobTypes } from '../config/queue.js';
import { Logger } from '../utils/logger.js';
import { {name}JobSchema } from '../validators/job.validators.js';

const logger = new Logger({ serviceName: '{Name}Worker' });

type {Name}JobData = JobTypes['{job-name}'];

async function process{Name}Job(job: Job<{Name}JobData>): Promise<void> {
  // Step 1: Validate job data with Zod
  const parsed = {name}JobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError(
      `Invalid job data: ${parsed.error.issues.map(i => i.message).join(', ')}`
    );
  }
  const { sessionId, /* other fields */ } = parsed.data;

  logger.info('Processing {name} job', { jobId: job.id, sessionId });

  // Step 2: Business logic here
  // ...

  logger.info('{Name} job completed', { jobId: job.id, sessionId });
}

/**
 * Start the {name} worker.
 * Concurrency and timeouts derived from WORKER_PROFILES.
 */
export function start{Name}Worker() {
  const worker = createWorker('{job-name}', process{Name}Job);
  logger.info('{Name} worker started');
  return worker;
}
```

## Full Worker (external API + Socket.io events + error branching)

Based on `render.worker.ts` — the complete pattern:

```typescript
import { type Job, UnrecoverableError } from 'bullmq';
import { createWorker, WORKER_PROFILES, withTimeout, type JobTypes } from '../config/queue.js';
import { emitToSession } from '../utils/socket-emitter.js';
import { Logger } from '../utils/logger.js';
import { {name}JobSchema } from '../validators/job.validators.js';
// Import your service/adapter
import { MyService } from '../services/my.service.js';

const logger = new Logger({ serviceName: '{Name}Worker' });

type {Name}JobData = JobTypes['{job-name}'];

const myService = new MyService();

async function process{Name}Job(job: Job<{Name}JobData>): Promise<void> {
  // Step 1: Validate job data with Zod
  const parsed = {name}JobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError(
      `Invalid job data: ${parsed.error.issues.map(i => i.message).join(', ')}`
    );
  }
  const { sessionId, roomId, /* other fields */ } = parsed.data;

  logger.info('Processing {name} job', {
    jobId: job.id,
    sessionId,
    roomId,
  });

  // Step 2: Emit "started" event
  emitToSession(sessionId, '{namespace}:started', { sessionId, roomId });

  try {
    // Step 3: Call external API with timeout
    const profile = WORKER_PROFILES['{job-name}'];
    const result = await withTimeout(
      myService.doWork(/* params */),
      profile.timeoutMs,
      `{job-name} job ${job.id}`,
    );

    // Step 4: Persist result
    await myService.saveResult(result);

    // Step 5: Emit "complete" event
    emitToSession(sessionId, '{namespace}:complete', {
      sessionId,
      roomId,
      // result fields...
    });

    logger.info('{Name} job completed', { jobId: job.id, sessionId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('{Name} job failed', error as Error, {
      jobId: job.id,
      sessionId,
      attempt: job.attemptsMade + 1,
    });

    // On final attempt, emit failure event
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
    if (isLastAttempt) {
      await myService.markFailed(/* id */, errorMessage);
      emitToSession(sessionId, '{namespace}:failed', {
        sessionId,
        roomId,
        error: 'Operation failed after multiple attempts. Please try again.',
      });
    }

    // Re-throw for BullMQ retry
    throw error;
  }
}

export function start{Name}Worker() {
  const worker = createWorker('{job-name}', process{Name}Job);
  logger.info('{Name} worker started');
  return worker;
}
```

## Worker with Feature Guard

Based on `image.worker.ts` — skip when infrastructure not available:

```typescript
async function process{Name}Job(job: Job<{Name}JobData>): Promise<void> {
  const parsed = {name}JobSchema.safeParse(job.data);
  if (!parsed.success) {
    throw new UnrecoverableError(`Invalid job data: ${parsed.error.issues.map(i => i.message).join(', ')}`);
  }
  const { assetId, sessionId } = parsed.data;

  // Guard: skip if required infrastructure not configured
  if (!isStorageEnabled() || !supabaseAdmin) {
    logger.warn('{Name} skipped — storage not configured', undefined, { assetId });
    return;  // Completes the job successfully (no retry)
  }

  // Continue with processing...
}
```

## Worker with Per-Item Error Isolation

Based on `image.worker.ts` variant loop — process multiple items, isolate per-item failures:

```typescript
for (const item of items) {
  try {
    await processItem(item);
    logger.info('Item processed', { itemId: item.id });
  } catch (itemError) {
    // Log but continue with other items
    logger.error('Item failed', itemError as Error, { itemId: item.id });
    // Emit per-item failure event
    emitToSession(sessionId, '{namespace}:item_failed', {
      itemId: item.id,
      error: (itemError as Error).message,
    });
  }
}
```

## Key Patterns Summary

| Pattern | When to Use | Example Worker |
|---|---|---|
| Zod validation + `UnrecoverableError` | **Always** — first thing in every worker | All workers |
| `withTimeout()` wrapper | External API calls | `render.worker.ts` |
| `emitToSession()` events | User-facing progress/completion | `image.worker.ts`, `render.worker.ts` |
| Feature guard (`isStorageEnabled`) | Optional infrastructure | `image.worker.ts` |
| Per-item error isolation | Processing multiple items in one job | `image.worker.ts` (variant loop) |
| Permanent vs retriable errors | External APIs with known error codes | `email.worker.ts` |
| Last-attempt failure handling | Emit failure event only on final retry | `render.worker.ts` |

## Import Checklist

Every worker needs some subset of:

```typescript
// Always required
import { type Job, UnrecoverableError } from 'bullmq';
import { createWorker, type JobTypes } from '../config/queue.js';
import { Logger } from '../utils/logger.js';
import { myJobSchema } from '../validators/job.validators.js';

// If using timeout
import { WORKER_PROFILES, withTimeout } from '../config/queue.js';

// If emitting Socket.io events
import { emitToSession } from '../utils/socket-emitter.js';

// If using DB
import { db } from '../db/index.js';
import { eq } from 'drizzle-orm';

// If using Supabase Storage
import { isStorageEnabled, env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
```
