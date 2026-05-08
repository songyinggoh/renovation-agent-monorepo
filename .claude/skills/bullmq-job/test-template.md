# Worker Test Template

Complete template for `backend/tests/unit/workers/{name}.worker.test.ts`. Based on `image.worker.test.ts`.

## Key Testing Pattern

Workers use **dynamic imports** with `vi.resetModules()` + `vi.doMock()` in `beforeEach`. This is required because:

1. Workers execute side effects at module load time (e.g., `new Logger()`, `const service = new Service()`)
2. `vi.mock()` at the top level sets up hoisted mocks, but `vi.doMock()` in `beforeEach` provides fresh mocks per test
3. The processor function is extracted from `createWorker` mock calls after importing the worker module

## Minimal Test File

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import type { Mock } from 'vitest';

// ============================================
// Top-level vi.mock() — hoisted, sets up initial mocks
// ============================================

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(), error: vi.fn(), warn: vi.fn(),
  })),
}));

vi.mock('../../../src/config/queue.js', () => ({
  createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
}));

vi.mock('../../../src/config/env.js', () => ({
  env: { REDIS_URL: 'redis://localhost:6379' },
}));

// Mock any other dependencies (DB, services, socket-emitter, etc.)
vi.mock('../../../src/utils/socket-emitter.js', () => ({
  emitToSession: vi.fn(),
}));

describe('{Name}Worker', () => {
  let process{Name}Job: (job: Record<string, unknown>) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // ============================================
    // vi.doMock() — fresh mocks for each test
    // Must mirror the top-level vi.mock() calls
    // ============================================

    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({
        info: vi.fn(), error: vi.fn(), warn: vi.fn(),
      })),
    }));

    vi.doMock('../../../src/config/queue.js', () => ({
      createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
    }));

    vi.doMock('../../../src/config/env.js', () => ({
      env: { REDIS_URL: 'redis://localhost:6379' },
    }));

    vi.doMock('../../../src/utils/socket-emitter.js', () => ({
      emitToSession: vi.fn(),
    }));

    // ============================================
    // Import worker module + extract processor
    // ============================================

    const mod = await import('../../../src/workers/{name}.worker.js');
    mod.start{Name}Worker();

    const { createWorker: cw } = await import('../../../src/config/queue.js');
    process{Name}Job = (cw as Mock).mock.calls[0][1] as typeof process{Name}Job;
  });

  // ============================================
  // Test 1: Zod validation — missing required field
  // ============================================
  it('should throw UnrecoverableError for invalid job data', async () => {
    const job = {
      data: { sessionId: '' /* invalid UUID */ },
      id: 'job-1',
    };
    await expect(process{Name}Job(job)).rejects.toThrow(UnrecoverableError);
  });

  // ============================================
  // Test 2: Zod validation — wrong type
  // ============================================
  it('should throw UnrecoverableError for missing sessionId', async () => {
    const job = {
      data: { /* missing required fields */ },
      id: 'job-2',
    };
    await expect(process{Name}Job(job)).rejects.toThrow(UnrecoverableError);
  });

  // ============================================
  // Test 3: Happy path
  // ============================================
  it('should process job successfully', async () => {
    const job = {
      data: {
        sessionId: '00000000-0000-4000-a000-000000000001',
        // ... other valid fields
      },
      id: 'job-3',
    };
    // Mock dependencies to return success
    await expect(process{Name}Job(job)).resolves.toBeUndefined();
  });

  // ============================================
  // Test 4: Queue registration
  // ============================================
  it('should register with correct queue name', async () => {
    const { createWorker: cw } = await import('../../../src/config/queue.js');
    expect((cw as Mock).mock.calls[0][0]).toBe('{job-name}');
  });

  // ============================================
  // Test 5: Profile defaults (no explicit concurrency arg)
  // ============================================
  it('should use profile defaults (no explicit concurrency arg)', async () => {
    const { createWorker: cw } = await import('../../../src/config/queue.js');
    expect((cw as Mock).mock.calls[0][2]).toBeUndefined();
  });
});
```

## Test With Feature Guard

For workers that skip when infrastructure isn't available (like `image.worker.ts`):

```typescript
it('should return early when feature is disabled', async () => {
  vi.clearAllMocks();
  vi.resetModules();

  // Override the feature flag mock
  vi.doMock('../../../src/utils/logger.js', () => ({
    Logger: vi.fn().mockImplementation(() => ({
      info: vi.fn(), error: vi.fn(), warn: vi.fn(),
    })),
  }));
  vi.doMock('../../../src/config/queue.js', () => ({
    createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
  }));
  vi.doMock('../../../src/config/env.js', () => ({
    isStorageEnabled: vi.fn().mockReturnValue(false),  // <-- disabled
    env: { REDIS_URL: 'redis://localhost:6379' },
  }));
  vi.doMock('../../../src/utils/socket-emitter.js', () => ({
    emitToSession: vi.fn(),
  }));

  // Re-import with new mocks
  const mod = await import('../../../src/workers/{name}.worker.js');
  mod.start{Name}Worker();
  const { createWorker: cw2 } = await import('../../../src/config/queue.js');
  const processor = (cw2 as Mock).mock.calls[0][1] as typeof process{Name}Job;

  const job = {
    data: {
      sessionId: '00000000-0000-4000-a000-000000000001',
      // ... valid data
    },
    id: 'job-guard',
  };
  // Should resolve without error (job completes as no-op)
  await expect(processor(job)).resolves.toBeUndefined();
});
```

## Test With Error Handling

For workers that emit Socket.io events on failure (like `render.worker.ts`):

```typescript
it('should emit failure event on last attempt', async () => {
  // Setup mocks that cause the business logic to fail
  vi.doMock('../../../src/services/my.service.js', () => ({
    MyService: vi.fn().mockImplementation(() => ({
      doWork: vi.fn().mockRejectedValue(new Error('API failed')),
      markFailed: vi.fn(),
    })),
  }));

  // Re-import...
  const mod = await import('../../../src/workers/{name}.worker.js');
  mod.start{Name}Worker();
  const { createWorker: cw } = await import('../../../src/config/queue.js');
  const processor = (cw as Mock).mock.calls[0][1];

  const job = {
    data: { sessionId: 'uuid', roomId: 'uuid' },
    id: 'job-fail',
    attemptsMade: 2,           // 0-indexed, so this is attempt 3
    opts: { attempts: 3 },     // Max 3 attempts
  };

  await expect(processor(job)).rejects.toThrow('API failed');

  // Verify failure event was emitted
  const { emitToSession } = await import('../../../src/utils/socket-emitter.js');
  expect(emitToSession).toHaveBeenCalledWith(
    'uuid',
    '{namespace}:failed',
    expect.objectContaining({ error: expect.any(String) }),
  );
});

