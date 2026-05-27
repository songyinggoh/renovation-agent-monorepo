# Error Handling Patterns

How workers distinguish between permanent and retriable errors, and when to use each pattern.

## Error Classification

BullMQ retries failed jobs according to `WORKER_PROFILES[jobName].defaultJobOptions.attempts` and `backoff`. The key decision in every worker is: **should this error trigger a retry, or is it permanent?**

| Error Type | Throw | Retried? | Example |
|---|---|---|---|
| **Permanent** (data/config) | `throw new UnrecoverableError(msg)` | No — moves to failed immediately | Invalid UUID, missing DB record, bad API key |
| **Retriable** (transient) | `throw new Error(msg)` | Yes — up to `attempts` with backoff | Network timeout, rate limit, temporary API error |
| **Graceful skip** | `return` (no throw) | No — completes successfully | Feature disabled, infrastructure not configured |

## Pattern 1: Zod Validation (ALWAYS FIRST)

Every worker starts with Zod validation. Invalid job data is **always permanent** — retrying won't fix it.

```typescript
const parsed = myJobSchema.safeParse(job.data);
if (!parsed.success) {
  throw new UnrecoverableError(
    `Invalid job data: ${parsed.error.issues.map(i => i.message).join(', ')}`
  );
}
```

**Why UnrecoverableError**: The job was enqueued with bad data. Retrying the same data will fail the same way. Moving it to failed/DLQ lets operators investigate.

## Pattern 2: Feature Guard (Graceful Skip)

When optional infrastructure isn't configured, skip the job without error.

```typescript
if (!isStorageEnabled() || !supabaseAdmin) {
  logger.warn('Worker skipped — storage not configured', undefined, { assetId });
  return;  // Completes the job successfully
}
```

**Why return (not throw)**: The job isn't broken — the environment just doesn't support it. Completing it prevents pointless retries and DLQ noise.

**Used by**: `image.worker.ts` (Supabase storage), `email.worker.ts` (Resend API)

## Pattern 3: Missing DB Record (Permanent)

If a job references a record that doesn't exist, it's permanent — retrying won't create the record.

```typescript
const [asset] = await db.select().from(roomAssets).where(eq(roomAssets.id, assetId));
if (!asset) {
  throw new UnrecoverableError(`Asset ${assetId} not found — may have been deleted`);
}
```

**Used by**: `image.worker.ts` (asset lookup), `render.worker.ts` (room lookup)

## Pattern 4: Permanent Error Code Detection

For external APIs that return structured error codes, maintain a set of known permanent codes.

Based on `email.worker.ts`:

```typescript
const PERMANENT_ERROR_CODES = new Set([
  'invalid_from_address',
  'invalid_to_address',
  'validation_error',
  'missing_required_field',
  'invalid_parameter',
]);

function isPermanentError(errorMessage: string): boolean {
  const lowerMsg = errorMessage.toLowerCase();

  // Check exact code match
  if (PERMANENT_ERROR_CODES.has(lowerMsg)) return true;

  // Check pattern match
  if (lowerMsg.includes('invalid') && lowerMsg.includes('email')) return true;
  if (lowerMsg.includes('validation')) return true;
  if (lowerMsg.includes('missing required')) return true;

  return false;
}
```

**Usage in the worker**:

```typescript
try {
  const { data: result, error } = await externalApi.call(params);

  if (error) {
    const errorMsg = error.message || 'Unknown API error';

    if (isPermanentError(errorMsg)) {
      throw new UnrecoverableError(`Permanent error: ${errorMsg}`);
    }

    // Retriable — network, rate limit, temporary
    throw new Error(`API error: ${errorMsg}`);
  }

  // Success path...
} catch (err) {
  // Re-throw UnrecoverableError as-is
  if (err instanceof UnrecoverableError) throw err;

  // Wrap other errors for BullMQ retry
  const error = err as Error;
  throw new Error(`Operation failed: ${error.message}`);
}
```

**Key**: The outer catch re-throws `UnrecoverableError` unchanged. Only "unknown" errors get wrapped as retriable `Error`.

