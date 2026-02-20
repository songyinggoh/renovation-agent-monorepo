---
name: drizzle-query
description: >
  Type-safe Drizzle ORM query generation for complex joins, JSONB read/write,
  upserts, aggregates, transactions, and pagination — using this project's exact
  schema imports, db client, and ESM conventions. Use when writing or debugging
  any non-trivial Drizzle query that goes beyond a simple select/insert/update.
user-invocable: true
---

# /drizzle-query

Type-safe Drizzle ORM query patterns for the renovation agent monorepo. Covers the query patterns that go beyond a simple `db.select().from(table)`: multi-table joins, JSONB merges, ON CONFLICT upserts, aggregate counts, transactions, and cursor pagination — all using the exact schemas and db client already in the project.

## When to Use

- Writing a query that joins 2+ tables
- Reading or writing a JSONB column (`metadata`, `processingConfig`, `tags`)
- Upsert: inserting a row that may already exist (asset variants, style catalog)
- Aggregating counts, sums, or group-by results
- Running multiple writes atomically inside a transaction
- Paginating a large result set (offset-based or cursor-based)
- Getting only specific columns from a table (partial select)
- Any raw SQL fragment via the `sql` template literal

## Invocation

```
/drizzle-query <describe what the query needs to do>
```

**Examples**:
```
/drizzle-query fetch all assets for a room including their processed variants
/drizzle-query upsert an asset variant by (parentAssetId, variantType)
/drizzle-query update the metadata JSONB field to set thumbnailGenerated = true
/drizzle-query count assets grouped by assetType for a room
/drizzle-query get the 20 most recent sessions with cursor pagination
/drizzle-query atomically create a room and its first asset in a transaction
/drizzle-query find all ready variants where processingConfig->>'quality' > 80
```

## Project Conventions (Read First)

### DB Client Import

```typescript
import { db } from '../db/index.js';           // always .js for ESM
```

### Schema Imports

```typescript
// Always import from the schema barrel:
import {
  roomAssets, type RoomAsset, type NewRoomAsset,
  ASSET_STATUSES, type AssetStatus,
} from '../db/schema/assets.schema.js';

import { assetVariants, type AssetVariant } from '../db/schema/asset-variants.schema.js';
import { renovationRooms } from '../db/schema/rooms.schema.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
```

### Operator Imports

```typescript
import { eq, and, or, inArray, isNull, isNotNull, gt, lt, gte, lte,
         desc, asc, sql, count, sum, max, ne } from 'drizzle-orm';
```

### JSONB Validator Import

```typescript
import { validateJsonb } from '../db/jsonb-validators.js';
import { AssetMetadataSchema } from '../db/jsonb-schemas.js';
```

---

## Quick-Reference by Pattern

| Need | Pattern | Reference |
|---|---|---|
| Join two tables | `db.select().from(a).innerJoin(b, eq(a.id, b.aId))` | [join-patterns.md](./join-patterns.md) |
| Left join (optional relation) | `.leftJoin(b, eq(a.id, b.aId))` | [join-patterns.md](./join-patterns.md) |
| 3-table join | Chain `.innerJoin()` calls | [join-patterns.md](./join-patterns.md) |
| Select subset of columns | `.select({ id: t.id, status: t.status })` | [join-patterns.md](./join-patterns.md) |
| Read JSONB field | `asset.metadata?.width` (typed) | [jsonb-patterns.md](./jsonb-patterns.md) |
| Write JSONB field | Pass object, Drizzle serializes | [jsonb-patterns.md](./jsonb-patterns.md) |
| Merge-update JSONB | `sql\`metadata \|\| ${json}::jsonb\`` | [jsonb-patterns.md](./jsonb-patterns.md) |
| Filter on JSONB key | `sql\`metadata->>'orientation' = 'landscape'\`` | [jsonb-patterns.md](./jsonb-patterns.md) |
| Upsert | `.onConflictDoUpdate({ target, set })` | [upsert-patterns.md](./upsert-patterns.md) |
| Upsert ignore duplicate | `.onConflictDoNothing()` | [upsert-patterns.md](./upsert-patterns.md) |
| Count | `sql<number>\`count(*)::int\`` | [join-patterns.md](./join-patterns.md) |
| Group by | `.groupBy(table.column)` | [join-patterns.md](./join-patterns.md) |
| Transaction | `db.transaction(async (tx) => { ... })` | [transaction-patterns.md](./transaction-patterns.md) |
| Offset pagination | `.limit(20).offset(page * 20)` | [join-patterns.md](./join-patterns.md) |
| Cursor pagination | `gt(table.createdAt, cursor)` | [join-patterns.md](./join-patterns.md) |
| Raw SQL fragment | `sql\`CURRENT_TIMESTAMP\`` | [jsonb-patterns.md](./jsonb-patterns.md) |

