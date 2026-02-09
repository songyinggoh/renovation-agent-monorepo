# Testing Patterns

**Analysis Date:** 2026-02-09

## Test Framework

**Runner:**
- Vitest 3.0.5 (backend), 4.0.18 (frontend)
- Config: `backend/vitest.config.ts`, `frontend/vitest.config.ts`

**Assertion Library:**
- Vitest built-in assertions (expect)

**Run Commands:**
```bash
# Backend
cd backend
npm run test:unit              # Run all unit tests
npm run test:watch             # Watch mode
npm run test:unit -- --coverage  # Coverage report
npm run test:integration       # Integration tests (separate config)

# Frontend
cd frontend
npm test                       # Run all tests
npm run test:watch             # Watch mode
npm run test:ui                # Vitest UI
```

## Test File Organization

**Location:**
- Backend: `backend/tests/` directory (separate from source)
  - `tests/unit/` - Unit tests (services, controllers, tools)
  - `tests/integration/` - Integration tests (socket, API)
- Frontend: Co-located pattern expected (not yet implemented extensively)

**Naming:**
- Pattern: `*.test.ts` suffix
- Mirrors source structure: `backend/src/services/message.service.ts` → `backend/tests/unit/services/message.service.test.ts`

**Structure:**
```
backend/tests/
├── unit/
│   ├── controllers/
│   │   └── message.controller.test.ts
│   ├── services/
│   │   ├── message.service.test.ts
│   │   ├── chat.service.test.ts
│   │   ├── checkpointer.service.test.ts
│   │   ├── product.service.test.ts
│   │   ├── room.service.test.ts
│   │   └── style.service.test.ts
│   └── tools/
│       ├── get-style-examples.tool.test.ts
│       └── save-checklist-state.tool.test.ts
└── integration/
    └── socket.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { MessageService } from '../../../src/services/message.service.js';

// Mock dependencies at top level
vi.mock('../../../src/db/index.js', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

// Mock logger to suppress logs during tests
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('MessageService', () => {
  let messageService: MessageService;

  beforeEach(() => {
    messageService = new MessageService();
    vi.clearAllMocks();
  });

  describe('saveMessage', () => {
    it('should save a message and return the saved record', async () => {
      // Test implementation
    });

    it('should throw error if no record is returned', async () => {
      // Test implementation
    });
  });
});
```

**Patterns:**
- One `describe` block per class/module
- Nested `describe` blocks for methods
- `beforeEach` to reset state and clear mocks
- Descriptive test names: `'should [expected behavior] when [condition]'`
- AAA pattern: Arrange → Act → Assert

## Mocking

**Framework:** Vitest's `vi.mock()` and `vi.fn()`

**Patterns:**
```typescript
// Mock entire module
vi.mock('../../../src/db/index.js', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

// Mock chained methods (Drizzle query builder pattern)
const mockReturning = vi.fn().mockResolvedValue([mockSavedMessage]);
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
(db.insert as Mock).mockReturnValue({ values: mockValues });

// Mock async functions
const mockLimit = vi.fn().mockResolvedValue(mockMessages);
const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });

// Mock logger (always suppress in tests)
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));
```

**What to Mock:**
- Database connections (Drizzle ORM)
- External API clients (Gemini AI, Supabase)
- Logger (always mock to suppress console output)
- Socket.io connections (for integration tests)
- File system operations

**What NOT to Mock:**
- Pure utility functions (test them directly)
- Constants and type definitions
- Simple data transformations

## Fixtures and Factories

**Test Data:**
```typescript
// Inline fixtures in test files
const mockMessage = {
  sessionId: 'test-session-id',
  userId: null,
  role: 'user',
  content: 'Hello, world!',
  type: 'text',
};

const mockSavedMessage = {
  id: 'generated-id',
  ...mockMessage,
  createdAt: new Date(),
};
```

**Location:**
- Currently inline in test files (no dedicated fixtures directory yet)
- Pattern: Define mock data at top of `describe` block or within `it` block for test-specific data

**Recommendation for future:**
- Create `backend/tests/fixtures/` directory for shared test data
- Use factory pattern for complex objects (e.g., `createMockSession()`, `createMockMessage()`)

## Coverage

**Requirements:** 80% coverage threshold (lines, functions, branches, statements)

