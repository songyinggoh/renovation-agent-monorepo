# Migration Safety Agent — Design Document

**Date**: 2026-02-20
**Status**: Approved
**Approach**: Hybrid (deterministic scripts + Claude agent)

## Problem Statement

The CI pipeline runs `pnpm db:migrate` against production with no dry-run, no rollback, and no approval gate. The migration history already has complexity: drizzle-kit managed 0000-0007 (with two no-ops at 0004 and 0007), plus 6 archived manual migrations. Phase 4+ will add pgvector, audit logs, and other extensions that make unreviewed migrations dangerous.

## Goals

1. **Never run a destructive migration against production without human approval**
2. **Detect unsafe DDL patterns before they reach main branch**
3. **Auto-generate and validate rollback scripts for every migration**
4. **Catch extension-specific risks** (pgvector dimension changes, superuser requirements)
5. **Provide intelligent semantic review** for issues scripts can't detect

## Architecture

```
Developer writes migration
        │
        ▼
┌─────────────────────┐
│  Local pre-commit    │  lint-staged on backend/drizzle/*.sql
│  (warn mode)         │  Non-blocking — prints risk assessment
└─────────┬───────────┘
          │ git push
          ▼
┌─────────────────────┐
│  PR: quality-gates   │  New "migration-safety" job
│  ├─ analyze-migration│  Classify DDL risk (SAFE/WARNING/DESTRUCTIVE)
│  ├─ generate-rollback│  Create backend/drizzle/rollbacks/NNNN_rollback.sql
│  └─ validate-rollback│  UP + DOWN roundtrip against test Postgres
│                      │  BLOCKS MERGE if DESTRUCTIVE without override
└─────────┬───────────┘
          │ merge to main
          ▼
┌─────────────────────┐
│  Deploy: backend-    │  environment: production (required reviewers)
│  deploy.yml          │
│  ├─ dry-run diff     │  Shows exact SQL that would run
│  ├─ human approval   │  GitHub environment protection rule
│  └─ execute migrate  │  Only after approval
└─────────────────────┘
          │
          ▼
┌─────────────────────┐
│  Claude Agent        │  On-demand / code-review
│  (migration-safety)  │  Semantic analysis scripts can't do
└─────────────────────┘
```

## Section 1: Migration Analysis Scripts

**Location**: `backend/scripts/migration-safety/`

### `analyze-migration.ts`

Reads `.sql` files and classifies each statement into risk tiers:

| Tier | Operations | CI Behavior |
|------|-----------|-------------|
| **SAFE** | `CREATE TABLE`, `CREATE INDEX`, `ADD COLUMN` (nullable), `COMMENT ON`, `CREATE INDEX CONCURRENTLY` | Pass |
| **WARNING** | `ADD COLUMN ... NOT NULL` (needs DEFAULT), `ALTER COLUMN`, `CREATE UNIQUE INDEX`, `CREATE EXTENSION` | Pass with annotation |
| **DESTRUCTIVE** | `DROP TABLE`, `DROP COLUMN`, `ALTER TYPE` (rewrite), `DROP INDEX`, `TRUNCATE`, `DROP EXTENSION`, `ALTER EXTENSION` | **Block merge** |

**Override mechanism**: A `-- migration-safety:allow-destructive` comment in the SQL file converts DESTRUCTIVE to WARNING. Forces developers to acknowledge the risk explicitly.

**Extension awareness**:
- `CREATE EXTENSION` flagged as WARNING (may require superuser)
- `DROP EXTENSION` flagged as DESTRUCTIVE (cascades to dependent columns/indexes)
- `ALTER EXTENSION` flagged as DESTRUCTIVE (can break dependent objects)
- pgvector-specific: dimension changes in `vector(N)` columns flagged as DESTRUCTIVE (silent truncation risk, index rebuild required)

**Output**: Structured JSON report to stdout:
```json
{
  "file": "0008_add_embeddings.sql",
  "riskLevel": "WARNING",
  "statements": [
    { "line": 1, "sql": "CREATE EXTENSION IF NOT EXISTS vector", "risk": "WARNING", "reason": "Extension creation may require superuser privileges" }
  ],
  "warnings": ["CREATE EXTENSION vector — verify target host supports this without superuser"],
  "blockers": []
}
```

### `generate-rollback.ts`

Parses an UP migration and produces inverse DDL:

| UP Statement | DOWN Statement |
|-------------|---------------|
| `CREATE TABLE x (...)` | `DROP TABLE IF EXISTS x` |
| `ALTER TABLE x ADD COLUMN y ...` | `ALTER TABLE x DROP COLUMN IF EXISTS y` |
| `CREATE INDEX idx ON ...` | `DROP INDEX IF EXISTS idx` |
| `ALTER TABLE x ADD CONSTRAINT c ...` | `ALTER TABLE x DROP CONSTRAINT IF EXISTS c` |
| `CREATE EXTENSION ext` | `DROP EXTENSION IF EXISTS ext` |
| `COMMENT ON ...` | *(no-op, skip)* |

**Output location**: `backend/drizzle/rollbacks/NNNN_rollback.sql`

**Non-reversible operations**: When a statement can't be auto-reversed (data migrations, `ALTER TYPE` with data conversion, `INSERT`/`UPDATE`/`DELETE`), the rollback file includes:
```sql
-- MANUAL ROLLBACK REQUIRED: Cannot auto-reverse ALTER TYPE on column x.y
-- Original: ALTER COLUMN y TYPE vector(768)
-- Action needed: [describe what manual intervention is required]
```