---

## Step-by-Step Workflow

### 1. Identify the tables involved

Check `backend/src/db/schema/` for column names. The barrel export is `backend/src/db/schema/index.ts`.

**Schema map**:
| Table | Schema file | Key columns |
|---|---|---|
| `renovation_sessions` | `sessions.schema.ts` | `id`, `userId`, `phase`, `isPaid`, `totalBudget` |
| `renovation_rooms` | `rooms.schema.ts` | `id`, `sessionId`, `name`, `roomType` |
| `room_assets` | `assets.schema.ts` | `id`, `sessionId`, `roomId`, `assetType`, `status`, `metadata` (JSONB) |
| `asset_variants` | `asset-variants.schema.ts` | `id`, `parentAssetId`, `variantType`, `processingStatus`, `storagePath`, `processingConfig` (JSONB) |
| `chat_messages` | `messages.schema.ts` | `id`, `sessionId`, `role`, `content`, `createdAt` |
| `product_recommendations` | `products.schema.ts` | `id`, `roomId`, `productName`, `price` |
| `contractor_recommendations` | `contractors.schema.ts` | `id`, `roomId`, `name`, `specialty` |
| `style_catalog` | `styles.schema.ts` | `id`, `name`, `category` |
| `style_images` | `style-images.schema.ts` | `id`, `styleId`, `storagePath`, `tags` (JSONB array) |
| `document_artifacts` | `document-artifacts.schema.ts` | `id`, `sessionId`, `phase`, `format`, `status`, `metadata` (JSONB) |
| `products_catalog` | `products-catalog.schema.ts` | `id`, `name`, `price`, `metadata` (JSONB) |
| `profiles` | `users.schema.ts` | `id`, `email`, `displayName` |

### 2. Choose the query pattern

Use the quick-reference table above to find the right reference file.

### 3. Write and validate

- Always destructure `[result]` for single-row queries — Drizzle returns arrays
- Use `type Result = ...` annotations on complex `select({ ... })` shapes
- Never use `as any` — use the inferred `$inferSelect` types from schemas

### 4. Verify the query compiles

```bash
cd backend && npm run type-check   # 0 errors
```

---

## Common Gotchas

| Gotcha | Fix |
|---|---|
| `[row]` destructuring on empty result | Guard: `if (!row) throw new NotFoundError(...)` |
| JSONB update replaces whole field | Use merge pattern: `metadata \|\| $json::jsonb` |
| `sql<T>` needs explicit generic | Always annotate: `sql<number>`, `sql<string>` |
| `.returning()` needed after insert/update | Drizzle doesn't return by default in Postgres |
| `eq(table.col, undefined)` is valid JS but wrong SQL | Use `isNull()` for null checks, not `=== null` |
| LEFT JOIN produces `null` columns | Type intersection includes `\| null` — guard before use |
| `onConflictDoUpdate` needs exact column target | Must match the unique index, not just any column |
| JSONB `->>'key'` vs `->'key'` | `->>` returns text, `->` returns JSON — use `->>'key'` for comparisons |
| `count(*)` returns `string` in pg | Cast: `sql<number>\`count(*)::int\`` |
| Self-referencing FK circular import | Use `(): AnyPgColumn =>` return type annotation |

## Companion Files

- [join-patterns.md](./join-patterns.md) — Joins, partial selects, aggregates, pagination
- [jsonb-patterns.md](./jsonb-patterns.md) — JSONB read, write, merge-update, filter
- [upsert-patterns.md](./upsert-patterns.md) — ON CONFLICT upserts, idempotent inserts
- [transaction-patterns.md](./transaction-patterns.md) — db.transaction(), rollback, savepoints
