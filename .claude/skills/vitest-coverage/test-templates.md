# Test Templates

Copy-paste templates for each test category, pre-filled with the project's mock patterns.

---

## Service Test Template

For files in `backend/src/services/*.service.ts`.

```typescript
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { MyService } from '../../../src/services/my.service.js';
import { db } from '../../../src/db/index.js';

vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: null,
}));

vi.mock('../../../src/config/env.js', () => ({
  env: { NODE_ENV: 'test' },
  isStorageEnabled: vi.fn().mockReturnValue(false),
}));

// ── Drizzle chain helpers ──

function mockSelectRows(...callRows: unknown[][]): void {
  for (const rows of callRows) {
    const mockWhere = vi.fn().mockResolvedValue(rows);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as Mock).mockReturnValueOnce({ from: mockFrom });
  }
}

function mockInsertReturning(rows: unknown[]): Mock {
  const mockReturning = vi.fn().mockResolvedValue(rows);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  (db.insert as Mock).mockReturnValue({ values: mockValues });
  return mockValues;
}

function mockUpdateReturning(rows: unknown[]): void {
  const mockReturning = vi.fn().mockResolvedValue(rows);
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  (db.update as Mock).mockReturnValue({ set: mockSet });
}

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    service = new MyService();
    vi.clearAllMocks();
  });

  describe('methodName', () => {
    it('should handle happy path', async () => {
      mockSelectRows([{ id: '1', /* ... */ }]);
      const result = await service.methodName('id-1');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundError when record missing', async () => {
      mockSelectRows([]);
      await expect(service.methodName('missing')).rejects.toThrow('not found');
    });

    it('should handle isStorageEnabled() = false branch', async () => {
      // Already mocked false above — test the mock/fallback code path
    });
  });
});
```

---

## Worker Test Template

For files in `backend/src/workers/*.worker.ts`. Workers use `vi.doMock` + `vi.resetModules`.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import type { Mock } from 'vitest';

// Static mocks for modules that don't need per-test reconfiguration
vi.mock('../../../src/config/redis.js', () => ({
  getRedisConnection: vi.fn(() => ({ duplicate: vi.fn(() => ({})) })),
  redis: null,
  connectRedis: vi.fn(),
  closeRedis: vi.fn(),
  testRedisConnection: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../../../src/config/queue.js', () => ({
  createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
}));

vi.mock('../../../src/config/env.js', () => ({
  isStorageEnabled: vi.fn().mockReturnValue(true),
  env: { SUPABASE_STORAGE_BUCKET: 'assets', REDIS_URL: 'redis://localhost:6379' },
}));

vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: { storage: { from: vi.fn() } },
}));

vi.mock('../../../src/db/index.js', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
}));

vi.mock('../../../src/utils/socket-emitter.js', () => ({
  emitToSession: vi.fn(),
}));

describe('MyWorker', () => {
  let processJob: (job: Record<string, unknown>) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-mock with vi.doMock for fresh module per test
    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
    }));
    vi.doMock('../../../src/config/queue.js', () => ({
      createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
    }));
    // ... repeat for other mocks as needed

    const mod = await import('../../../src/workers/my.worker.js');
    mod.startMyWorker();

    const { createWorker: cw } = await import('../../../src/config/queue.js');
    processJob = (cw as Mock).mock.calls[0][1] as typeof processJob;
  });

  it('should throw UnrecoverableError for invalid job data (Zod)', async () => {
    const job = { data: { /* missing required fields */ }, id: 'job-1' };
    await expect(processJob(job)).rejects.toThrow(UnrecoverableError);
    await expect(processJob(job)).rejects.toThrow('Invalid job data');
  });

  it('should process valid job successfully', async () => {
    const job = { data: { /* valid fields */ }, id: 'job-2' };
    await expect(processJob(job)).resolves.toBeUndefined();
  });

  it('should return early when feature is disabled', async () => {
    // Re-setup with isStorageEnabled = false or isEmailEnabled = false
    vi.clearAllMocks();
    vi.resetModules();
    vi.doMock('../../../src/config/env.js', () => ({
      isStorageEnabled: vi.fn().mockReturnValue(false),
      env: { SUPABASE_STORAGE_BUCKET: 'assets', REDIS_URL: 'redis://localhost:6379' },
    }));
    // ... re-import and extract processor
  });

  it('should register with correct queue name', async () => {
    const { createWorker: cw } = await import('../../../src/config/queue.js');
    expect((cw as Mock).mock.calls[0][0]).toBe('my:job-name');
  });
});
```

---

## Tool Test Template

For files in `backend/src/tools/*.tool.ts`. Tools use `vi.hoisted` + direct `tool.invoke()`.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockServiceMethod } = vi.hoisted(() => ({
  mockServiceMethod: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../../../src/services/my.service.js', () => ({
  MyService: vi.fn().mockImplementation(() => ({
    myMethod: mockServiceMethod,
  })),
}));

import { myTool } from '../../../src/tools/my.tool.js';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('myTool', () => {
  beforeEach(() => {
    mockServiceMethod.mockReset();
  });

  it('should have correct name', () => {
    expect(myTool.name).toBe('my_tool');
  });

  it('should return success JSON on happy path', async () => {
    mockServiceMethod.mockResolvedValue({ id: '1' });

    const result = await myTool.invoke({
      sessionId: SESSION_ID,
      /* other params */
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
  });

  it('should return error JSON on failure (never throws)', async () => {
    mockServiceMethod.mockRejectedValue(new Error('Something failed'));

    const result = await myTool.invoke({
      sessionId: SESSION_ID,
      /* other params */
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Something failed');
  });
});
```

---

## Validator Test Template

For files in `backend/src/validators/*.ts`. Pure Zod schema tests — no mocks needed.

```typescript
import { describe, it, expect } from 'vitest';
import { mySchema } from '../../../src/validators/my.validators.js';

describe('mySchema', () => {
  const validData = {
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    /* ... required fields */
  };

  it('should accept valid data', () => {
    expect(() => mySchema.parse(validData)).not.toThrow();
  });

  it('should reject missing required field', () => {
    const { sessionId, ...rest } = validData;
    expect(() => mySchema.parse(rest)).toThrow();
  });

  it('should reject invalid UUID', () => {
    expect(() => mySchema.parse({ ...validData, sessionId: 'not-uuid' })).toThrow();
  });

  it('should reject empty string for non-empty field', () => {
    expect(() => mySchema.parse({ ...validData, sessionId: '' })).toThrow();
  });
});
```

---

## Coverage Gap Checklist

When generating tests for a file, ensure these branches are covered:

- [ ] Happy path (nominal success)
- [ ] Record not found (`db.select` returns `[]`)
- [ ] Insert/update returns `undefined` (DB failure)
- [ ] `isStorageEnabled()` = false (mock code path)
- [ ] `isEmailEnabled()` = false (skip processing)
- [ ] Zod validation failure (missing/invalid fields) → `UnrecoverableError`
- [ ] Network/transient error → retriable `Error`
- [ ] Permanent error → `UnrecoverableError`
- [ ] `supabaseAdmin` = null (storage not configured)
- [ ] Supabase storage operation failure (upload/download rejects)
- [ ] `emitToSession` called with correct event name and payload
- [ ] Edge cases: empty arrays, null optionals, boundary values
