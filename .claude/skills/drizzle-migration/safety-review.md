# Migration Safety Review

Risk classification and mitigation strategies for Drizzle-generated migration SQL.

## Risk Tiers

### SAFE (auto-proceed)

| Operation | Lock Type | Duration | Notes |
|---|---|---|---|
| `CREATE TABLE IF NOT EXISTS` | None | Instant | Drizzle generates this by default |
| `ALTER TABLE ... ADD COLUMN` (nullable, no default) | AccessExclusiveLock | Instant | Metadata-only on PG 11+ |
| `ALTER TABLE ... ADD COLUMN ... DEFAULT` | AccessExclusiveLock | Instant | Metadata-only on PG 11+ |
| `CREATE INDEX IF NOT EXISTS` | ShareLock | <1s (small table) | Blocks writes briefly |
| `COMMENT ON` | None | Instant | No data change |

### WARNING (proceed with caution, warn user)

| Operation | Lock Type | Duration | Mitigation |
|---|---|---|---|
| `ADD COLUMN ... NOT NULL` without `DEFAULT` | AccessExclusiveLock | Instant | **Fails if rows exist!** Add DEFAULT or make nullable first |
| `ALTER COLUMN ... SET NOT NULL` | AccessExclusiveLock | Scans table | Only safe if no NULLs exist. Run `SELECT count(*) WHERE col IS NULL` first |
| `ALTER COLUMN ... SET DEFAULT` | AccessExclusiveLock | Instant | Safe for future rows, doesn't backfill existing |
| `CREATE UNIQUE INDEX` | ShareLock | Scans table | Can fail if duplicates exist |
| `CREATE EXTENSION IF NOT EXISTS` | None | Instant | May require superuser/rds_superuser |
| `ADD CONSTRAINT ... FOREIGN KEY` | ShareRowExclusiveLock | Scans both tables | Blocks writes on both tables during scan |
| `ADD CONSTRAINT ... CHECK` | AccessExclusiveLock | Scans table | Blocks reads+writes during validation |

### DESTRUCTIVE (block, require explicit acknowledgment)

| Operation | Lock Type | Duration | Why Dangerous |
|---|---|---|---|
| `DROP TABLE` | AccessExclusiveLock | Instant | **Data loss** — all rows deleted |
| `DROP COLUMN` | AccessExclusiveLock | Instant (metadata) | **Data loss** — column data deleted |
| `ALTER COLUMN ... TYPE` | AccessExclusiveLock | **Rewrites table** | Blocks all access for duration of rewrite |
| `DROP INDEX` | AccessExclusiveLock | Instant | Queries may regress; check explain plans first |
| `TRUNCATE` | AccessExclusiveLock | Instant | **Data loss** — all rows deleted |
| `DROP EXTENSION` | Cascades | Varies | Drops dependent columns/indexes silently |
| `ALTER EXTENSION` | Varies | Varies | Can break dependent objects |

## Lock Analysis

PostgreSQL locks form a hierarchy. The key ones for migrations:

| Lock | Blocks | Common Operations |
|---|---|---|
| **AccessExclusiveLock** | Everything (reads + writes) | Most DDL, `DROP`, `TRUNCATE`, `ALTER TABLE` |
| **ShareLock** | Writes only | `CREATE INDEX` (non-concurrent) |
| **ShareUpdateExclusiveLock** | Some writes | `CREATE INDEX CONCURRENTLY` |

**Rule of thumb**: If a table has >100K rows, any operation requiring `AccessExclusiveLock` that scans/rewrites the table needs a deployment plan (maintenance window or staged approach).

## Common Drizzle Kit Gotchas

### Column Rename = DROP + CREATE
Drizzle Kit may generate `DROP COLUMN` + `ADD COLUMN` instead of `ALTER COLUMN ... RENAME TO`. This causes **data loss**. Always review the SQL when renaming.

**Fix**: Use `ALTER COLUMN ... RENAME TO` manually, or use drizzle-kit's `rename` dialog when `strict: true` prompts.

### Type Change = Table Rewrite
Changing a column type (e.g., `text` → `integer`, or `varchar(50)` → `varchar(100)`) generates `ALTER COLUMN ... TYPE`. On populated tables, this rewrites every row.

**Fix**: For large tables, add a new column, backfill in batches, drop old column, rename new column.

### Index in Transaction
Drizzle Kit wraps migrations in a transaction. `CREATE INDEX CONCURRENTLY` **cannot** be inside a transaction. If you need concurrent index creation on a large table:

1. Let drizzle-kit generate the migration normally
2. **Manually** extract the `CREATE INDEX` into a separate file
3. Run it outside the migration transaction

**Warning**: Modifying generated SQL changes the hash. See journal-troubleshooting.md for workarounds.

### NOT NULL Without DEFAULT on Populated Table
Adding a `NOT NULL` column without a default value to a table that has existing rows will fail with:
```
ERROR: column "x" of relation "y" contains null values
```

**Fix**: Either:
1. Add as nullable first, backfill, then set NOT NULL
2. Include a DEFAULT value: `.notNull().default('value')`

## Review Template

When reporting a migration review to the user:

```markdown
## Migration Safety Review: NNNN_<tag>.sql

### Statements
| # | SQL | Risk | Lock | Duration | Reversible |
|---|-----|------|------|----------|------------|
| 1 | CREATE TABLE IF NOT EXISTS x | SAFE | None | Instant | DROP TABLE |
| 2 | CREATE INDEX IF NOT EXISTS idx_x | SAFE | ShareLock | <1s | DROP INDEX |

### Verdict: SAFE / WARNING / DESTRUCTIVE

### Warnings (if any)
1. [Description of warning + mitigation]

### Required User Actions (if DESTRUCTIVE)
1. [Acknowledge data loss risk for DROP COLUMN x]

### Rollback SQL
```sql
-- Reverse of this migration
DROP INDEX IF EXISTS idx_x;
DROP TABLE IF EXISTS x;
```

### Post-Migration Verification
- [ ] `npm run db:check-tables`
- [ ] `npm run db:check-migrations`
- [ ] `npm run prep` (lint + build)
- [ ] `npm run test:unit`
```

## Extension-Specific Risks

### pgvector
- `CREATE EXTENSION vector` requires superuser (self-hosted) or `rds_superuser` (AWS RDS)
- Dimension changes (`vector(768)` → `vector(1536)`) are table rewrites + silent truncation
- HNSW index creation is slow on populated tables and CANNOT be in a transaction
- Always stage: extension → column → backfill → index (4 separate migrations)

### pg_trgm (text search)
- `CREATE EXTENSION pg_trgm` — usually safe, no superuser needed on modern hosts
- GIN indexes with `gin_trgm_ops` are slow to build but fast to query

### General Extension Rules
- `CREATE EXTENSION IF NOT EXISTS` — WARNING tier (permission risk)
- `DROP EXTENSION` — DESTRUCTIVE tier (cascades to dependent objects)
- `ALTER EXTENSION UPDATE` — DESTRUCTIVE tier (can change behavior)
