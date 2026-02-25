# Queue Operations Infrastructure — Missing Pieces Design

**Date**: 2026-02-20
**Status**: Approved

## Problem Statement

The queue-operations-specialist agent document describes 4 capabilities that exist in prose but not in code:

1. **OTel job spans** — no worker creates OpenTelemetry spans
2. **Sentry DLQ alerting** — `dead-letter.ts` logs but never alerts
3. **Per-worker shutdown timeouts** — all 4 workers share one 5s resource (doc worker needs 120s+)
4. **Zod validation** — workers use manual `if (!field)` checks instead of Zod schemas

## Design

### 1. OTel Job Tracing (auto in `createWorker`)

**File**: Modify `backend/src/config/queue.ts`

The `createWorker` function wraps the user-supplied processor in a tracing wrapper automatically. No opt-in needed. Follows the `ai-tracing.ts` pattern with a `renovation-agent-jobs` tracer.

```typescript
const tracer = trace.getTracer('renovation-agent-jobs', '1.0.0');

// Inside createWorker, wrap the processor:
const tracedProcessor: Processor<JobTypes[T]> = async (job, token) => {
  return tracer.startActiveSpan(`job:${name}`, async (span) => {
    span.setAttributes({
      'job.id': job.id ?? 'unknown',
      'job.name': job.name,
      'job.queue': name,
      'job.attempt': job.attemptsMade + 1,
    });
    try {
      const result = await processor(job, token);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
};
```

Attributes match the agent doc spec (section 8). Duration is automatic via span timing.

### 2. Sentry DLQ Alerting

**File**: Modify `backend/src/config/dead-letter.ts`

Add `Sentry.captureMessage` with `warning` level inside `moveToDeadLetter`, guarded by `isSentryEnabled()`. Includes job metadata as Sentry extra context.

```typescript
import { Sentry, isSentryEnabled } from './sentry.js';

// Inside moveToDeadLetter, after the DLQ add succeeds:
if (isSentryEnabled()) {
  Sentry.captureMessage(`Job moved to dead letter queue: ${sourceQueue}`, {
    level: 'warning',
    extra: {
      originalJobId: job.id,
      sourceQueue,
      reason,
      attemptsMade: job.attemptsMade,
    },
    tags: {
      queue: sourceQueue,
      component: 'dead-letter-queue',
    },
  });
}
```

### 3. Per-Worker Shutdown Registration

**File**: Modify `backend/src/server.ts` — `setupGracefulShutdown()`

Replace the single "Workers & Queues" resource with individual per-worker registrations. Timeout derived from `WORKER_PROFILES[name].lockDuration + 2000`.

```
| Worker | lockDuration | Shutdown Timeout |
|--------|-------------|-----------------|
| email  | 30s         | 32s             |
| image  | 60s         | 62s             |
| doc    | 180s        | 182s            |
| render | 120s        | 122s            |
```

Queue closing remains a separate resource (3s timeout) registered after all workers.

### 4. Zod Job Validators

**File**: New `backend/src/validators/job.validators.ts`

One Zod schema per `JobTypes` entry, matching the existing validator pattern. Workers import and `safeParse` at entry, throwing `UnrecoverableError` on failure.

```typescript
export const imageOptimizeJobSchema = z.object({
  assetId: z.string().uuid(),
  sessionId: z.string().uuid(),
  width: z.number().int().positive().optional(),
  quality: z.number().int().min(1).max(100).optional(),
});

export const renderGenerateJobSchema = z.object({
  sessionId: z.string().uuid(),
  roomId: z.string().uuid(),
  prompt: z.string().min(1).max(5000),
  assetId: z.string().uuid(),
});

// ... etc for each job type
```

Workers replace manual checks with:
```typescript
const parsed = imageOptimizeJobSchema.safeParse(job.data);
if (!parsed.success) {
  throw new UnrecoverableError(`Invalid job data: ${parsed.error.message}`);
}
```

## Files Changed

| File | Action |
|------|--------|
| `backend/src/config/queue.ts` | Add OTel tracing wrapper in `createWorker` |
| `backend/src/config/dead-letter.ts` | Add Sentry alerting in `moveToDeadLetter` |
| `backend/src/server.ts` | Split per-worker shutdown registration |
| `backend/src/validators/job.validators.ts` | **New** — Zod schemas for all job types |
| `backend/src/workers/email.worker.ts` | Replace manual checks with Zod |
| `backend/src/workers/image.worker.ts` | Replace manual checks with Zod |
| `backend/src/workers/doc.worker.ts` | Replace manual checks with Zod |
| `backend/src/workers/render.worker.ts` | Replace manual checks with Zod |
| `backend/tests/unit/config/queue.test.ts` | Add OTel span tests |
| `backend/tests/unit/config/dead-letter.test.ts` | Add Sentry alert tests |
| `backend/tests/unit/validators/job.validators.test.ts` | **New** — Zod schema tests |

## Non-Goals

- No new workers (Phase 3 Puppeteer implementation is separate)
- No DLQ depth monitoring/cron (can add later)
- No changes to job priority or scheduling
- No changes to `WorkerProfile` values
