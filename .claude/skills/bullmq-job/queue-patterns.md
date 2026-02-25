# Queue Configuration Patterns

Exact patterns for adding a new job type to `backend/src/config/queue.ts`.

## JobTypes Interface

All job types are declared in a single discriminated interface:

```typescript
export interface JobTypes {
  'image:optimize': { assetId: string; sessionId: string; width?: number; quality?: number };
  'ai:process-message': { sessionId: string; content: string; userId?: string };
  'doc:generate-plan': { sessionId: string; roomId: string; format: 'pdf' | 'html' };
  'email:send-notification': { to: string; subject: string; template: string; data: Record<string, unknown> };
  'render:generate': { sessionId: string; roomId: string; prompt: string; assetId: string };
  // Add new jobs here
}
```

**Naming convention**: `namespace:action` — `image:optimize`, `doc:generate-plan`, `render:generate`

**Field conventions**:
- Always include `sessionId: string` if the job relates to a user session (needed for Socket.io room targeting)
- Use `string` for UUIDs (Zod validates format at runtime)
- Use specific string unions for closed sets (e.g., `format: 'pdf' | 'html'`)

## WorkerProfile

Every job type has a `WorkerProfile` that controls operational behavior:

```typescript
export interface WorkerProfile {
  concurrency: number;          // Max parallel jobs
  lockDuration: number;         // ms — BullMQ lock, MUST exceed max job time
  timeoutMs: number;            // ms — app-level timeout (used with withTimeout())
  stalledInterval: number;      // ms — how often BullMQ checks for stalled jobs
  maxStalledCount: number;      // recoveries before moving to failed
  limiter?: { max: number; duration: number };  // BullMQ rate limiter
  defaultJobOptions: {
    attempts: number;
    backoff: { type: 'exponential'; delay: number };
    removeOnComplete: number;   // Keep last N completed jobs
    removeOnFail: number;       // Keep last N failed jobs
  };
}
```

### Profile Tuning Guide

| Job Type | Concurrency | Timeout | Lock Duration | Stalled Interval | Rate Limiter |
|---|---|---|---|---|---|
| CPU-bound (Sharp, Puppeteer) | 1 | 30-120s | 1.5x timeout | timeout/2 | No |
| I/O-bound external API | 1-2 | 45-90s | 1.5x timeout | timeout/2 | Yes (API limits) |
| I/O-bound DB/storage | 2-3 | 30-60s | 1.5x timeout | 30s | No |
| Lightweight (email, push) | 2-5 | 15-30s | 2x timeout | 30s | Maybe |
| AI model calls (Gemini) | 1-3 | 45-60s | 1.5x timeout | 30s | Optional |

**Rules**:
- `lockDuration` MUST be > `timeoutMs` (otherwise BullMQ thinks the job stalled before it times out)
- `stalledInterval` should be ~`timeoutMs / 2` — frequent enough to detect stalls, not so frequent it hammers Redis
- `maxStalledCount`: 1 for idempotent jobs, 2 for flaky external APIs
- `attempts`: 3 is standard; use 1 for truly non-retriable operations

### Existing Profiles (for reference)

| Job | Concurrency | Timeout | Lock | Stalled | Rate Limit |
|---|---|---|---|---|---|
| `image:optimize` | 2 | 30s | 60s | 30s | None |
| `email:send-notification` | 2 | 15s | 30s | 30s | 10/sec |
| `doc:generate-plan` | 1 | 120s | 180s | 60s | None |
| `render:generate` | 1 | 90s | 120s | 45s | 5/min |
| `ai:process-message` | 3 | 45s | 60s | 30s | None |

## Queue Getter Pattern

Every job type has a lazy-initialized queue singleton:

```typescript
let _myQueue: Queue<JobTypes['my:job']> | null = null;

export function getMyQueue(): Queue<JobTypes['my:job']> {
  if (!_myQueue) _myQueue = createQueueWithProfile('my:job');
  return _myQueue;
}
```

**Naming**: `get{PascalCaseName}Queue()` — e.g., `getImageQueue()`, `getDocQueue()`, `getRenderQueue()`

**Usage by producers** (services, controllers):
```typescript
import { getMyQueue } from '../config/queue.js';

const queue = getMyQueue();
await queue.add('my:job', { sessionId, roomId }, {
  // Optional per-job overrides (usually not needed — defaults from profile)
  priority: 1,  // Lower = higher priority
});
```

## closeQueues() Update

The `closeQueues()` function must include the new queue variable:

```typescript
export async function closeQueues(): Promise<void> {
  const { closeDLQ } = await import('./dead-letter.js');
  const queues = [_imageQueue, _emailQueue, _docQueue, _renderQueue, _myQueue].filter(Boolean);
  await Promise.allSettled(queues.map(q => q!.close()));
  await closeDLQ();
  logger.info('All queues closed');
}
```

## Dead Letter Queue

Dead letter routing is automatic — `createWorker()` already registers an `on('failed')` handler that calls `moveToDeadLetter()` when a job exhausts its retry attempts. No changes to `dead-letter.ts` are needed for new job types.

The dead letter queue stores:
```typescript
{
  originalJobId: string;
  sourceQueue: string;     // e.g., 'my:job'
  reason: string;          // Error message
  data: unknown;           // Original job data
  attemptsMade: number;
  failedAt: string;        // ISO timestamp
}
```

## withTimeout() Utility

For jobs that call external APIs, wrap the call in `withTimeout()`:

```typescript
import { withTimeout, WORKER_PROFILES } from '../config/queue.js';

const profile = WORKER_PROFILES['my:job'];
const result = await withTimeout(
  externalApi.call(params),
  profile.timeoutMs,
  `my:job job ${job.id}`,
);
```

This produces a descriptive error: `Job timeout after 60000ms: my:job job abc-123`
