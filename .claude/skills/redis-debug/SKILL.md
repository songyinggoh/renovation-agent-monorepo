---
name: redis-debug
description: >
  Live BullMQ queue inspection during development — list failed/waiting/active/delayed jobs,
  inspect job data and stacktraces, drain or retry failed jobs, check dead-letter queue contents,
  view worker health, and diagnose stalled jobs. Uses redis-cli and BullMQ Queue API commands
  against the local Redis instance. Use when jobs aren't processing, workers appear stuck,
  the DLQ is growing, or you need to understand what's queued.
user-invocable: true
---

# /redis-debug

Live BullMQ queue inspection and debugging for the renovation agent monorepo. Provides ready-to-run commands for diagnosing job processing issues during development without needing Bull Board or a separate UI.

## When to Use

- Jobs aren't being processed (workers appear stuck)
- Need to inspect failed job data and error stacktraces
- Dead-letter queue is growing and you want to see why
- Checking if a specific job was enqueued after an API call
- Workers are stalled or not picking up work
- Need to drain/retry/remove jobs during development
- Verifying Redis connectivity and queue health

## Invocation

```
/redis-debug [command]
```

**command** is optional. Can be:
- Omitted: run full health check across all queues
- A queue name: `image:optimize` — inspect that specific queue
- A command: `failed`, `dlq`, `stalled`, `flush` — run that diagnostic
- A job ID: `inspect <queue> <jobId>` — get full job details

**Examples**:
```
/redis-debug                              # Full health check
/redis-debug image:optimize               # Inspect image queue
/redis-debug failed                       # List all failed jobs across queues
/redis-debug dlq                          # Inspect dead-letter queue
/redis-debug stalled                      # Find stalled jobs
/redis-debug retry image:optimize         # Retry all failed image jobs
/redis-debug drain email:send-notification # Remove all jobs from email queue
```

## Queue Architecture

### Active Queues (5 + DLQ)

| Queue Name | Worker File | Concurrency | Timeout | Rate Limit |
|---|---|---|---|---|
| `image:optimize` | `image.worker.ts` | 2 | 30s | none |
| `email:send-notification` | `email.worker.ts` | 2 | 15s | 10/sec |
| `doc:generate-plan` | `doc.worker.ts` | 1 | 120s | none |
| `render:generate` | `render.worker.ts` | 1 | 90s | 5/min |
| `ai:process-message` | — (future) | 3 | 45s | none |
| `dead-letter` | — (sink) | — | — | — |

### Redis Key Structure

BullMQ stores queue data under these Redis key prefixes:

```
bull:<queue-name>:id          # Auto-incrementing job ID counter
bull:<queue-name>:wait        # List of waiting job IDs
bull:<queue-name>:active      # List of active job IDs
bull:<queue-name>:delayed     # Sorted set of delayed job IDs
bull:<queue-name>:completed   # Set of completed job IDs
bull:<queue-name>:failed      # Set of failed job IDs
bull:<queue-name>:stalled     # Set of stalled job IDs
bull:<queue-name>:<jobId>     # Hash with job data, opts, timestamps
```

### Connection Config

```
REDIS_URL=redis://localhost:6379    # default from env.ts
maxRetriesPerRequest: null          # BullMQ requirement (queue.ts)
maxRetriesPerRequest: 3             # ioredis client (redis.ts)
lazyConnect: true                   # ioredis client
```

## Diagnostic Commands

### 1. Full Health Check (default)

Run when invoked without arguments. Checks all queues and reports counts.

```bash
# Check Redis connectivity
redis-cli -u redis://localhost:6379 PING

# Count jobs in each state for all queues
for q in "image:optimize" "email:send-notification" "doc:generate-plan" "render:generate" "ai:process-message" "dead-letter"; do
  echo "=== $q ==="
  echo -n "  waiting:   "; redis-cli -u redis://localhost:6379 LLEN "bull:${q}:wait" 2>/dev/null || echo "0"
  echo -n "  active:    "; redis-cli -u redis://localhost:6379 LLEN "bull:${q}:active" 2>/dev/null || echo "0"
  echo -n "  delayed:   "; redis-cli -u redis://localhost:6379 ZCARD "bull:${q}:delayed" 2>/dev/null || echo "0"
  echo -n "  completed: "; redis-cli -u redis://localhost:6379 ZCARD "bull:${q}:completed" 2>/dev/null || echo "0"
  echo -n "  failed:    "; redis-cli -u redis://localhost:6379 ZCARD "bull:${q}:failed" 2>/dev/null || echo "0"
  echo ""
done
```

