---
name: vitest-coverage
description: >
  Analyzes Vitest coverage gaps and generates tests using the project's specific mock patterns
  (vi.mock, vi.hoisted, vi.doMock/resetModules for workers, UnrecoverableError branching,
  isStorageEnabled()/isEmailEnabled() guards, Drizzle chain mocking, Zod validation error paths).
  Reads the V8 coverage report, identifies uncovered lines/branches, and writes tests that follow
  the exact conventions of the existing 37 test files. Use when coverage is below 80%, after adding
  new service/worker/tool code, or to close specific coverage gaps.
user-invocable: true
---

# /vitest-coverage

Coverage gap analysis and test generation for the renovation agent backend. Reads the V8 coverage output, maps uncovered lines to the source file, identifies which branches/paths are missing, and generates tests using the project's established mock patterns.

## When to Use

- Coverage dropped below 80% threshold after adding new code
- Adding tests for a specific file: `/vitest-coverage backend/src/services/asset.service.ts`
- After adding a new service, worker, or tool — to generate its test file
- Closing coverage gaps before a commit (quality gate requires 80% lines/functions/branches/statements)
- Auditing which files have the lowest coverage

## Invocation

```
/vitest-coverage [target]
```

**target** is optional. Can be:
- A file path: `backend/src/services/asset.service.ts` — analyze + generate tests for this file
- A directory: `backend/src/workers/` — analyze all files in the directory
- Omitted: run full coverage report and identify the top gaps

**Examples**:
```
/vitest-coverage                                        # Full report, find top gaps
/vitest-coverage backend/src/services/render.service.ts # Specific file
/vitest-coverage backend/src/workers/                   # All workers
```

## Workflow

### Step 1: Run Coverage Report

Run coverage and capture the output:

```bash
cd backend && npx vitest run --coverage 2>&1
```

The coverage config is in `backend/vitest.config.ts`:
- **Provider**: V8
- **Reporters**: text, json, html
- **Thresholds**: 80% for lines, functions, branches, statements
- **Includes**: `src/**/*.ts`
- **Excludes**: test files, `src/types/**`, `src/db/schema/**`, `src/server.ts`

### Step 2: Identify Gaps

From the text output, identify files below 80% coverage. For each:

1. Read the source file to understand its public API
2. Read the existing test file (if any) to see what's already covered
3. Map uncovered lines to specific code paths:
   - **Branches**: `if/else`, `switch`, ternary, `??`, `||`, `&&`
   - **Error paths**: `catch` blocks, validation failures, `throw` statements
   - **Guard clauses**: `isStorageEnabled()`, `isEmailEnabled()`, null checks
   - **Edge cases**: empty arrays, missing optional fields, boundary values

### Step 3: Generate Tests

Write tests following the project patterns documented in the companion files:
- [mock-patterns.md](./mock-patterns.md) — All vi.mock patterns used in the project
- [test-templates.md](./test-templates.md) — Templates for services, workers, tools, and validators

### Step 4: Verify

```bash
cd backend && npx vitest run --coverage 2>&1
```

Confirm:
- All new tests pass
- Coverage meets 80% threshold on all metrics
- No existing tests broken

## Coverage Architecture

### Directory Layout

```
backend/
  vitest.config.ts              # Coverage config (V8 provider, 80% thresholds)
  tests/unit/
    services/                   # Service tests (Drizzle chain mocking)
    workers/                    # Worker tests (vi.doMock + resetModules)
    tools/                      # Tool tests (vi.hoisted + tool.invoke)
    controllers/                # Controller tests (req/res mocking)
    validators/                 # Validator tests (Zod schema edge cases)
    config/                     # Config/infra tests (telemetry, queue)
    db/                         # DB schema tests (JSONB validation)
    middleware/                 # Middleware tests (auth, tracing)
    emails/                     # Email template tests
    utils/                      # Utility tests (AI tracing, logger, SQL)
```

### Common Uncovered Patterns

These patterns are frequently missed in initial test passes:

| Pattern | Example | How to Test |
|---------|---------|-------------|
| `isStorageEnabled()` false branch | Asset service mock path | Mock `isStorageEnabled` to return `false` |
| `isEmailEnabled()` false branch | Email worker skip | Mock `isEmailEnabled` to return `false` |
| `UnrecoverableError` vs `Error` | Worker error classification | Test with invalid data → `UnrecoverableError`, network error → `Error` |
| Zod validation failure | Job data missing required field | Pass incomplete data, assert `UnrecoverableError` |
| Drizzle chain returning empty | `db.select().from().where()` → `[]` | Mock chain to resolve `[]`, assert NotFoundError |
| Supabase storage errors | Upload/download failures | Mock `supabaseAdmin.storage.from().upload()` to reject |
| Socket.io event emission | `emitToSession()` calls | Mock `emitToSession`, assert called with correct args |
| `formatAsyncToolResponse` | Async tool results | Mock, verify JSON shape includes jobId and "Do NOT call again" |
| `vi.hoisted` for mock refs | Mocks used inside `vi.mock` factories | Use `vi.hoisted(() => ({ mockFn: vi.fn() }))` |

## Key References

| File | Purpose |
|------|---------|
| `backend/vitest.config.ts` | V8 coverage config, thresholds, includes/excludes |
| `backend/package.json` | `test:unit` = `vitest run --coverage` |
| `backend/tests/unit/` | All 37 existing test files (patterns to follow) |
| `backend/src/config/env.ts` | `isStorageEnabled()`, `isEmailEnabled()` guards |
| `backend/src/config/queue.ts` | `createWorker`, `JobTypes`, `WORKER_PROFILES` |
| `backend/src/utils/logger.js` | Logger mock pattern |
| `backend/src/utils/agent-guards.ts` | `formatAsyncToolResponse`, `ALLOWED_TOOLS` |

See companion files:
- [mock-patterns.md](./mock-patterns.md) — Every `vi.mock` pattern in the project
- [test-templates.md](./test-templates.md) — Copy-paste templates for each test category
