# Testing Patterns

**Analysis Date:** 2026-03-01

## Test Framework

**Runner:**
- Vitest 3.0.5 (backend) / 4.0.18 (frontend)
- Backend config: `backend/vitest.config.ts`
- Frontend config: `frontend/vitest.config.ts`
- Integration config: `backend/vitest.integration.config.ts`
- AI regression config: `backend/vitest.ai-regression.config.ts`

**Assertion Library:**
- Vitest built-in (`expect`) with globals enabled
- Frontend also uses `@testing-library/react` (`render`, `renderHook`, `act`, `waitFor`)

**Run Commands:**
```bash
# Backend
cd backend
pnpm test:unit          # Run unit tests with coverage
pnpm test:watch         # Watch mode
pnpm test:integration   # Integration tests (requires Docker/Testcontainers)

# Frontend
cd frontend
pnpm test:unit          # Run unit tests with coverage

# Root (all)
pnpm test:unit          # Runs backend + frontend unit tests

# E2E
pnpm test:e2e           # Playwright E2E tests (requires running services)
```

## Test File Organization

**Backend Location:**
- Unit tests: `backend/tests/unit/` (mirrors `src/` directory structure)
- Integration tests: `backend/tests/integration/` (separate directory)
- AI regression tests: `backend/tests/ai-regression/`

**Frontend Location:**
- All tests: `frontend/__tests__/` (separate from source)
- Subdirs mirror component/hook paths: `__tests__/components/chat/`, `__tests__/hooks/`

**Naming:**
- Backend: `{source-file-name}.test.ts` (e.g., `chat.service.test.ts`)
- Frontend: `{source-file-name}.test.ts` or `.test.tsx` (e.g., `useChat.test.ts`, `chat-input.test.tsx`)

**Structure:**
```
backend/tests/
├── unit/
│   ├── config/           # env, gemini, queue, telemetry tests
│   ├── controllers/      # HTTP controller tests
│   ├── db/               # JSONB schema tests
│   ├── dev-agents/       # Dev-agent tests
│   ├── emails/           # Email template tests
│   ├── middleware/       # Auth, ownership, rate-limit, tracing tests
│   ├── services/         # Business logic tests (11 service test files)
│   ├── tools/            # LangGraph tool tests (7 tool test files)
│   ├── utils/            # Logger, shutdown, guards, tracing tests
│   ├── validators/       # Socket, job validator tests
│   └── workers/          # Worker processor tests (4 worker test files)
├── integration/
│   ├── api/              # REST endpoint integration tests (5 files)
│   └── socket.test.ts    # Socket.io integration test
└── ai-regression/
    └── prompt-smoke.test.ts  # AI output regression test

frontend/__tests__/
├── components/
│   └── chat/             # Chat component tests (5 files)
├── hooks/                # Custom hook tests (4 files)
└── setup.ts              # Test environment setup (jsdom)
```

## Test Structure

**Suite Organization (backend):**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('ChatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processMessage', () => {
    it('should save user message before processing', async () => {
      // Arrange
      const service = new ChatService();
      const callback = { onToken: vi.fn(), onComplete: vi.fn(), onError: vi.fn() };

      // Act
      await service.processMessage('session-1', 'Hello', callback);

      // Assert
      expect(mockSaveMessage).toHaveBeenCalledWith(expect.objectContaining({
        role: 'user',
        content: 'Hello',
      }));
    });
  });
});
```

**Suite Organization (frontend hooks):**
```typescript
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChat } from '@/hooks/useChat';

describe('useChat Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.connected = false;
    mockFetchWithAuth.mockResolvedValue({ messages: [] });
  });

  describe('Initialization', () => {
    it('should not connect without sessionId', () => {
      const { result } = renderHook(() => useChat(''));
      expect(result.current.isConnected).toBe(false);
    });
  });
});
```

**Patterns:**
- Use `describe` blocks to group by feature/method
- Use `beforeEach` with `vi.clearAllMocks()` to reset state
- Follow AAA pattern (Arrange-Act-Assert) in each test
- Use `vi.fn()` for mock functions, `vi.mock()` for module mocking

## Mocking

**Framework:** Vitest built-in (`vi.mock`, `vi.fn`, `vi.spyOn`)

**Module Mocking Pattern (backend):**
```typescript
// Mock entire module before imports
vi.mock('../../../src/services/message.service.js', () => ({
  MessageService: vi.fn().mockImplementation(() => ({
    saveMessage: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    getRecentMessages: vi.fn().mockResolvedValue([]),
    getMessageHistory: vi.fn().mockResolvedValue([]),
  })),
}));

// Mock database with chained query builder
vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ phase: 'INTAKE' }]),
        }),
      }),
    }),
  },
}));

// Mock Redis
vi.mock('../../../src/config/redis.js', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), status: 'ready' },
}));
```

**Module Mocking Pattern (frontend):**
```typescript
// Mock Socket.io client
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
};
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// Mock Supabase
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: { getSession: vi.fn() },
  })),
}));

// Helper to get mock handler by event name
function getMockHandler<T>(eventName: string): T | undefined {
  const calls = mockSocket.on.mock.calls as Array<[string, T]>;
  return calls.find((call) => call[0] === eventName)?.[1];
}
```

**What to Mock:**
- External services (Gemini AI, Supabase, Redis, Resend, S3/storage)
- Database queries (mock `db` from `../db/index.js`)
- Socket.io client/server
- LangChain/LangGraph internals (model, tools, checkpointer)
- Environment variables (mock `../config/env.js`)
- Logger (mock to suppress output in tests)
- OTel tracing functions (mock to no-op)

**What NOT to Mock:**
- Zod schemas (test actual validation logic)
- Error classes (test actual error hierarchy)
- Utility functions (test actual logic)
- Business logic within the service being tested

## Fixtures and Factories

**Test Data Pattern:**
```typescript
// Inline test data (most common pattern in this codebase)
const mockSession = { id: 'session-123', phase: 'INTAKE', userId: null };
const mockMessage = {
  id: 'msg-1',
  sessionId: 'session-123',
  role: 'user' as const,
  content: 'Hello',
  type: 'text',
};