### 2. Inspect Failed Jobs

```bash
# List failed job IDs for a specific queue
redis-cli -u redis://localhost:6379 ZRANGE "bull:<queue>:failed" 0 -1

# Get full job data (replace <jobId>)
redis-cli -u redis://localhost:6379 HGETALL "bull:<queue>:<jobId>"

# Get just the error stacktrace
redis-cli -u redis://localhost:6379 HGET "bull:<queue>:<jobId>" "failedReason"
redis-cli -u redis://localhost:6379 HGET "bull:<queue>:<jobId>" "stacktrace"
```

### 3. Inspect Dead-Letter Queue

```bash
# Count DLQ entries
redis-cli -u redis://localhost:6379 ZCARD "bull:dead-letter:completed"
redis-cli -u redis://localhost:6379 LLEN "bull:dead-letter:wait"

# List recent DLQ job IDs
redis-cli -u redis://localhost:6379 ZRANGE "bull:dead-letter:completed" 0 9

# Get DLQ job data (includes originalJobId, sourceQueue, reason, failedAt)
redis-cli -u redis://localhost:6379 HGET "bull:dead-letter:<jobId>" "data"
```

### 4. Inspect Job Data

```bash
# Get full job hash (data, opts, timestamps, attempts, etc.)
redis-cli -u redis://localhost:6379 HGETALL "bull:<queue>:<jobId>"

# Get just the job data payload
redis-cli -u redis://localhost:6379 HGET "bull:<queue>:<jobId>" "data"

# Get job options (attempts, backoff, etc.)
redis-cli -u redis://localhost:6379 HGET "bull:<queue>:<jobId>" "opts"

# Get attempts made
redis-cli -u redis://localhost:6379 HGET "bull:<queue>:<jobId>" "attemptsMade"
```

### 5. Find Stalled Jobs

```bash
# Check stalled set for each queue
for q in "image:optimize" "email:send-notification" "doc:generate-plan" "render:generate" "ai:process-message"; do
  count=$(redis-cli -u redis://localhost:6379 SCARD "bull:${q}:stalled-check" 2>/dev/null)
  if [ "$count" != "0" ] && [ "$count" != "" ]; then
    echo "STALLED in $q: $count jobs"
    redis-cli -u redis://localhost:6379 SMEMBERS "bull:${q}:stalled-check"
  fi
done
```

### 6. Check Worker Locks

```bash
# BullMQ workers hold locks as Redis keys
redis-cli -u redis://localhost:6379 KEYS "bull:*:lock:*"

# Check specific worker lock TTL
redis-cli -u redis://localhost:6379 TTL "bull:<queue>:<jobId>:lock"
```

### 7. Redis Memory & Key Count

```bash
# Overall Redis memory usage
redis-cli -u redis://localhost:6379 INFO memory | grep used_memory_human

# Count all BullMQ keys
redis-cli -u redis://localhost:6379 KEYS "bull:*" | wc -l

# Keys per queue
for q in "image:optimize" "email:send-notification" "doc:generate-plan" "render:generate" "ai:process-message" "dead-letter"; do
  count=$(redis-cli -u redis://localhost:6379 KEYS "bull:${q}:*" | wc -l)
  echo "$q: $count keys"
done
```

## Mutation Commands (Development Only)

These commands modify queue state. Only use in development.

### Retry Failed Jobs

```bash
# Retry all failed jobs in a queue (moves from failed back to wait)
# Use Node.js one-liner since redis-cli can't call BullMQ retry API
node -e "
const { Queue } = require('bullmq');
const q = new Queue('<queue>', { connection: { host: 'localhost', port: 6379 } });
q.getJobs(['failed']).then(async jobs => {
  for (const job of jobs) { await job.retry(); console.log('Retried:', job.id); }
  await q.close();
});
"
```

### Drain a Queue

```bash
# Remove all jobs from a queue (waiting + delayed)
node -e "
const { Queue } = require('bullmq');
const q = new Queue('<queue>', { connection: { host: 'localhost', port: 6379 } });
q.drain().then(() => { console.log('Drained'); return q.close(); });
"
```

### Obliterate a Queue

