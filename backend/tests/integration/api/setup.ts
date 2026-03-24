import { vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

/**
 * Integration test setup — mock external dependencies (auth, DB, logger)
 * so we can test HTTP routes end-to-end without a live database.
 *
 * IMPORTANT: These vi.mock() calls must be at the top-level of the setup module
 * so they are hoisted before any imports in the test files.
 */

// ── Auth middleware: bypass Supabase, inject a test user ──
vi.mock('../../../src/middleware/auth.middleware.js', () => ({
  verifyToken: vi.fn(),
  authMiddleware: vi.fn((_req: Request, _res: Response, next: NextFunction) => {
    _req.user = {
      id: 'test-user-id',
      email: 'test@example.com',
    } as Request['user'];
    next();
  }),
  optionalAuthMiddleware: vi.fn((_req: Request, _res: Response, next: NextFunction) => {
    _req.user = {
      id: 'test-user-id',
      email: 'test@example.com',
    } as Request['user'];
    next();
  }),
}));

// ── Logger: suppress output during tests ──
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// ── Rate limiter: disable so it doesn't need a PG connection ──
vi.mock('../../../src/middleware/rate-limit.middleware.js', () => ({
  apiLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  chatLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  authLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
  checkoutLimiter: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// ── Database mock ──
// mockPoolQuery: for controllers that call pool.query directly
// mockDbResolve: for controllers that use Drizzle's chainable db.select()/db.insert()
const mockPoolQuery = vi.fn();
const mockDbResolve = vi.fn().mockResolvedValue([]);

// Mock client returned by pool.connect()
const mockClientQuery = vi.fn().mockResolvedValue({ rows: [{ current_time: new Date() }] });
const mockClientRelease = vi.fn();
const mockClient = {
  query: mockClientQuery,
  release: mockClientRelease,
};

const mockPoolConnect = vi.fn().mockResolvedValue(mockClient);

function createDrizzleChain() {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'insert', 'values', 'returning', 'update', 'set'];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  // Make the chain thenable so `await db.select().from()...` resolves via mockDbResolve
  chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    mockDbResolve().then(resolve, reject);
  return chain;
}

vi.mock('../../../src/db/index.js', () => ({
  db: createDrizzleChain(),
  pool: {
    query: mockPoolQuery,
    connect: mockPoolConnect,
    totalCount: 5,
    idleCount: 3,
    waitingCount: 0,
  },
  testConnection: vi.fn().mockResolvedValue(undefined),
  closeConnection: vi.fn().mockResolvedValue(undefined),
  getPoolStats: vi.fn().mockReturnValue({ total: 5, idle: 3, waiting: 0 }),
  schema: {},
}));

// ── Env config: provide test defaults ──
vi.mock('../../../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    FRONTEND_URL: 'http://localhost:3001',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    GOOGLE_API_KEY: 'test-key',
    LOG_LEVEL: 'error',
  },
  isAuthEnabled: vi.fn().mockReturnValue(false),
  isPaymentsEnabled: vi.fn().mockReturnValue(false),
  isStorageEnabled: vi.fn().mockReturnValue(false),
}));

// ── Ownership middleware: pass through for tests ──
vi.mock('../../../src/middleware/ownership.middleware.js', () => ({
  verifySessionOwnership: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
  verifyRoomOwnership: vi.fn((_req: Request, _res: Response, next: NextFunction) => next()),
}));

// ── Supabase config: no-op ──
vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: null,
}));

// ── Redis: no connection in integration tests ──
vi.mock('../../../src/config/redis.js', () => ({
  redis: { ping: vi.fn().mockResolvedValue('PONG'), on: vi.fn(), quit: vi.fn(), disconnect: vi.fn() },
  default: { ping: vi.fn().mockResolvedValue('PONG'), on: vi.fn(), quit: vi.fn(), disconnect: vi.fn() },
  testRedisConnection: vi.fn().mockResolvedValue(true),
  connectRedis: vi.fn().mockResolvedValue(undefined),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}));

// ── Sentry: no-op in integration tests ──
vi.mock('../../../src/config/sentry.js', () => ({
  initSentry: vi.fn(),
  isSentryEnabled: vi.fn().mockReturnValue(false),
  Sentry: { init: vi.fn(), setupExpressErrorHandler: vi.fn() },
}));

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  setupExpressErrorHandler: vi.fn(),
  startSpan: vi.fn((_opts: unknown, fn: () => unknown) => fn()),
  captureException: vi.fn(),
}));

// ── BullMQ / Queue: no Redis in integration tests ──
vi.mock('../../../src/config/queue.js', () => ({
  connection: {},
  getImageQueue: vi.fn(() => ({ on: vi.fn() })),
  getEmailQueue: vi.fn(() => ({ on: vi.fn() })),
  getDocQueue: vi.fn(() => ({ on: vi.fn() })),
  getRenderQueue: vi.fn(() => ({ on: vi.fn() })),
  createWorker: vi.fn(),
  closeQueues: vi.fn().mockResolvedValue(undefined),
  WORKER_PROFILES: {},
  withTimeout: vi.fn((p: Promise<unknown>) => p),
}));

vi.mock('../../../src/config/dead-letter.js', () => ({
  getDLQ: vi.fn(() => ({ on: vi.fn() })),
  moveToDeadLetter: vi.fn().mockResolvedValue(undefined),
  closeDLQ: vi.fn().mockResolvedValue(undefined),
}));

// ── Bull Board: no-op adapters ──
vi.mock('@bull-board/api', () => ({
  createBullBoard: vi.fn(),
}));
vi.mock('@bull-board/api/bullMQAdapter', () => ({
  BullMQAdapter: vi.fn(),
}));
vi.mock('@bull-board/express', () => ({
  ExpressAdapter: vi.fn().mockImplementation(() => ({
    setBasePath: vi.fn(),
    getRouter: vi.fn(() => (_req: Request, _res: Response, next: NextFunction) => next()),
  })),
}));

export { mockPoolQuery, mockDbResolve, mockPoolConnect, mockClientQuery };

/**
 * Helper: import createApp lazily (after mocks are set up)
 */
export async function getApp() {
  const { createApp } = await import('../../../src/app.js');
  return createApp();
}