it('should NOT emit failure event on non-final attempt', async () => {
  // Same setup...
  const job = {
    data: { sessionId: 'uuid', roomId: 'uuid' },
    id: 'job-retry',
    attemptsMade: 0,           // First attempt
    opts: { attempts: 3 },
  };

  await expect(processor(job)).rejects.toThrow();

  const { emitToSession } = await import('../../../src/utils/socket-emitter.js');
  expect(emitToSession).not.toHaveBeenCalledWith(
    expect.anything(),
    '{namespace}:failed',
    expect.anything(),
  );
});
```

## Test Patterns Summary

| Test Category | What to Assert | Workers |
|---|---|---|
| Zod validation failure | `rejects.toThrow(UnrecoverableError)` | All |
| Feature guard skip | `resolves.toBeUndefined()` | Workers with `isStorageEnabled` etc. |
| Happy path | `resolves.toBeUndefined()` + side effects | All |
| Queue name registration | `mock.calls[0][0]` equals job name | All |
| Profile defaults | `mock.calls[0][2]` is undefined | All |
| Error re-throw for retry | `rejects.toThrow(Error)` (not UnrecoverableError) | Workers with external APIs |
| Last-attempt failure event | `emitToSession` called with `*:failed` | Workers with Socket.io events |
| Permanent error detection | `rejects.toThrow(UnrecoverableError)` | Workers with `isPermanentError` |

## UUID Constants for Tests

Use valid v4 UUIDs in test data:

```typescript
const TEST_UUID_1 = '00000000-0000-4000-a000-000000000001';
const TEST_UUID_2 = '00000000-0000-4000-a000-000000000002';
const TEST_UUID_3 = '00000000-0000-4000-a000-000000000003';
```

These pass Zod's `z.string().uuid()` validation while being easy to identify in test output.

## Common Mock Shapes

```typescript
// DB with chained select
db: {
  select: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([/* results */]),
    }),
  }),
  insert: vi.fn().mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([/* inserted */]),
    }),
  }),
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([/* updated */]),
    }),
  }),
}

// Supabase storage
supabaseAdmin: {
  storage: {
    from: vi.fn().mockReturnValue({
      download: vi.fn().mockResolvedValue({ data: Buffer.from(''), error: null }),
      upload: vi.fn().mockResolvedValue({ data: { path: 'uploaded/path' }, error: null }),
    }),
  },
}

// Resend email client
getResendClient: vi.fn().mockReturnValue({
  emails: {
    send: vi.fn().mockResolvedValue({ data: { id: 'email-id' }, error: null }),
  },
})
```
