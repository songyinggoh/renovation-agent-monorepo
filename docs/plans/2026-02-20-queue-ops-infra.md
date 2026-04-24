# Queue Operations Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the 4 infrastructure gaps between what the queue-operations-specialist agent describes and what the codebase actually implements: OTel job tracing, Sentry DLQ alerting, per-worker shutdown timeouts, and Zod job validation.

**Architecture:** Each gap is a self-contained task with its own test file. OTel tracing is wired into `createWorker` automatically. Sentry alerting is added to `moveToDeadLetter`. Shutdown registration is split per-worker in `server.ts`. Zod schemas are centralized in `job.validators.ts` and consumed by all 4 workers.

**Tech Stack:** Vitest, BullMQ, OpenTelemetry API (`@opentelemetry/api`), Sentry (`@sentry/node`), Zod

---

## Task 1: Zod Job Validators

**Files:**
- Create: `backend/src/validators/job.validators.ts`
- Test: `backend/tests/unit/validators/job.validators.test.ts`

**Step 1: Write the failing tests**

Create `backend/tests/unit/validators/job.validators.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  imageOptimizeJobSchema,
  emailSendNotificationJobSchema,
  docGeneratePlanJobSchema,
  renderGenerateJobSchema,
  aiProcessMessageJobSchema,
} from '../../../src/validators/job.validators.js';

describe('job.validators', () => {
  describe('imageOptimizeJobSchema', () => {
    it('should accept valid image job data', () => {
      const result = imageOptimizeJobSchema.safeParse({
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional width and quality', () => {
      const result = imageOptimizeJobSchema.safeParse({
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        width: 1200,
        quality: 80,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing assetId', () => {
      const result = imageOptimizeJobSchema.safeParse({
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-UUID assetId', () => {
      const result = imageOptimizeJobSchema.safeParse({
        assetId: 'not-a-uuid',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });

    it('should reject quality > 100', () => {
      const result = imageOptimizeJobSchema.safeParse({
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        quality: 101,
      });
      expect(result.success).toBe(false);
    });

    it('should reject quality < 1', () => {
      const result = imageOptimizeJobSchema.safeParse({
        assetId: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        quality: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('emailSendNotificationJobSchema', () => {
    it('should accept valid email job data', () => {
      const result = emailSendNotificationJobSchema.safeParse({
        to: 'user@example.com',
        subject: 'Welcome',
        template: 'welcome',
        data: { html: '<p>Hello</p>' },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email address', () => {
      const result = emailSendNotificationJobSchema.safeParse({
        to: 'not-an-email',
        subject: 'Welcome',
        template: 'welcome',
        data: { html: '<p>Hello</p>' },
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty subject', () => {
      const result = emailSendNotificationJobSchema.safeParse({
        to: 'user@example.com',
        subject: '',
        template: 'welcome',
        data: {},
      });
      expect(result.success).toBe(false);
    });
  });

  describe('docGeneratePlanJobSchema', () => {
    it('should accept valid doc job data', () => {
      const result = docGeneratePlanJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        format: 'pdf',
      });
      expect(result.success).toBe(true);
    });

    it('should accept html format', () => {
      const result = docGeneratePlanJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        format: 'html',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid format', () => {
      const result = docGeneratePlanJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        format: 'docx',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('renderGenerateJobSchema', () => {
    it('should accept valid render job data', () => {
      const result = renderGenerateJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        prompt: 'Modern kitchen with marble countertops',
        assetId: '770e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty prompt', () => {
      const result = renderGenerateJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        prompt: '',
        assetId: '770e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });

    it('should reject prompt over 5000 chars', () => {
      const result = renderGenerateJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        roomId: '660e8400-e29b-41d4-a716-446655440000',
        prompt: 'x'.repeat(5001),
        assetId: '770e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('aiProcessMessageJobSchema', () => {
    it('should accept valid AI job data', () => {
      const result = aiProcessMessageJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'I want to renovate my kitchen',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional userId', () => {
      const result = aiProcessMessageJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Help me',
        userId: '880e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.userId).toBe('880e8400-e29b-41d4-a716-446655440000');
      }
    });

    it('should reject empty content', () => {
      const result = aiProcessMessageJobSchema.safeParse({
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        content: '',
      });
      expect(result.success).toBe(false);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run tests/unit/validators/job.validators.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

Create `backend/src/validators/job.validators.ts`:

```typescript
import { z } from 'zod';

