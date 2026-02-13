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
}));

// ── Database mock ──
// mockPoolQuery: for controllers that call pool.query directly
// mockDbResolve: for controllers that use Drizzle's chainable db.select()/db.insert()
const mockPoolQuery = vi.fn();
const mockDbResolve = vi.fn().mockResolvedValue([]);

function createDrizzleChain() {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'from', 'where', 'orderBy', 'limit', 'insert', 'values', 'returning'];
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
    connect: vi.fn(),
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

export { mockPoolQuery, mockDbResolve };

/**
 * Helper: import createApp lazily (after mocks are set up)
 */
export async function getApp() {
  const { createApp } = await import('../../../src/app.js');
  return createApp();
}