## Pattern 5: Last-Attempt Failure Handling

For workers that emit Socket.io events, only send the failure event on the **final** retry attempt. This prevents spamming the user with failure notifications during intermediate retries.

Based on `render.worker.ts`:

```typescript
catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  logger.error('Job failed', error as Error, {
    jobId: job.id,
    sessionId,
    attempt: job.attemptsMade + 1,
  });

  // Only emit failure event on final attempt
  const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 3);
  if (isLastAttempt) {
    // Persist failure state in DB
    await myService.markFailed(recordId, errorMessage);

    // Notify the user
    emitToSession(sessionId, 'namespace:failed', {
      sessionId,
      roomId,
      error: 'Operation failed after multiple attempts. Please try again.',
    });
  }

  // Re-throw for BullMQ retry (or final move to failed)
  throw error;
}
```

**Why check `isLastAttempt`**: BullMQ will retry the job `attempts - 1` more times. On intermediate failures, just log and re-throw. On the final failure, also update DB state and notify the user.

**User-facing error message**: Always use a generic message in Socket.io events — never expose internal error details to the client.

## Pattern 6: Combined Error Flow

The complete error handling flow for a worker with external API + Socket.io + DB:

```
Job received
  │
  ├─ Zod validation fails → UnrecoverableError (no retry)
  │
  ├─ Feature guard fails → return (complete as no-op)
  │
  ├─ DB lookup fails (missing record) → UnrecoverableError (no retry)
  │
  ├─ External API call
  │   ├─ Permanent API error → UnrecoverableError (no retry)
  │   ├─ Retriable API error → Error (BullMQ retries)
  │   └─ Network/timeout error → Error (BullMQ retries)
  │
  └─ On final failed attempt:
      ├─ Update DB status to 'failed'
      ├─ Emit Socket.io failure event
      └─ Move to DLQ (automatic via createWorker handler)
```

## Dead Letter Queue (Automatic)

When a job exhausts all retry attempts, `createWorker()` automatically calls `moveToDeadLetter()`. No per-worker DLQ code is needed.

The DLQ stores:
```typescript
{
  originalJobId: string;
  sourceQueue: string;     // e.g., 'render:generate'
  reason: string;          // Error message from final attempt
  data: unknown;           // Original job data
  attemptsMade: number;
  failedAt: string;        // ISO timestamp
}
```

## Common Permanent Error Patterns by Domain

| Domain | Permanent Errors | Retriable Errors |
|---|---|---|
| **Email (Resend)** | Invalid address, validation error, missing field | Rate limit, temporary API down |
| **AI (Gemini)** | Invalid prompt, content policy violation | Rate limit, 503, timeout |
| **Storage (Supabase)** | Bucket not found, invalid path, auth error | Network timeout, 503 |
| **Image (Sharp)** | Unsupported format, corrupt file | Out of memory (maybe) |
| **Render (AI)** | Invalid room config, missing data | API timeout, rate limit |

## Anti-Patterns

### DON'T: Catch and swallow errors

```typescript
// ❌ BAD — job completes "successfully" but nothing happened
try {
  await externalApi.call(params);
} catch (err) {
  logger.error('Failed', err as Error);
  // Missing: throw! Job will be marked complete
}
```

### DON'T: Retry permanent errors

```typescript
// ❌ BAD — will retry 3 times with the same invalid data
if (!result) {
  throw new Error('Record not found');  // Should be UnrecoverableError
}
```

### DON'T: Use UnrecoverableError for transient failures

```typescript
// ❌ BAD — network blips should be retried
try {
  await fetch(url);
} catch (err) {
  throw new UnrecoverableError('Network error');  // Should be plain Error
}
```

### DON'T: Expose internal errors to users

```typescript
// ❌ BAD — leaks internal details
emitToSession(sessionId, 'render:failed', {
  error: `PostgreSQL error: duplicate key value violates unique constraint "renders_pkey"`,
});

// ✅ GOOD — generic user-facing message
emitToSession(sessionId, 'render:failed', {
  error: 'Render generation failed. Please try again.',
});
```