/**
 * Zod schemas for BullMQ job data validation.
 *
 * Workers parse job.data through these schemas at entry.
 * Invalid data throws UnrecoverableError (no retry).
 *
 * Matches JobTypes interface in config/queue.ts.
 */

export const imageOptimizeJobSchema = z.object({
  assetId: z.string().uuid(),
  sessionId: z.string().uuid(),
  width: z.number().int().positive().optional(),
  quality: z.number().int().min(1).max(100).optional(),
});

export const emailSendNotificationJobSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  template: z.string().min(1).max(100),
  data: z.record(z.unknown()),
});

export const docGeneratePlanJobSchema = z.object({
  sessionId: z.string().uuid(),
  roomId: z.string().uuid(),
  format: z.enum(['pdf', 'html']),
});

export const renderGenerateJobSchema = z.object({
  sessionId: z.string().uuid(),
  roomId: z.string().uuid(),
  prompt: z.string().min(1).max(5000),
  assetId: z.string().uuid(),
});

export const aiProcessMessageJobSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().min(1).max(10000),
  userId: z.string().uuid().optional(),
});

export type ImageOptimizeJobData = z.infer<typeof imageOptimizeJobSchema>;
export type EmailSendNotificationJobData = z.infer<typeof emailSendNotificationJobSchema>;
export type DocGeneratePlanJobData = z.infer<typeof docGeneratePlanJobSchema>;
export type RenderGenerateJobData = z.infer<typeof renderGenerateJobSchema>;
export type AiProcessMessageJobData = z.infer<typeof aiProcessMessageJobSchema>;
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/unit/validators/job.validators.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/validators/job.validators.ts backend/tests/unit/validators/job.validators.test.ts
git commit -m "feat(queue): add Zod job data validation schemas

- One schema per JobTypes entry matching queue.ts interface
- UUID validation for all IDs, email validation, enum for format
- Prompt length cap at 5000 chars, quality range 1-100
- 20 test cases covering valid, invalid, and edge cases"
```

---

## Task 2: Wire Zod Validation Into Workers

**Files:**
- Modify: `backend/src/workers/image.worker.ts` (replace manual checks with Zod)
- Modify: `backend/src/workers/email.worker.ts` (replace manual checks with Zod)
- Modify: `backend/src/workers/doc.worker.ts` (replace manual checks with Zod)
- Modify: `backend/src/workers/render.worker.ts` (replace manual checks with Zod)

**Step 1: Update image.worker.ts**

Replace the manual validation block (lines 57-62) with:

```typescript
import { imageOptimizeJobSchema } from '../validators/job.validators.js';

// At the top of processImageJob, replace manual checks with:
const parsed = imageOptimizeJobSchema.safeParse(job.data);
if (!parsed.success) {
  throw new UnrecoverableError(`Invalid job data: ${parsed.error.issues.map(i => i.message).join(', ')}`);
}
const { assetId, sessionId } = parsed.data;
```

Remove the old manual `if (!assetId ...)` and `if (!sessionId ...)` blocks.

**Step 2: Update email.worker.ts**

Replace the manual validation block (lines 52-67) with:

```typescript
import { emailSendNotificationJobSchema } from '../validators/job.validators.js';

