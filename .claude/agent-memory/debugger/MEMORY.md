# Debugger Agent Memory

## Common Error Patterns

### 1. Database Connection Failures (28P01)
- **Symptom**: 500 Internal Server Error on any API endpoint that queries the database
- **Root Cause**: Invalid DATABASE_URL credentials in `backend/.env`
- **Why it's confusing**: Backend starts successfully in dev mode (skips fatal DB errors), but every DB query fails at runtime
- **Location**: `backend/src/server.ts` lines 50-61 skip DB errors in dev mode
- **Fix**: Update DATABASE_URL password from Supabase Dashboard > Settings > Database
- **Code fix applied**: `session.controller.ts` now surfaces DB auth errors as 503 with actionable hint in dev mode

### 2. Supabase Pooler Username Parsing
- The connection string uses `postgres.PROJECT_REF` as username
- PostgreSQL error messages show just `user "postgres"` (pooler strips project ref)
- This can mislead debugging -- the issue is the password, not the username

## Key File Locations
- Session controller: `backend/src/controllers/session.controller.ts`
- Auth middleware: `backend/src/middleware/auth.middleware.ts`
- DB pool: `backend/src/db/index.ts`
- Env validation: `backend/src/config/env.ts`
- Supabase config: `backend/src/config/supabase.ts`
- Frontend API client: `frontend/lib/api.ts`

## Architecture Notes
- Auth middleware applies to ALL session routes via `router.use(authMiddleware)` in session.routes.ts
- `supabaseAdmin` is null when `isAuthEnabled()` returns false (missing SUPABASE_URL/keys)
- Controller uses raw `pool.query()` instead of Drizzle ORM to avoid PgBouncer prepared statement issues
- Session creation checks for profile existence before setting userId FK (gracefully handles missing profiles)

### 3. ChatService Mock Missing bindTools (ReAct Agent)
- **Symptom**: All 3 chat.service tests fail with `TypeError: this.model.bindTools is not a function`
- **Root Cause**: `ChatService` constructor calls `createReActAgent()` which calls `this.model.bindTools(renovationTools)`. The `createStreamingModel` mock lacked `bindTools`.
- **Full fix required**: (a) Add `bindTools` to model mock, (b) Mock `renovationTools`, `prompts`, `db`, `drizzle-orm`, `@langchain/langgraph`, `@langchain/langgraph/prebuilt`, (c) Use `vi.hoisted()` for mock graph object shared between `vi.mock` factory and tests, (d) Stream chunks must include `{ langgraph_node: 'call_model' }` metadata for the streaming branch to execute
- **Key insight**: `vi.mock` factories are hoisted -- module-level `const` variables are NOT initialized when the factory runs. Use `vi.hoisted()` to declare shared mock objects.
- **Location**: `backend/tests/unit/services/chat.service.test.ts`

## Key File Locations
- Chat service: `backend/src/services/chat.service.ts`
- Chat service tests: `backend/tests/unit/services/chat.service.test.ts`
- Renovation tools: `backend/src/tools/index.ts`
- Prompts config: `backend/src/config/prompts.ts`

### 4. pnpm Lockfile Desync (ERR_PNPM_OUTDATED_LOCKFILE)
- **Symptom**: `ERR_PNPM_OUTDATED_LOCKFILE Cannot install with "frozen-lockfile" because pnpm-lock.yaml is not up to date`
- **Root Cause**: Dependency added/removed from a workspace `package.json` without running `pnpm install` to regenerate the root `pnpm-lock.yaml`
- **Why it happens**: This project uses pnpm workspaces with a single lockfile at the root. `--frozen-lockfile` is the default in CI.
- **Fix**: Run `pnpm install` from the project root to sync the lockfile
- **Secondary issue**: A stale `frontend/package-lock.json` (npm lockfile) exists and is untracked. Should be deleted and added to `.gitignore`.
- **Key config**: Root `.npmrc` has `shamefully-hoist=true`. `pnpm-workspace.yaml` lists `backend` and `frontend`.

## Quality Gates
- `npx tsc --noEmit` for type-check
- `npm run lint` for ESLint
- `npm run test:unit` for 90 unit tests across 12 files (vitest)
- All pass as of 2026-02-09
