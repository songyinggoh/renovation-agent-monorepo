# Upsert & Idempotent Insert Patterns

## When to Use Upserts

Upserts are critical anywhere the same logical row might be created twice:
- Worker retries re-processing the same asset → same `(parentAssetId, variantType)` variant
- Style catalog seeding → same style name re-imported
- Product catalog sync → same external product ID refreshed
- Any "create-or-update" operation

## 1. onConflictDoUpdate (standard upsert)

The `target` must be the column(s) covered by a UNIQUE constraint or the primary key.

### Asset Variant Upsert

`asset_variants` has a unique index on `(parent_asset_id, variant_type)` via the worker's idempotency requirement — add it to the schema if not present, or use `storagePath` which has `.unique()`.

```typescript
import { db } from '../db/index.js';
import { assetVariants } from '../db/schema/asset-variants.schema.js';
import type { NewAssetVariant } from '../db/schema/asset-variants.schema.js';

const values: NewAssetVariant = {
  parentAssetId: assetId,
  variantType: 'thumbnail',
  format: 'webp',
  storagePath: `session_${sessionId}/room_${roomId}/photos/${assetId}_thumb.webp`,
  contentType: 'image/webp',
  fileSize: 24000,
  width: 300,
  height: 200,
  processingStatus: 'ready',
  processedAt: new Date(),
};

// Upsert by storagePath (unique column)
const [variant] = await db
  .insert(assetVariants)
  .values(values)
  .onConflictDoUpdate({
    target: assetVariants.storagePath,
    set: {
      fileSize: values.fileSize,
      width: values.width,
      height: values.height,
      processingStatus: values.processingStatus,
      processedAt: values.processedAt,
      // Do NOT update createdAt
    },
  })
  .returning();
```

### Multi-Column Conflict Target

If the unique constraint spans multiple columns, pass them as an array:

```typescript
// Assuming a unique index on (parentAssetId, variantType) exists
const [variant] = await db
  .insert(assetVariants)
  .values(values)
  .onConflictDoUpdate({
    target: [assetVariants.parentAssetId, assetVariants.variantType],
    set: {
      fileSize: values.fileSize,
      processingStatus: values.processingStatus,
      processedAt: values.processedAt,
    },
  })
  .returning();
```

## 2. onConflictDoNothing (idempotent insert, skip duplicates)

Use when you never want to overwrite an existing row — just skip if it already exists.

```typescript
// Insert a product recommendation — skip if already recommended for this room
const [inserted] = await db
  .insert(productRecommendations)
  .values({
    roomId,
    sessionId,
    productName: 'Carrara Marble Tile',
    category: 'flooring',
    estimatedPrice: '4500.00',
    currency: 'USD',
  })
  .onConflictDoNothing()
  .returning();

// inserted may be undefined if a conflict occurred — check before using
if (!inserted) {
  logger.info('Product already recommended — skipping');
}
```

## 3. Upsert with excluded values (reference the conflicting row's values)

Use `sql\`excluded.column_name\`` to reference the values from the failed INSERT:

```typescript
import { sql } from 'drizzle-orm';

await db
  .insert(assetVariants)
  .values(values)
  .onConflictDoUpdate({
    target: assetVariants.storagePath,
    set: {
      fileSize: sql`excluded.file_size`,
      width: sql`excluded.width`,
      height: sql`excluded.height`,
      processingStatus: sql`excluded.processing_status`,
      processedAt: sql`excluded.processed_at`,
    },
  });
```

This is equivalent to `INSERT ... ON CONFLICT DO UPDATE SET col = EXCLUDED.col`.

## 4. Conditional upsert (only update if status allows)

Use a `where` clause on the `onConflictDoUpdate` to make updates conditional:

```typescript
import { eq } from 'drizzle-orm';

// Only update the variant if it's currently in 'pending' state
// (don't overwrite a successfully processed variant with a re-queued job)
await db
  .insert(assetVariants)
  .values(values)
  .onConflictDoUpdate({
    target: assetVariants.storagePath,
    set: {
      processingStatus: 'processing',
      processedAt: null,
      processingError: null,
    },
    where: eq(assetVariants.processingStatus, 'pending'),
  });
```

## 5. Upsert then return (get the final row whether inserted or updated)

```typescript
// Always returns the final row, regardless of whether insert or update won
const [final] = await db
  .insert(assetVariants)
  .values(values)
  .onConflictDoUpdate({
    target: assetVariants.storagePath,
    set: { processingStatus: values.processingStatus, processedAt: values.processedAt },
  })
  .returning();

// final is always defined (unlike onConflictDoNothing)
if (!final) throw new Error('Upsert failed to return a row');
```

## 6. Bulk upsert (multiple rows at once)

```typescript
const variantRows: NewAssetVariant[] = [
  { parentAssetId: assetId, variantType: 'thumbnail', storagePath: '...thumb.webp', ... },
  { parentAssetId: assetId, variantType: 'optimized', storagePath: '...opt.webp', ... },
  { parentAssetId: assetId, variantType: 'webp', storagePath: '...full.webp', ... },
];

const inserted = await db
  .insert(assetVariants)
  .values(variantRows)
  .onConflictDoUpdate({
    target: assetVariants.storagePath,
    set: {
      fileSize: sql`excluded.file_size`,
      processingStatus: sql`excluded.processing_status`,
      processedAt: sql`excluded.processed_at`,
    },
  })
  .returning();
```

## 7. Upsert in a transaction (with dependent row creation)

```typescript
// Create asset + its initial variant atomically
const result = await db.transaction(async (tx) => {
  const [asset] = await tx
    .insert(roomAssets)
    .values({ sessionId, roomId, assetType: 'photo', ... })
    .returning();

  if (!asset) throw new Error('Asset insert failed');

  const [variant] = await tx
    .insert(assetVariants)
    .values({ parentAssetId: asset.id, variantType: 'thumbnail', ... })
    .onConflictDoUpdate({
      target: assetVariants.storagePath,
      set: { processingStatus: 'pending' },
    })
    .returning();

  return { asset, variant };
});
```

## Which Pattern to Choose?

| Scenario | Pattern |
|---|---|
| Re-processable job with retry — always update | `onConflictDoUpdate` |
| Seed data — insert once, never overwrite | `onConflictDoNothing` |
| Update only when state allows (e.g. `pending` only) | `onConflictDoUpdate` with `where` |
| Many rows from external sync | Bulk `onConflictDoUpdate` with `excluded.col` |
| Atomic create-or-return (need the row either way) | `onConflictDoUpdate` + `.returning()` |
