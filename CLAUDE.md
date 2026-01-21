# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered renovation planning assistant monorepo with a Next.js frontend and Express.js backend. Uses Gemini AI via LangChain for intelligent renovation assistance, Socket.io for real-time communication, and Supabase for authentication.

## Commands

### Development
```bash
# Run both frontend and backend (from root)
npm run dev

# Run individually
npm run dev:frontend    # http://localhost:3001
npm run dev:backend     # http://localhost:3000

# Docker (full stack with PostgreSQL)
docker-compose up
```

### Backend Commands
```bash
cd backend
npm run dev              # Dev server with hot reload (tsx watch)
npm run build            # TypeScript compilation
npm run lint             # ESLint
npm run prep             # lint + build
npm test:unit            # Vitest with coverage
npm test:watch           # Vitest watch mode
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Run Drizzle migrations
npm run db:studio        # Drizzle Studio GUI
```

### Frontend Commands
```bash
cd frontend
npm run dev              # Dev server on port 3001
npm run build            # Next.js production build
npm run lint             # ESLint
npm run type-check       # TypeScript type checking (tsc --noEmit)
```

## Architecture

### Tech Stack
- **Frontend**: Next.js 15 (App Router), React 19, TanStack Query v5, Tailwind CSS, shadcn/ui, Supabase Auth
- **Backend**: Express.js (ESM), Drizzle ORM, PostgreSQL, Socket.io, LangChain + Gemini AI
- **Infrastructure**: Docker Compose, GitHub Actions → Google Cloud Run

### Key Directories
```
backend/src/
├── config/          # env.ts (Zod validation), gemini.ts (AI models), supabase.ts
├── controllers/     # Request handlers
├── db/              # Drizzle connection pool, schemas (sessions, rooms, products, contractors, messages)
├── middleware/      # auth.middleware.ts (Supabase token verification), errorHandler.ts
├── routes/          # health.routes.ts, session.routes.ts
├── services/        # Business logic (Phase 2+)
├── utils/           # logger.ts, shutdown-manager.ts, errors.ts
├── app.ts           # Express app setup
└── server.ts        # HTTP + Socket.io server startup

frontend/
├── app/             # Next.js App Router pages
├── components/ui/   # shadcn/ui components
├── components/providers/  # QueryProvider, ThemeProvider
└── lib/supabase/    # Supabase client
```

### Database Schema (Drizzle)
Six tables: `profiles`, `renovation_sessions`, `renovation_rooms`, `product_recommendations`, `contractor_recommendations`, `chat_messages`. Sessions have a phase flow: INTAKE → CHECKLIST → PLAN → RENDER → PAYMENT → COMPLETE → ITERATE.

### AI Integration
Four Gemini model configurations in `backend/src/config/gemini.ts`:
- `createChatModel()` - General conversation (temp 0.7)
- `createVisionModel()` - Image analysis (temp 0.5)
- `createStructuredModel()` - JSON output (temp 0.3)
- `createStreamingModel()` - Real-time streaming

### Health Endpoints
- `GET /health` - Basic liveness
- `GET /health/live` - Kubernetes liveness probe
- `GET /health/ready` - Readiness (checks database)
- `GET /health/status` - Detailed metrics

## Custom Skills

### `/plan` - Research-Driven Planning
Comprehensive planning skill following: Research → Plan → Track → Execute with TDD.

**Usage**: `/plan [topic]`

**Workflow**:
1. Research codebase + web for solutions (exports to `docs/research/`)
2. Create implementation plan with code snippets (exports to `docs/implementation plan/`)
3. Create progress tracker (exports to `docs/implementation plan/`)
4. Wait for approval
5. Execute with TDD, ensuring quality gates pass

**Example**: `/plan add real-time notifications`

See `.claude/skills/README.md` for full documentation.

## Frontend Hooks

### useChat Hook
Custom React hook for Socket.io chat communication.

**Location**: `frontend/hooks/useChat.ts`

**Usage**:
```typescript
import { useChat } from '@/hooks/useChat';

const ChatComponent = ({ sessionId }: { sessionId: string }) => {
  const { isConnected, messages, sendMessage, error } = useChat(sessionId);

  if (!isConnected) return <div>Connecting...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <button onClick={() => sendMessage('Hello!')}>
      Send Message
    </button>
  );
};
```

**Returns**:
- `isConnected: boolean` - WebSocket connection status
- `messages: Message[]` - Chat message history (future Phase 2+)
- `sendMessage: (content: string) => void` - Send message to server
- `error: string | null` - Connection or auth errors

**Features**:
- Automatic Supabase JWT authentication
- Session room joining
- Type-safe Socket.io events
- Automatic cleanup on unmount
- Reconnection handling (5 attempts, 1s delay)

## Development Notes

