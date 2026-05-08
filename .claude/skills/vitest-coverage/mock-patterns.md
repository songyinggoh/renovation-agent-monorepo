# Mock Patterns Catalog

Every `vi.mock` pattern used across the 37 test files. Use these exact patterns — don't invent new ones.

## Core Mocks (used in nearly every test file)

### Logger

```typescript
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));
```

### Drizzle DB

```typescript
vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));
```

### Env Config

```typescript
// Minimal (most tests)
vi.mock('../../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    SUPABASE_STORAGE_BUCKET: 'test-bucket',
  },
  isStorageEnabled: vi.fn().mockReturnValue(false),
}));

// With email toggle
vi.mock('../../../src/config/env.js', () => ({
  isEmailEnabled: () => mockIsEmailEnabled(),
  env: {
    FROM_EMAIL: 'test@example.com',
    REDIS_URL: 'redis://localhost:6379',
  },
}));
```

### Redis

```typescript
vi.mock('../../../src/config/redis.js', () => ({
  getRedisConnection: vi.fn(() => ({
    duplicate: vi.fn(() => ({})),
  })),
  redis: null,
  connectRedis: vi.fn(),
  closeRedis: vi.fn(),
  testRedisConnection: vi.fn(),
}));
```

### Queue (createWorker)

```typescript
// For worker tests — need to capture processor function
vi.mock('../../../src/config/queue.js', () => ({
  createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
}));

// For service tests — need queue.add
const { mockQueueAdd } = vi.hoisted(() => ({
  mockQueueAdd: vi.fn().mockResolvedValue({ id: 'job-1' }),
}));
vi.mock('../../../src/config/queue.js', () => ({
  getImageQueue: vi.fn().mockReturnValue({ add: mockQueueAdd }),
}));
```

### Supabase Admin

```typescript
// Storage disabled (mock path)
vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: null,
}));

// Storage enabled (Supabase path)
vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: { storage: { from: vi.fn() } },
}));
```

### Socket Emitter

```typescript
vi.mock('../../../src/utils/socket-emitter.js', () => ({
  emitToSession: vi.fn(),
}));
```

### Agent Guards

```typescript
vi.mock('../../../src/utils/agent-guards.js', () => ({
  formatAsyncToolResponse: vi.fn((toolName: string, jobId: string, estimatedSec?: number) =>
    JSON.stringify({
      status: 'started',
      jobId,
      message: `${toolName} job started (ID: ${jobId}).`,
      ...(estimatedSec !== undefined ? { estimatedDurationSec: estimatedSec } : {}),
    })
  ),
}));
```

---

## Pattern: vi.hoisted for mock references

When a mock function is needed inside a `vi.mock` factory, use `vi.hoisted`:

```typescript
const { mockRequestRender } = vi.hoisted(() => ({
  mockRequestRender: vi.fn(),
}));

vi.mock('../../../src/services/render.service.js', () => ({
  RenderService: vi.fn().mockImplementation(() => ({
    requestRender: mockRequestRender,
  })),
}));
```

**Why**: `vi.mock` factories are hoisted above `const` declarations. Without `vi.hoisted`, the mock ref would be in a temporal dead zone.

---

## Pattern: vi.doMock + resetModules (Workers)

Workers use top-level side effects on import. To get a fresh module per test:

```typescript
beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();

  vi.doMock('../../../src/utils/logger.js', () => ({
    Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })),
  }));
  vi.doMock('../../../src/config/queue.js', () => ({
    createWorker: vi.fn().mockReturnValue({ on: vi.fn(), close: vi.fn() }),
  }));
  vi.doMock('../../../src/config/env.js', () => ({
    isStorageEnabled: vi.fn().mockReturnValue(true),
    env: { SUPABASE_STORAGE_BUCKET: 'assets', REDIS_URL: 'redis://localhost:6379' },
  }));
  // ... other doMocks

  const mod = await import('../../../src/workers/image.worker.js');
  mod.startImageWorker();

  const { createWorker: cw } = await import('../../../src/config/queue.js');
  processJob = (cw as Mock).mock.calls[0][1] as typeof processJob;
});
```

**Key**: The processor function is extracted from `createWorker`'s first call's second argument.

---

## Pattern: Drizzle Chain Mock Helpers

For service tests that heavily use Drizzle query chains, extract helpers:

```typescript
import type { Mock } from 'vitest';
import { db } from '../../../src/db/index.js';

/** Mock db.select().from().where() to resolve with the given rows */
function mockSelectRows(...callRows: unknown[][]): void {
  for (const rows of callRows) {
    const mockWhere = vi.fn().mockResolvedValue(rows);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as Mock).mockReturnValueOnce({ from: mockFrom });
  }
}

/** Mock db.select().from().where().orderBy() */
function mockSelectWithOrderBy(rows: unknown[]): void {
  const mockOrderBy = vi.fn().mockResolvedValue(rows);
  const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  (db.select as Mock).mockReturnValue({ from: mockFrom });
}

/** Mock db.insert().values().returning() */
function mockInsertReturning(rows: unknown[]): Mock {
  const mockReturning = vi.fn().mockResolvedValue(rows);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  (db.insert as Mock).mockReturnValue({ values: mockValues });
  return mockValues;
}

/** Mock db.update().set().where().returning() */
function mockUpdateReturning(rows: unknown[]): void {
  const mockReturning = vi.fn().mockResolvedValue(rows);
  const mockUpdateWhere = vi.fn().mockReturnValue({ returning: mockReturning });
  const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  (db.update as Mock).mockReturnValue({ set: mockSet });
}
```

---

## Pattern: Schema Table Mocks

When a test file imports a schema just for Drizzle's type system:

```typescript
vi.mock('../../../src/db/schema/assets.schema.js', () => ({
  roomAssets: {},
}));

vi.mock('../../../src/db/schema/asset-variants.schema.js', () => ({
  assetVariants: { parentAssetId: 'parent_asset_id', variantType: 'variant_type' },
}));
```

Only mock the columns that are explicitly referenced in `eq()` or `and()` calls.