```bash
# Nuclear option: remove ALL data for a queue (all states + metadata)
node -e "
const { Queue } = require('bullmq');
const q = new Queue('<queue>', { connection: { host: 'localhost', port: 6379 } });
q.obliterate({ force: true }).then(() => { console.log('Obliterated'); return q.close(); });
"
```

### Remove a Specific Job

```bash
redis-cli -u redis://localhost:6379 DEL "bull:<queue>:<jobId>"
# Also clean from the state set
redis-cli -u redis://localhost:6379 ZREM "bull:<queue>:failed" "<jobId>"
```

### Flush Dead-Letter Queue

```bash
node -e "
const { Queue } = require('bullmq');
const q = new Queue('dead-letter', { connection: { host: 'localhost', port: 6379 } });
q.obliterate({ force: true }).then(() => { console.log('DLQ flushed'); return q.close(); });
"
```

## Common Debugging Scenarios

### Scenario: "Jobs are enqueued but not processing"

1. Check Redis connectivity: `redis-cli PING`
2. Check waiting count: are jobs in the `wait` list?
3. Check if workers are running: look for `Worker "<queue>" started` in backend logs
4. Check for stalled jobs: workers may have crashed mid-job
5. Check worker locks: if locks exist but are expired, workers died without cleanup

### Scenario: "Failed jobs keep retrying forever"

1. Inspect the failed job: `HGETALL bull:<queue>:<jobId>`
2. Check `attemptsMade` vs `opts.attempts` (default 3)
3. If `attemptsMade >= opts.attempts`, the job should be in DLQ
4. Check if `UnrecoverableError` is being thrown for permanent failures (skips retry)
5. Look for missing Zod validation — bad data should fail immediately, not retry

### Scenario: "DLQ is growing"

1. List DLQ jobs: check `sourceQueue` and `reason` fields
2. Group by `sourceQueue` to find the problematic worker
3. Check the `reason` — common causes:
   - Zod validation failure (bad job data from enqueuer)
   - External API down (should be retriable, not DLQ)
   - Missing env config (storage/email not enabled)

### Scenario: "Worker is stuck on one job"

1. Find active jobs: `LRANGE bull:<queue>:active 0 -1`
2. Check the job's lock TTL: `TTL bull:<queue>:<jobId>:lock`
3. If lock is expired → worker crashed, job will be marked stalled
4. Check `lockDuration` in WORKER_PROFILES — may need to increase for slow operations
5. Check `stalledInterval` — how often BullMQ checks for stalled jobs

## Job Data Schemas (Zod)

Quick reference for valid job data shapes (from `job.validators.ts`):

```typescript
// image:optimize
{ assetId: uuid, sessionId: uuid, width?: int, quality?: 1-100 }

// email:send-notification
{ to: email, subject: string(1-500), template: string(1-100), data: { html: string } }

// doc:generate-plan
{ sessionId: uuid, roomId: uuid, format: 'pdf' | 'html' }

// render:generate
{ sessionId: uuid, roomId: uuid, prompt: string(1-5000), assetId: uuid }

// ai:process-message
{ sessionId: uuid, content: string(1-10000), userId?: uuid }
```

## Worker Profiles Quick Reference

From `WORKER_PROFILES` in `queue.ts`:

| Queue | Concurrency | Lock | Timeout | Stalled Interval | Max Stalled | Rate Limit |
|---|---|---|---|---|---|---|
| `image:optimize` | 2 | 60s | 30s | 30s | 1 | — |
| `email:send-notification` | 2 | 30s | 15s | 30s | 1 | 10/sec |
| `doc:generate-plan` | 1 | 180s | 120s | 60s | 1 | — |
| `render:generate` | 1 | 120s | 90s | 45s | 2 | 5/min |
| `ai:process-message` | 3 | 60s | 45s | 30s | 1 | — |

## Key Files

| File | Purpose |
|---|---|
| `backend/src/config/queue.ts` | Queue creation, `createWorker`, `WORKER_PROFILES`, `JobTypes` |
| `backend/src/config/redis.ts` | ioredis client singleton, `connectRedis`, `testRedisConnection` |
| `backend/src/config/dead-letter.ts` | DLQ queue, `moveToDeadLetter` |
| `backend/src/config/env.ts` | `REDIS_URL` (default `redis://localhost:6379`) |
| `backend/src/validators/job.validators.ts` | Zod schemas for all job data types |
| `backend/src/workers/*.worker.ts` | Worker implementations (4 files) |