### Environment Variables
Backend requires: `NODE_ENV`, `PORT`, `DATABASE_URL`, `GOOGLE_API_KEY`. Optional: Supabase keys (Phase 8), Stripe keys (Phase 9). See `backend/src/config/env.ts` for Zod schema.

### Authentication
Currently optional (userId nullable in sessions for Phases 1-7). Auth middleware in `backend/src/middleware/auth.middleware.ts` verifies Supabase JWT tokens.

### ESM Modules
Backend uses ESM (`"type": "module"`). Internal imports must include `.js` extensions for compiled output compatibility.

### Graceful Shutdown
`backend/src/utils/shutdown-manager.ts` handles SIGTERM/SIGINT with per-resource cleanup and 10s global timeout.

---

# PART 3: DEVELOPMENT WORKFLOW

## Standard Operating Procedure

**ALL tasks follow**: `Problem → Research → Plan → Get Approval → TDD Implementation → Review`

---

## 1. Research-First Approach (MANDATORY)

Before implementing ANY solution:

1. **Codebase Research**: Search for existing patterns, similar implementations
2. **Internet Research**: Official docs (2025+), best practices, breaking changes
3. **First Principles**: Break down problem, identify 3-5 solution vectors, evaluate trade-offs

**Export to** `docs/Research/[TOPIC_NAME].md`:
```markdown
# [Topic Name] Research
**Date**: 2025-01-27

## Problem Statement
## Solution Vectors Evaluated
### Solution 1: [Name]
- Pros/Cons, Complexity, Cost, Time, Fit Score, Code snippet, Files to modify
## Recommended Approach
## Strategic Evaluation
- Goals Alignment, Economic Value, Implementation Feasibility
```

---

## 2. Bug Fixing Protocol (MANDATORY)

**NEVER run in circles. ALWAYS follow this:**

1. **STOP**: Don't immediately try to fix
2. **Research**: Use Task tool with `subagent_type='general-purpose'`, search docs, identify 3-5 solutions
3. **Document**: Export to `docs/Research/Bug_Fix_[BUG_NAME].md` with root cause analysis
4. **Plan** (if non-trivial): Write to `docs/06_Implementation-plans/`
5. **Progress Tracker**: Create `.claude/progress/Bug_Fix_[BUG_NAME]_PROGRESS.md`
6. **Execute**: Only now fix following the researched solution

---

## 3. Implementation Planning

### Step 1: Read Context
- `docs/03_Engines/`, `docs/04_Agent-Personas/`, `docs/05_SOPs/`

### Step 2: Create Implementation Plan
**Write to**: `docs/06_Implementation-plans/[FEATURE_NAME]_Implementation_Plan.md`

```markdown
# [Feature Name] Implementation Plan

## Overview
- Objective, Economic Value, Engines, Agent Personas

## Research Summary
- Selected Approach, Key Trade-offs, Dependencies

## Implementation Strategy
### Phase 1: [Name]
- Goal, Agent, Tools, Tasks, Test Specifications, Files to Create/Modify

## Success Metrics
- Technical (coverage ≥80%), Business (KPI impact)
```

### Step 3: Create Progress Tracker (MANDATORY)
**Write to**: `.claude/progress/[FEATURE_NAME]_PROGRESS.md`

```markdown
# [Feature Name] - Progress Tracker
**Status**: 🔴 0% Complete
**Last Updated**: YYYY-MM-DD

## To-Do List
### Phase 1: [Name] ⏸️
- [ ] Task 1.1
- [ ] Task 1.2

## Current Blockers
## Next Actions
```

**Update**: Check off `[x]` immediately, update status (🔴→🟡→🟢→✅), add blockers

### Step 4: Request Approval
Present plan to Ray. **DO NOT PROCEED until approved.**

---

## 4. TDD Implementation (MANDATORY)

**Workflow**: RED → GREEN → REFACTOR → QUALITY GATE → VERIFY

### TDD Cycle Example (Python)

```python
# 1. RED: Write failing test first
def test_generate_referral_code_returns_valid_format(service):
    code = service.generate_referral_code("user123")
    assert code.startswith("FABLE-")
    assert len(code) == 10

# 2. GREEN: Minimum code to pass
def generate_referral_code(self, user_id: str) -> str:
    return f"FABLE-{''.join(random.choices(string.ascii_uppercase + string.digits, k=4))}"

# 3. REFACTOR: Improve quality, tests still pass
# 4. QUALITY GATE: ruff check . --fix && mypy . && pytest --cov=src
```

**TDD Rules**:
- ❌ Never write production code without failing test first
- ✅ Write tests before implementation
- ✅ Run tests frequently, keep them fast (<100ms unit)
- ✅ Follow AAA pattern (Arrange-Act-Assert)
- ✅ Update progress tracker after each task

---

## 5. Review & Documentation