// Mock response objects
const mockFetchWithAuth = vi.fn().mockResolvedValue({ messages: [] });
```

**Location:**
- No shared fixtures directory -- test data is defined inline in each test file
- Frontend test setup: `frontend/__tests__/setup.ts` (jsdom environment config)
- No factory pattern (e.g., FactoryBot) -- data is simple enough for inline construction

## Coverage

**Backend Thresholds (enforced in `backend/vitest.config.ts`):**
```
Lines:       50%
Functions:   70%
Branches:    70%
Statements:  50%
```

**Frontend Thresholds (enforced in `frontend/vitest.config.ts`):**
```
Lines:       30%
Functions:   20%
Branches:    20%
Statements:  30%
```

**Codecov Targets (enforced in `codecov.yml`):**
```
Project:     80%
Patch:       80%
```

**Coverage Exclusions (backend):**
- `src/**/*.test.ts` - Test files themselves
- `src/types/**` - Type-only files
- `src/db/schema/**` - Schema definitions
- `src/server.ts` - Main server file (integration tested)

**Coverage Exclusions (frontend):**
- `components/ui/**` - shadcn/ui base components (third-party)
- `**/*.d.ts` - Type declarations

**View Coverage:**
```bash
cd backend && pnpm test:unit   # Coverage report in backend/coverage/
cd frontend && pnpm test:unit  # Coverage report in frontend/coverage/
```

## Test Types

**Unit Tests:**
- Scope: Individual functions, classes, and modules in isolation
- Mocking: Heavy mocking of external dependencies (DB, Redis, AI, file system)
- Location: `backend/tests/unit/`, `frontend/__tests__/`
- Config: `backend/vitest.config.ts` (environment: node), `frontend/vitest.config.ts` (environment: jsdom)
- Count: ~60 backend test files, ~10 frontend test files

**Integration Tests:**
- Scope: Full HTTP request/response cycle against real or containerized dependencies
- Mocking: Minimal -- uses real PostgreSQL via Testcontainers
- Location: `backend/tests/integration/`
- Config: `backend/vitest.integration.config.ts` (sequential, longer timeouts)
- CI: `.github/workflows/integration-tests.yml` (triggered on backend changes)
- Files: `api/health.test.ts`, `api/sessions.test.ts`, `api/assets.test.ts`, `api/products.test.ts`, `api/styles.test.ts`, `socket.test.ts`

**E2E Tests:**
- Framework: Playwright
- Location: `e2e/` (root-level directory)
- CI: Part of `quality-gates.yml` (runs after backend + frontend quality pass)
- Requires: Running backend + frontend + PostgreSQL

**AI Regression Tests:**
- Scope: Validates AI model outputs against expected patterns
- Location: `backend/tests/ai-regression/prompt-smoke.test.ts`
- Config: `backend/vitest.ai-regression.config.ts`
- CI: `.github/workflows/ai-regression.yml` (manual/scheduled)

**Load Tests:**
- Framework: k6
- Location: `backend/load-tests/` (`health-check.k6.js`, `chat-flow.k6.js`)
- Run: `pnpm test:load`

## Common Patterns

**Async Testing:**
```typescript
it('should process message', async () => {
  const result = await service.processMessage('session-1', 'Hello', callback);
  expect(callback.onComplete).toHaveBeenCalledWith(expect.any(String));
});
```

**Error Testing:**
```typescript
it('should throw NotFoundError for missing session', async () => {
  mockDb.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    }),
  });

  await expect(service.getSession('nonexistent'))
    .rejects.toThrow(NotFoundError);
});
```

**Hook Testing (frontend):**
```typescript
it('should update connection state', async () => {
  const { result } = renderHook(() => useChat('session-123'));

  // Simulate socket connect event
  const connectHandler = getMockHandler<() => void>('connect');
  act(() => connectHandler?.());

  await waitFor(() => {
    expect(result.current.isConnected).toBe(true);
  });
});
```

**Zod Validation Testing:**
```typescript
it('should reject message exceeding max length', () => {
  const result = chatUserMessageSchema.safeParse({
    sessionId: 'valid-uuid',
    content: 'x'.repeat(10001),
  });
  expect(result.success).toBe(false);
});
```

## CI Test Pipeline

**Quality Gates (`quality-gates.yml`):**
1. Backend: lint -> build -> unit tests with coverage -> schema drift check
2. Frontend: lint -> type-check -> unit tests with coverage -> production build
3. Shared-types contract: build shared-types -> verify backend compiles -> verify frontend compiles -> unused export check
4. E2E: Playwright tests (runs after backend + frontend pass, needs PostgreSQL)

**Integration Tests (`integration-tests.yml`):**
- Triggered on PR/push to main when backend or shared-types change
- Uses Testcontainers for PostgreSQL
- 15-minute timeout

**Coverage Upload:**
- Both backend and frontend upload to Codecov via `codecov/codecov-action@v5`
- Coverage flags: `backend`, `frontend` (separate tracking)
- Carryforward enabled (missing uploads don't break coverage)

---

*Testing analysis: 2026-03-01*