// At the top of processEmailJob, replace manual checks with:
const parsed = emailSendNotificationJobSchema.safeParse(job.data);
if (!parsed.success) {
  throw new UnrecoverableError(`Invalid job data: ${parsed.error.issues.map(i => i.message).join(', ')}`);
}
const { to, subject, data } = parsed.data;
```

Remove the old manual `if (!to ...)`, `if (!subject ...)`, `if (!data ...)`, and `if (!dataObj.html ...)` blocks. Note: the `data.html` check moves to the Zod schema level — the `emailSendNotificationJobSchema.data` field is `z.record(z.unknown())`, so the `html` check stays in the worker as a business rule (it's not a schema property of `data`):

```typescript
const dataObj = data as Record<string, unknown>;
if (!dataObj.html || typeof dataObj.html !== 'string') {
  throw new UnrecoverableError('Invalid job data: "data.html" must be a string');
}
const html = dataObj.html;
```

**Step 3: Update doc.worker.ts**

Replace the manual validation block (lines 18-26) with:

```typescript
import { docGeneratePlanJobSchema } from '../validators/job.validators.js';

// At the top of processDocJob, replace manual checks with:
const parsed = docGeneratePlanJobSchema.safeParse(job.data);
if (!parsed.success) {
  throw new UnrecoverableError(`Invalid job data: ${parsed.error.issues.map(i => i.message).join(', ')}`);
}
const { sessionId, roomId, format } = parsed.data;
```

Remove the old manual `if (!sessionId ...)`, `if (!roomId ...)`, and `if (!format ...)` blocks. Also remove the `VALID_FORMATS` constant since Zod handles the enum now.

**Step 4: Update render.worker.ts**

Replace the manual validation block (lines 33-36) with:

```typescript
import { renderGenerateJobSchema } from '../validators/job.validators.js';

// At the top of processRenderJob, replace manual checks with:
const parsed = renderGenerateJobSchema.safeParse(job.data);
if (!parsed.success) {
  throw new UnrecoverableError(`Invalid job data: ${parsed.error.issues.map(i => i.message).join(', ')}`);
}
const { sessionId, roomId, prompt, assetId } = parsed.data;
```

Remove the old `if (!sessionId || !roomId || !prompt || !assetId)` block.

**Step 5: Run existing worker tests**

Run: `cd backend && npx vitest run tests/unit/workers/`
Expected: ALL PASS (validation behavior unchanged — same errors, different mechanism)

**Step 6: Commit**

```bash
git add backend/src/workers/image.worker.ts backend/src/workers/email.worker.ts backend/src/workers/doc.worker.ts backend/src/workers/render.worker.ts
git commit -m "refactor(workers): replace manual validation with Zod schemas

- All 4 workers now use centralized Zod schemas from job.validators.ts
- UnrecoverableError on validation failure (no retry for bad data)
- Removed redundant VALID_FORMATS constant from doc worker"
```

---

## Task 3: OTel Job Tracing in createWorker

**Files:**
- Modify: `backend/src/config/queue.ts` (add tracing wrapper)
- Modify: `backend/tests/unit/config/queue.test.ts` (add tracing tests)

**Step 1: Write the failing tests**

Add to `backend/tests/unit/config/queue.test.ts`, inside the `describe('queue.ts')` block:

```typescript
// Add these mocks at the top of the file, after existing mocks:
const mockSpanEnd = vi.fn();
const mockSpanSetAttributes = vi.fn();
const mockSpanSetStatus = vi.fn();
const mockSpanRecordException = vi.fn();
const mockSpan = {
  setAttributes: mockSpanSetAttributes,
  setStatus: mockSpanSetStatus,
  recordException: mockSpanRecordException,
  end: mockSpanEnd,
};
const mockStartActiveSpan = vi.fn((name: string, fn: (span: typeof mockSpan) => unknown) => fn(mockSpan));
const mockGetTracer = vi.fn(() => ({ startActiveSpan: mockStartActiveSpan }));