1. **Quality Verification**: All tests passing, coverage ≥80%, linter/type-check passing, no `any` types
2. **Update Documentation**: Implementation plan, API docs, architecture
3. **Update Progress Tracker**: Mark complete (✅ 100%), add completion summary

---

# PART 4: STANDARDS & QUALITY

## Core Mandatory Standards (NON-NEGOTIABLE)

---

## TypeScript Standards

### Type Safety (STRICT)
**NO `any` types** - Use domain types, DTOs, or type narrowing:

```typescript
// ❌ NEVER
const data: any = await db.query();

// ✅ ALWAYS
interface QueryResult { id: string; name: string; }
const data = await db.query() as unknown as QueryResult;
```

**Linter Rules**: `@typescript-eslint/no-explicit-any`: "error", `no-floating-promises`: "error", `eqeqeq`: "error"

**tsconfig.json**: `"strict": true`, `"noUncheckedIndexedAccess": true`

### Error Logging (MANDATORY)
**Use structured Logger, never `console.log`**:

```typescript
import { Logger } from "../utils/logger.js";
const log = new Logger({ serviceName: "MyService" });

log.info("User logged in", { userId, chatId });
log.error("Failed to save", error as Error, { conversationId, operation: "save" });
```

**MDC Pattern**: Include `userId`, `chatId`, `requestId`. **NEVER log secrets.**

### Pre-Commit Checklist (TypeScript)
```bash
npm run lint         # 0 errors
npm run type-check   # 0 errors
npm run test:run     # All pass
npm run test:coverage # ≥80%
```

---

## Python Standards

### Type Safety (STRICT)
**NO `Any` types** - Use Pydantic models, type hints:

```python
# ❌ NEVER
def process_data(data: Any) -> Any: ...

# ✅ ALWAYS
from pydantic import BaseModel
class QueryResult(BaseModel):
    id: str
    name: str
    price: float

def process_data(data: QueryResult) -> QueryResult: ...
```

**Pydantic**: Use for all data structures with validation
**Mypy**: `strict = true`, `disallow_untyped_defs = true`, `disallow_any_unimported = true`

### Error Logging (MANDATORY)
**Use structlog, never `print()`**:

```python
import structlog
logger = structlog.get_logger(__name__)

logger.info("user_logged_in", user_id=user_id, timestamp=datetime.now().isoformat())
logger.error("failed_to_save", exc_info=e, conversation_id=cid, operation="save")
```

**NEVER log secrets.** Use `exc_info=e` for exceptions.

### Ruff Configuration (Key Rules)
```toml
[tool.ruff]
target-version = "py311"
select = ["E", "W", "F", "I", "N", "UP", "ANN", "S", "B", "T20", "PT", "RUF"]
# T20: NO print() | ANN: ALL type hints | S: Security | B: Bugbear
```

### Pre-Commit Checklist (Python)
```bash
ruff check . --fix   # 0 errors
mypy .               # 0 errors
pytest               # All pass
pytest --cov=src --cov-fail-under=80
```

### Pytest Configuration
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = ["--strict-markers", "--cov=src", "--cov-fail-under=80"]
```

### Dependency Management (uv)
```bash
uv venv && source .venv/bin/activate && uv pip install -e ".[dev]"
```

---

## Git Commit Message Policy (MANDATORY)

**ALL commits MUST exclude Claude-related references**:

```bash
# ❌ NEVER include:
- "Generated with Claude Code", "Co-Authored-By: Claude", links to claude.com

# ✅ ALWAYS: Clean, professional Conventional Commits
git commit -m "feat: add token price collection

- Add CoinGeckoService with retry logic
- Add StorageService for GCS
- Add test suite (85% coverage)

Tests: All 24 passing
Quality gates: Lint ✓ Type-check ✓ Coverage 85%"
```

**Prefixes**: `feat:` | `fix:` | `refactor:` | `test:` | `docs:` | `chore:` | `perf:`

---

## Git Pipeline & Workflow (MANDATORY)

### Branch Strategy
```
main (production-ready only)
  ↑ merge when complete & tested
dev (Claude's working branch)
  ↑ optional for large features
feature/[name]
```

### Workflow Steps
1. **Start**: `git checkout dev && git pull origin dev`
2. **Complete Task**: TDD, update progress tracker
3. **Quality Gates** (MUST pass before commit):
   ```bash
   npm run lint && npm run type-check && npm run test && npm run test:coverage
   # Python: ruff check . && mypy . && pytest --cov=src --cov-fail-under=80
   ```
4. **Commit**: Conventional Commits, NO Claude attribution
5. **Push**: `git push origin dev`
6. **Merge to Main** (when feature complete): All tests passing, coverage ≥80%, user approves

### Commit Triggers
Claude MUST commit: After completing todo item, after feature/fix, before switching tasks, end of session

### When NOT to Commit
❌ Tests failing, linter errors, type errors, coverage <80%, broken state