### `validate-rollback.ts`

Validates rollback correctness in CI:

1. Apply all existing migrations (0000 through N-1) to a clean Postgres container
2. Capture baseline schema via `pg_dump --schema-only`
3. Apply the new UP migration (N)
4. Apply the generated DOWN rollback (N)
5. Capture post-rollback schema via `pg_dump --schema-only`
6. Diff baseline vs post-rollback — must be identical
7. Fail CI if diff is non-empty (rollback didn't cleanly reverse)

Skips validation if rollback contains `-- MANUAL ROLLBACK REQUIRED` markers (those need human review).

## Section 2: CI Pipeline Changes

### `quality-gates.yml` — New migration-safety job

```yaml
migration-safety:
  name: Migration Safety
  runs-on: ubuntu-latest
  if: # only when migration files changed
  services:
    postgres: # same as e2e-tests job
  steps:
    - Checkout + setup pnpm/node
    - Detect new migration files (git diff vs main)
    - Run analyze-migration.ts on each new file
    - Run generate-rollback.ts for each new file
    - Run validate-rollback.ts against Postgres service
    - Post risk report as step summary
    - Fail if any DESTRUCTIVE without override
```

Runs in parallel with backend-quality and frontend-quality. Does NOT block non-migration PRs (conditional on file paths).

### `backend-deploy.yml` — Production gate

Replace current `run-migrations` job:

```yaml
migration-dry-run:
  name: Migration Dry Run
  needs: build-and-push
  steps:
    - Detect pending migrations (compare drizzle journal vs production)
    - Output SQL diff as step summary
    - Skip if no pending migrations

run-migrations:
  name: Run Database Migrations
  needs: migration-dry-run
  environment: production  # <-- GitHub protection rule
  steps:
    - pnpm db:migrate (only runs after human approval)
```

The `environment: production` with required reviewers means GitHub shows an "Approve" button. The reviewer sees the dry-run output from the previous job.

### Local pre-commit hook

Add to existing `lint-staged` configuration:

```json
"backend/drizzle/*.sql": ["tsx backend/scripts/migration-safety/analyze-migration.ts --warn-only"]
```

Non-blocking — prints risk assessment to terminal so developers see it before pushing. Does not prevent commit.

## Section 3: Claude Agent

**File**: `.claude/agents/migration-safety.md`

### Purpose

Provides intelligent semantic review that deterministic scripts cannot:

1. **Cross-references application code** — Greps codebase for columns/tables being dropped. Flags if a `DROP COLUMN` removes something still referenced in Drizzle schemas, services, or queries.

2. **Data safety analysis** — Detects patterns like:
   - `ADD COLUMN ... NOT NULL` on a table with existing rows (needs `DEFAULT`)
   - `ALTER TYPE` that triggers table rewrite on large tables
   - Missing `IF NOT EXISTS` / `IF EXISTS` guards
   - Index creation without `CONCURRENTLY` on large tables (blocks writes)

3. **Extension compatibility** — For pgvector:
   - Validates dimension changes won't silently truncate embeddings
   - Checks HNSW/IVFFlat index params vs expected data volume
   - Flags `CREATE EXTENSION` superuser requirements per hosting platform

4. **Migration ordering** — Verifies new migrations align with drizzle journal, checks for sequence gaps or duplicate indices.

5. **Rollback review** — Reviews auto-generated rollbacks for correctness, flags data-loss scenarios the generator can't detect.

### When to invoke

- During code review of PRs containing migration files
- When planning schema changes for upcoming phases
- When CI analysis flags WARNINGs that need judgment
- On-demand when writing complex migrations

### Agent structure

Follows the existing agent format (frontmatter, project context, capabilities, workflow, code standards, output format, persistent memory). Model: sonnet.

## File Inventory

| File | Purpose |
|------|---------|
| `backend/scripts/migration-safety/analyze-migration.ts` | DDL risk classifier |
| `backend/scripts/migration-safety/generate-rollback.ts` | Rollback script generator |
| `backend/scripts/migration-safety/validate-rollback.ts` | Rollback roundtrip validator |
| `backend/scripts/migration-safety/types.ts` | Shared types (RiskLevel, AnalysisReport, etc.) |
| `backend/scripts/migration-safety/patterns.ts` | DDL regex patterns and classification rules |
| `backend/drizzle/rollbacks/` | Generated rollback scripts (gitignored? or committed?) |
| `.claude/agents/migration-safety.md` | Claude agent definition |
| `.github/workflows/quality-gates.yml` | Modified — add migration-safety job |
| `.github/workflows/backend-deploy.yml` | Modified — add dry-run + environment gate |
| `package.json` (root or backend) | New npm scripts for migration safety |

## Open Decision: Rollback Storage

Rollback files should be **committed to git** alongside the UP migrations. This ensures:
- Rollbacks are versioned and reviewed in PRs
- They're available in production if needed for emergency rollback
- CI can validate they haven't drifted from the UP migration

## Success Criteria

1. No migration file reaches `main` with unacknowledged DESTRUCTIVE operations
2. Every migration has a corresponding rollback (auto-generated or manual)
3. Rollbacks validated via UP+DOWN roundtrip in CI
4. Production migrations require manual approval after dry-run review
5. Local pre-commit warns developers of risky patterns before push
6. Agent catches semantic issues (dead column references, missing defaults, extension risks)