vi.mock('@opentelemetry/api', () => ({
  trace: { getTracer: (...args: unknown[]) => mockGetTracer(...args) },
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

// Then add a new describe block:
describe('OTel job tracing', () => {
  it('should wrap processor in an OTel span', async () => {
    const { createWorker } = await import('../../../src/config/queue.js');
    const processor = vi.fn().mockResolvedValue(undefined);

    createWorker('image:optimize', processor);

    // The processor passed to BullMQ Worker should be the traced wrapper, not the original
    const wrappedProcessor = MockWorker.mock.calls[MockWorker.mock.calls.length - 1]![1];
    expect(wrappedProcessor).not.toBe(processor);
  });

  it('should set job attributes on the span', async () => {
    const { createWorker } = await import('../../../src/config/queue.js');
    const processor = vi.fn().mockResolvedValue('result');

    createWorker('image:optimize', processor);

    const wrappedProcessor = MockWorker.mock.calls[MockWorker.mock.calls.length - 1]![1];
    const mockJob = { id: 'job-42', name: 'image:optimize', attemptsMade: 1, data: {} };

    await wrappedProcessor(mockJob, undefined);

    expect(mockSpanSetAttributes).toHaveBeenCalledWith({
      'job.id': 'job-42',
      'job.name': 'image:optimize',
      'job.queue': 'image:optimize',
      'job.attempt': 2,
    });
  });

  it('should set OK status on successful job', async () => {
    const { createWorker } = await import('../../../src/config/queue.js');
    const processor = vi.fn().mockResolvedValue(undefined);

    createWorker('image:optimize', processor);

    const wrappedProcessor = MockWorker.mock.calls[MockWorker.mock.calls.length - 1]![1];
    await wrappedProcessor({ id: 'j1', name: 'test', attemptsMade: 0, data: {} }, undefined);

    expect(mockSpanSetStatus).toHaveBeenCalledWith({ code: 1 });
    expect(mockSpanEnd).toHaveBeenCalled();
  });

  it('should set ERROR status and record exception on failed job', async () => {
    const { createWorker } = await import('../../../src/config/queue.js');
    const testError = new Error('boom');
    const processor = vi.fn().mockRejectedValue(testError);

    createWorker('image:optimize', processor);

    const wrappedProcessor = MockWorker.mock.calls[MockWorker.mock.calls.length - 1]![1];

    await expect(
      wrappedProcessor({ id: 'j2', name: 'test', attemptsMade: 0, data: {} }, undefined),
    ).rejects.toThrow('boom');

    expect(mockSpanSetStatus).toHaveBeenCalledWith({ code: 2, message: 'boom' });
    expect(mockSpanRecordException).toHaveBeenCalledWith(testError);
    expect(mockSpanEnd).toHaveBeenCalled();
  });

  it('should use job.id fallback "unknown" when id is undefined', async () => {
    const { createWorker } = await import('../../../src/config/queue.js');
    const processor = vi.fn().mockResolvedValue(undefined);

    createWorker('image:optimize', processor);

    const wrappedProcessor = MockWorker.mock.calls[MockWorker.mock.calls.length - 1]![1];
    await wrappedProcessor({ id: undefined, name: 'test', attemptsMade: 0, data: {} }, undefined);

    expect(mockSpanSetAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ 'job.id': 'unknown' }),
    );
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run tests/unit/config/queue.test.ts`
Expected: FAIL — no OTel import or tracing in createWorker yet

**Step 3: Write the implementation**

Modify `backend/src/config/queue.ts`:

1. Add imports at the top:

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';
```

2. Add tracer after the logger:

```typescript
const jobTracer = trace.getTracer('renovation-agent-jobs', '1.0.0');
```

3. In `createWorker`, wrap the processor before passing it to `new Worker`:

```typescript
// Inside createWorker, before `const worker = new Worker(...)`:
const tracedProcessor: Processor<JobTypes[T]> = async (job, token) => {
  return jobTracer.startActiveSpan(`job:${name}`, (span) => {
    span.setAttributes({
      'job.id': job.id ?? 'unknown',
      'job.name': job.name,
      'job.queue': name,
      'job.attempt': job.attemptsMade + 1,
    });
    return processor(job, token)
      .then((result) => {
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      })
      .catch((error: Error) => {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
        throw error;
      })
      .finally(() => {
        span.end();
      });
  });
};
```

Then change `const worker = new Worker<JobTypes[T]>(name, processor, {` to `const worker = new Worker<JobTypes[T]>(name, tracedProcessor, {`.

**Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/unit/config/queue.test.ts`
Expected: ALL PASS

**Step 5: Verify existing worker tests still pass**

Run: `cd backend && npx vitest run tests/unit/workers/`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add backend/src/config/queue.ts backend/tests/unit/config/queue.test.ts
git commit -m "feat(otel): add automatic job tracing to createWorker

- Every BullMQ worker gets OTel spans via renovation-agent-jobs tracer
- Span attributes: job.id, job.name, job.queue, job.attempt
- SpanStatusCode.ERROR + recordException on failure
- 5 new tests covering span lifecycle"
```

---

## Task 4: Sentry DLQ Alerting

**Files:**
- Modify: `backend/src/config/dead-letter.ts` (add Sentry captureMessage)
- Modify: `backend/tests/unit/config/dead-letter.test.ts` (add Sentry tests)

**Step 1: Write the failing tests**

Add to `backend/tests/unit/config/dead-letter.test.ts`:

```typescript
// Add Sentry mocks at the top, after existing mocks:
const mockCaptureMessage = vi.fn();
const mockIsSentryEnabled = vi.fn().mockReturnValue(false);

// Add to the vi.mock or vi.doMock section:
vi.mock('../../../src/config/sentry.js', () => ({
  Sentry: { captureMessage: (...args: unknown[]) => mockCaptureMessage(...args) },
  isSentryEnabled: () => mockIsSentryEnabled(),
}));

// Add these new tests inside the describe('dead-letter.ts') block:
describe('Sentry DLQ alerting', () => {
  it('should call Sentry.captureMessage when Sentry is enabled', async () => {
    mockIsSentryEnabled.mockReturnValue(true);

    const { moveToDeadLetter } = await import('../../../src/config/dead-letter.js');

    const mockJob = {
      id: 'job-sentry-1',
      data: { assetId: 'a1' },
      attemptsMade: 3,
    };

    await moveToDeadLetter(mockJob as never, 'Max retries exceeded', 'image:optimize');

    expect(mockCaptureMessage).toHaveBeenCalledWith(
      'Job moved to dead letter queue: image:optimize',
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({
          originalJobId: 'job-sentry-1',
          sourceQueue: 'image:optimize',
          reason: 'Max retries exceeded',
          attemptsMade: 3,
        }),
        tags: expect.objectContaining({
          queue: 'image:optimize',
          component: 'dead-letter-queue',
        }),
      }),
    );
  });

  it('should NOT call Sentry.captureMessage when Sentry is disabled', async () => {
    mockIsSentryEnabled.mockReturnValue(false);

    const { moveToDeadLetter } = await import('../../../src/config/dead-letter.js');

    const mockJob = {
      id: 'job-no-sentry',
      data: {},
      attemptsMade: 2,
    };

    await moveToDeadLetter(mockJob as never, 'fail', 'doc:generate-plan');

    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  it('should still log to DLQ even if Sentry call throws', async () => {
    mockIsSentryEnabled.mockReturnValue(true);
    mockCaptureMessage.mockImplementation(() => { throw new Error('Sentry down'); });

    const { moveToDeadLetter } = await import('../../../src/config/dead-letter.js');

    const mockJob = {
      id: 'job-sentry-fail',
      data: {},
      attemptsMade: 1,
    };

    // Should not throw — Sentry error is swallowed
    await expect(
      moveToDeadLetter(mockJob as never, 'fail', 'email:send-notification'),
    ).resolves.toBeUndefined();

    // DLQ add should still have been attempted
    expect(mockQueueAdd).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run tests/unit/config/dead-letter.test.ts`
Expected: FAIL — no Sentry import in dead-letter.ts

**Step 3: Write the implementation**

Modify `backend/src/config/dead-letter.ts`:

1. Add imports:

```typescript
import { Sentry, isSentryEnabled } from './sentry.js';
```

2. Inside `moveToDeadLetter`, after the `await dlq.add(...)` call and its logger.info, add:

```typescript
// Alert Sentry when a job exhausts all retries
if (isSentryEnabled()) {
  try {
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
  } catch {
    // Sentry failure must never block DLQ operation
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/unit/config/dead-letter.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/config/dead-letter.ts backend/tests/unit/config/dead-letter.test.ts
git commit -m "feat(sentry): alert on dead letter queue entries

- Sentry.captureMessage with warning level on each DLQ entry
- Includes job metadata (sourceQueue, reason, attemptsMade) as extra
- Tags: queue name + component for Sentry filtering
- Guarded by isSentryEnabled() — no-op when unconfigured
- Sentry failure is swallowed to never block DLQ operation
- 3 new tests"
```

---

## Task 5: Per-Worker Shutdown Registration

**Files:**
- Modify: `backend/src/server.ts` (split shutdown registration)

**Step 1: Read the current shutdown registration code**

The current code at `server.ts:652-661`:

```typescript
shutdownManager.registerResource({
  name: 'Workers & Queues',
  cleanup: async () => {
    const workers = [emailWorker, imageWorker, docWorker, renderWorker].filter(Boolean);
    await Promise.allSettled(workers.map(w => w!.close()));
    await closeQueues();
  },
  timeout: 5000,
});
```

**Step 2: Replace with per-worker registration**

Import `WORKER_PROFILES` at the top of server.ts:

```typescript
import { closeQueues, WORKER_PROFILES } from './config/queue.js';
```

Replace the single "Workers & Queues" resource with individual per-worker resources + a separate queues resource:

```typescript
// Per-worker shutdown — timeout derived from profile lockDuration + 2s buffer
if (emailWorker) {
  shutdownManager.registerResource({
    name: 'EmailWorker',
    cleanup: async () => { await emailWorker!.close(); },
    timeout: WORKER_PROFILES['email:send-notification'].lockDuration + 2000,
  });
}

if (imageWorker) {
  shutdownManager.registerResource({
    name: 'ImageWorker',
    cleanup: async () => { await imageWorker!.close(); },
    timeout: WORKER_PROFILES['image:optimize'].lockDuration + 2000,
  });
}

if (docWorker) {
  shutdownManager.registerResource({
    name: 'DocWorker',
    cleanup: async () => { await docWorker!.close(); },
    timeout: WORKER_PROFILES['doc:generate-plan'].lockDuration + 2000,
  });
}

if (renderWorker) {
  shutdownManager.registerResource({
    name: 'RenderWorker',
    cleanup: async () => { await renderWorker!.close(); },
    timeout: WORKER_PROFILES['render:generate'].lockDuration + 2000,
  });
}

// Close queues after workers are drained (workers need Redis during drain)
shutdownManager.registerResource({
  name: 'Queues',
  cleanup: async () => { await closeQueues(); },
  timeout: 5000,
});
```

This gives:
- EmailWorker: 32s timeout (30s lockDuration + 2s)
- ImageWorker: 62s timeout (60s lockDuration + 2s)
- DocWorker: 182s timeout (180s lockDuration + 2s)
- RenderWorker: 122s timeout (120s lockDuration + 2s)

Also update the global shutdown timeout to accommodate the longest worker. In the `setupGracefulShutdown` function, change the default from 10s to 200s:

```typescript
shutdownManager = new ShutdownManager(httpServer, {
  timeout: parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '200000', 10),
  logger,
});
```

**Step 3: Verify the app still starts**

Run: `cd backend && npx tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add backend/src/server.ts
git commit -m "feat(shutdown): per-worker shutdown with profile-derived timeouts

- Split single 'Workers & Queues' resource into individual per-worker resources
- Timeout = lockDuration + 2s buffer (email: 32s, image: 62s, doc: 182s, render: 122s)
- Queue closing is a separate resource registered after workers
- Global shutdown timeout increased to 200s (was 10s)"
```

---

## Task 6: Run Full Test Suite + Type Check

**Files:** None (verification only)

**Step 1: Run backend type check**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

**Step 2: Run full backend test suite**

Run: `cd backend && npm run test:unit`
Expected: ALL PASS

**Step 3: Run frontend type check** (to make sure nothing breaks)

Run: `cd frontend && npm run type-check`
Expected: No errors

**Step 4: Final commit if any fixes needed**

If any tests fail or type errors appear, fix them and commit the fixes.