**View Coverage:**
```bash
cd backend
npm run test:unit -- --coverage

# Output formats: text (console), json, html
# HTML report: backend/coverage/index.html
```

**Configuration (backend/vitest.config.ts):**
```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  include: ['src/**/*.ts'],
  exclude: [
    'src/**/*.test.ts',
    'src/types/**',
    'src/db/schema/**',
    'src/server.ts', // Exclude main server file from coverage
  ],
  all: true,
  lines: 80,
  functions: 80,
  branches: 80,
  statements: 80,
}
```

**Exclusions:**
- Test files (`*.test.ts`)
- Type definitions (`src/types/**`)
- Database schemas (`src/db/schema/**`) - Already type-safe via Drizzle
- Server bootstrap (`src/server.ts`) - Integration tested separately

## Test Types

**Unit Tests:**
- Scope: Individual functions, classes, or modules in isolation
- Approach: Mock all dependencies (database, external APIs, logger)
- Example: `backend/tests/unit/services/message.service.test.ts`
  - Tests saveMessage, getMessageHistory, toLangChainMessages methods
  - Mocks database (Drizzle ORM) and logger
  - 147 lines, 3 describe blocks, 7 test cases

**Integration Tests:**
- Scope: Multiple modules working together (e.g., Socket.io + ChatService + Database)
- Approach: Use testcontainers for real PostgreSQL, mock only external APIs (Gemini)
- Example: `backend/tests/integration/socket.test.ts`
  - Tests WebSocket connections, authentication, message flow
  - Uses socket.io-client and testcontainers

**E2E Tests:**
- Framework: Not yet implemented
- Recommended: Playwright or Cypress (for frontend → backend → database flow)

## Common Patterns

**Async Testing:**
```typescript
it('should fetch and return messages in chronological order', async () => {
  // Setup mocks
  const mockMessages = [...];
  const mockLimit = vi.fn().mockResolvedValue(mockMessages);
  // ...

  // Act
  const result = await messageService.getMessageHistory('test-session-id', 50);

  // Assert
  expect(result).toEqual([...]);
});
```

**Error Testing:**
```typescript
it('should throw error if no record is returned', async () => {
  // Setup
  const mockMessage = { ... };
  const mockReturning = vi.fn().mockResolvedValue([]);
  // ...

  // Act & Assert
  await expect(messageService.saveMessage(mockMessage)).rejects.toThrow(
    'Failed to save message: No record returned'
  );
});
```

**Mock Verification:**
```typescript
it('should save a message and return the saved record', async () => {
  // Arrange
  const mockMessage = { ... };
  const mockReturning = vi.fn().mockResolvedValue([mockSavedMessage]);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  (db.insert as Mock).mockReturnValue({ values: mockValues });

  // Act
  const result = await messageService.saveMessage(mockMessage);

  // Assert
  expect(db.insert).toHaveBeenCalledWith(chatMessages);
  expect(mockValues).toHaveBeenCalledWith(mockMessage);
  expect(mockReturning).toHaveBeenCalled();
  expect(result).toEqual(mockSavedMessage);
});
```

**Data Transformation Testing:**
```typescript
it('should convert database messages to LangChain format', () => {
  const mockMessages = [
    { id: '1', role: 'user', content: 'Hello', ... },
    { id: '2', role: 'assistant', content: 'Hi there!', ... },
  ];

  const result = messageService.toLangChainMessages(mockMessages);

  expect(result).toEqual([
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ]);
});
```

## Testing Best Practices (from CLAUDE.md)

**TDD Workflow:**
1. RED: Write failing test first
2. GREEN: Write minimum code to pass
3. REFACTOR: Improve code quality while tests still pass
4. QUALITY GATE: Run linter, type-check, and coverage before commit

**Pre-Commit Checklist:**
```bash
# Backend
npm run lint         # 0 errors
npm run build        # TypeScript compilation
npm run test:unit    # All pass
npm run test:unit -- --coverage  # ≥80%

# Frontend
npm run lint         # 0 errors
npm run type-check   # 0 errors
npm test             # All pass
```

**Test Guidelines:**
- Write tests before implementation (TDD)
- Keep tests fast (<100ms for unit tests)
- Mock external dependencies (database, APIs, logger)
- Use descriptive test names
- Test happy path AND error cases
- Verify mock call counts and arguments

---

*Testing analysis: 2026-02-09*
