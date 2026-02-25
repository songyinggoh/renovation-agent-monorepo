---
name: drizzle-migration
description: >
  Generates Drizzle ORM schema changes through the full safe workflow: schema design,
  migration generation, safety review, rollback SQL, journal validation, and CI drift
  verification. Handles add-column, add-table, add-index, modify-column, and drop operations
  with risk-aware guidance. Use when making any database schema change.
user-invocable: true
---

# /drizzle-migration

Full-lifecycle Drizzle ORM schema change skill for the renovation agent monorepo. Guides the developer from intent through schema file, migration generation, safety review, rollback notes, and verification — touching every file that needs updating in a single pass.

## When to Use

- Adding a new table to the database
- Adding or removing columns on an existing table
- Adding or modifying indexes
- Adding constraints (foreign keys, unique, check)
- Modifying column types or nullability
- Any schema change that will produce a Drizzle Kit migration

## Invocation

```
/drizzle-migration <description of schema change>
```

**Examples**:
```
/drizzle-migration add agent_tool_calls table for observability
/drizzle-migration add embedding vector(1536) column to room_assets
/drizzle-migration add is_archived boolean column to renovation_sessions
/drizzle-migration drop deprecated style_preferences column from renovation_sessions
/drizzle-migration add GIN index on products_catalog.tags
```

## Workflow

Follow every step sequentially. Do not skip steps.

### Step 1: Understand the Change

1. Read the user's description to determine:
   - **Operation**: add-table / add-column / add-index / modify-column / drop-column / drop-table
   - **Target table(s)**: Which schema file(s) to modify
   - **Risk tier**: SAFE / WARNING / DESTRUCTIVE (see [safety-review.md](./safety-review.md))

2. Read the relevant schema file(s):
   - Schema files: `backend/src/db/schema/*.schema.ts`
   - Barrel: `backend/src/db/schema/index.ts`
   - JSONB schemas: `backend/src/db/jsonb-schemas.ts` (if JSONB columns involved)

3. Confirm the approach with the user before writing code. Include:
   - The exact columns/types being added/modified
   - Risk classification
   - Whether the barrel export needs updating
   - Whether JSONB schemas need updating

### Step 2: Modify Schema Files

Apply the schema change following project conventions:

**File naming**: `backend/src/db/schema/{name}.schema.ts`

**Table conventions** (see [schema-patterns.md](./schema-patterns.md)):
```typescript
import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const myTable = pgTable('my_table', {
  // UUID primary key — ALWAYS use this pattern
  id: uuid('id').primaryKey().defaultRandom(),

  // Foreign keys — ALWAYS include onDelete
  sessionId: uuid('session_id')
    .notNull()
    .references(() => renovationSessions.id, { onDelete: 'cascade' }),

  // Timestamps — ALWAYS include both
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  // Indexes defined in 3rd argument
  index('idx_my_table_session').on(table.sessionId),
]);

// ALWAYS export inferred types
export type MyTable = typeof myTable.$inferSelect;
export type NewMyTable = typeof myTable.$inferInsert;
```

**If adding a new table**: Also update the barrel export:
```typescript
// backend/src/db/schema/index.ts
export * from './my-table.schema.js';  // .js extension for ESM!
```

**If adding JSONB columns**: Also add a Zod schema to `backend/src/db/jsonb-schemas.ts`:
```typescript
export const MyMetadataSchema = z.object({
  // fields...
}).passthrough();  // .passthrough() for backward compat
```

### Step 3: Generate the Migration

Run drizzle-kit to produce the migration SQL:

```bash
cd backend && npm run db:generate
```

This diffs the schema files against the latest snapshot (`backend/drizzle/meta/0007_snapshot.json`) and produces:
- A new SQL file: `backend/drizzle/NNNN_<tag>.sql`
- A new snapshot: `backend/drizzle/meta/NNNN_snapshot.json`
- Updated journal: `backend/drizzle/meta/_journal.json`

