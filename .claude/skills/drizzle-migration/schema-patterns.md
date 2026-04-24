# Schema File Conventions

Reference for Drizzle ORM schema patterns used in this project.

## File Structure

Every schema file follows this structure:

```typescript
import { pgTable, uuid, text, integer, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
// Import referenced tables for FKs
import { renovationSessions } from './sessions.schema.js';

// Const arrays for closed-set columns (exported for validators)
export const MY_STATUSES = ['active', 'archived'] as const;
export type MyStatus = (typeof MY_STATUSES)[number];

// JSONB interface (if table has JSONB columns)
export interface MyMetadata {
  field?: string;
  [key: string]: unknown; // Index signature for extensibility
}

// Table definition
export const myTable = pgTable('my_table', {
  // Columns...
}, (table) => [
  // Indexes...
]);

// Inferred types — ALWAYS export both
export type MyTable = typeof myTable.$inferSelect;
export type NewMyTable = typeof myTable.$inferInsert;
```

## Column Patterns

### Primary Key (always UUID)
```typescript
id: uuid('id').primaryKey().defaultRandom(),
```

### Foreign Keys (always include onDelete)
```typescript
// Cascade — child deleted when parent deleted
sessionId: uuid('session_id')
  .notNull()
  .references(() => renovationSessions.id, { onDelete: 'cascade' }),

// Set null — child keeps existing but FK nulled
uploadedBy: uuid('uploaded_by')
  .references(() => profiles.id, { onDelete: 'set null' }),
```

### Self-Referencing FK (requires AnyPgColumn)
```typescript
import { type AnyPgColumn } from 'drizzle-orm/pg-core';

previousVersionId: uuid('previous_version_id')
  .references((): AnyPgColumn => documentArtifacts.id, { onDelete: 'set null' }),
```

### Text Columns
```typescript
// Required text
name: text('name').notNull(),

// Optional text (nullable by default)
caption: text('caption'),

// Text with default
source: text('source').notNull().default('user_upload'),

// Closed-set text (validated at app layer, not DB enum)
status: text('status').notNull().default('pending'),
// Project prefers text columns + app-layer Zod validation over DB enums
// because DB enum changes require ALTER TYPE which is a table rewrite
```

### Integer Columns
```typescript
fileSize: integer('file_size').notNull(),       // Required
displayOrder: integer('display_order').default(0), // With default
version: integer('version').notNull().default(1),  // Versioning
pageCount: integer('page_count'),                  // Optional
```

### JSONB Columns
```typescript
// Define interface first (see above), then:
metadata: jsonb('metadata').$type<MyMetadata>(),
```

Always add a corresponding Zod schema in `backend/src/db/jsonb-schemas.ts`:
```typescript
export const MyMetadataSchema = z.object({
  field: z.string().optional(),
}).passthrough(); // .passthrough() allows extra keys for backward compat
```

### Timestamps (always include both)
```typescript
createdAt: timestamp('created_at').defaultNow().notNull(),
updatedAt: timestamp('updated_at').defaultNow().notNull(),
```

Optional timestamps:
```typescript
expiresAt: timestamp('expires_at'), // Nullable
```

## Index Patterns

Indexes are defined in the 3rd argument of `pgTable`:

```typescript
export const myTable = pgTable('my_table', {
  // columns...
}, (table) => [
  // Single-column index
  index('idx_my_table_session').on(table.sessionId),

  // Composite index
  index('idx_my_table_session_type').on(table.sessionId, table.assetType),

  // Partial index (WHERE clause)
  // Note: Drizzle supports .where() on index builder
  index('idx_my_table_active').on(table.status).where(sql`status = 'active'`),
]);
```

**Naming convention**: `idx_{table_name}_{column(s)}`

**Existing indexes** (migration 0006):
- `idx_chat_messages_session_created` — (session_id, created_at DESC)
- `idx_chat_messages_session_role` — (session_id, role)
- `idx_renovation_rooms_session` — (session_id)
- `idx_product_recommendations_room` — (room_id)
- `idx_contractor_recommendations_room` — (room_id)
- `idx_renovation_sessions_user` — (user_id) WHERE user_id IS NOT NULL
- `idx_room_assets_session_room` — (session_id, room_id)

## Barrel Export (index.ts)

When adding a new schema file, update `backend/src/db/schema/index.ts`:

```typescript
// Domain comment
export * from './my-table.schema.js';  // .js extension for ESM!
```

Order: Keep grouped by domain (auth, sessions, rooms, products, etc.)

## Current Schema Files (13)

| File | Table | Domain |
|---|---|---|
| `users.schema.ts` | `profiles` | Authentication |
| `sessions.schema.ts` | `renovation_sessions` | Project state |
| `rooms.schema.ts` | `renovation_rooms` | Room data |
| `products.schema.ts` | `product_recommendations` | AI recommendations |
| `contractors.schema.ts` | `contractor_recommendations` | AI recommendations |
| `messages.schema.ts` | `chat_messages` | Conversation history |
| `styles.schema.ts` | `style_catalog` | Style reference data |
| `assets.schema.ts` | `room_assets` | File uploads |
| `style-images.schema.ts` | `style_images` | Moodboard images |
| `asset-variants.schema.ts` | `asset_variants` | Image processing |
| `document-artifacts.schema.ts` | `document_artifacts` | Generated PDFs |
| `products-catalog.schema.ts` | `products_catalog` | Product search |

## Const-Array Pattern for Closed Sets

The project uses `as const` arrays instead of PostgreSQL enums:

```typescript
export const ASSET_TYPES = ['photo', 'floorplan', 'render', 'document'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
```

**Why**: DB `ALTER TYPE` on enums requires a table rewrite. String columns with app-layer Zod validation are cheaper to evolve.

These arrays should also be exported from `@renovation/shared-types` if they cross the backend/frontend boundary (see the api-contract-specialist agent).