**If `strict: true` prompts for confirmation**: This means drizzle-kit detected an ambiguous operation (rename vs drop+create). Review the prompt carefully.

### Step 4: Review the Generated SQL

Read the generated `.sql` file and apply the safety review from [safety-review.md](./safety-review.md).

**Classify each statement**:

| Tier | Operations | Action |
|---|---|---|
| **SAFE** | `CREATE TABLE`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN` (nullable), `COMMENT ON` | Proceed |
| **WARNING** | `ADD COLUMN ... NOT NULL` (needs DEFAULT), `ALTER COLUMN`, `CREATE UNIQUE INDEX`, `CREATE EXTENSION` | Warn user, suggest mitigations |
| **DESTRUCTIVE** | `DROP TABLE`, `DROP COLUMN`, `ALTER TYPE` (rewrite), `TRUNCATE` | Block — require explicit user acknowledgment |

**Check for common issues**:
- Missing `IF NOT EXISTS` / `IF EXISTS`
- `CREATE INDEX` without `CONCURRENTLY` (blocks writes on large tables)
- `NOT NULL` column added without `DEFAULT` on a table with existing rows
- Implicit table rewrite from type change

**Report the review to the user**:
```
## Migration Safety Review: NNNN_<tag>.sql

| # | SQL Statement | Risk | Lock | Duration |
|---|---------------|------|------|----------|
| 1 | CREATE TABLE IF NOT EXISTS ... | SAFE | None | Instant |
| 2 | CREATE INDEX IF NOT EXISTS ... | SAFE | ShareLock | <1s |

Verdict: SAFE — proceed with migration.
```

### Step 5: Generate Rollback Notes

For each statement in the migration, document the reverse operation:

| UP Statement | DOWN Statement |
|---|---|
| `CREATE TABLE x (...)` | `DROP TABLE IF EXISTS x` |
| `ALTER TABLE x ADD COLUMN y ...` | `ALTER TABLE x DROP COLUMN IF EXISTS y` |
| `CREATE INDEX idx ON ...` | `DROP INDEX IF EXISTS idx` |
| `ALTER TABLE x ADD CONSTRAINT c ...` | `ALTER TABLE x DROP CONSTRAINT IF EXISTS c` |

Present the rollback SQL to the user. If any statement is non-reversible (data migration, `ALTER TYPE`), flag it explicitly.

### Step 6: Apply the Migration (Local Dev)

After user approval of the review:

```bash
cd backend && npm run db:migrate
```

### Step 7: Verify

Run all verification steps:

```bash
# Verify table exists
cd backend && npm run db:check-tables

# Verify migration recorded
cd backend && npm run db:check-migrations

# Verify no type errors
cd backend && npm run prep

# Verify tests pass
cd backend && npm run test:unit
```

### Step 8: Verify CI Will Pass

Simulate the CI drift check:

```bash
cd backend && npm run db:generate
```

This should produce NO new files. If it does, something is out of sync.

### Step 9: Commit Checklist

Remind the user to commit ALL of:
- [ ] Modified schema file(s) in `backend/src/db/schema/`
- [ ] Updated barrel export in `backend/src/db/schema/index.ts` (if new table)
- [ ] Updated JSONB schemas in `backend/src/db/jsonb-schemas.ts` (if JSONB column)
- [ ] Generated migration SQL: `backend/drizzle/NNNN_*.sql`
- [ ] Generated snapshot: `backend/drizzle/meta/NNNN_snapshot.json`
- [ ] Updated journal: `backend/drizzle/meta/_journal.json`

**Missing any of these files will cause CI drift detection to fail.**

## Key References

See companion files for detailed reference:
- [schema-patterns.md](./schema-patterns.md) — Schema file conventions, column types, index patterns
- [safety-review.md](./safety-review.md) — Risk tiers, lock analysis, mitigation strategies
- [rollback-patterns.md](./rollback-patterns.md) — Reversibility rules, manual rollback scenarios
- [journal-troubleshooting.md](./journal-troubleshooting.md) — Hybrid history, reconciliation, common errors
