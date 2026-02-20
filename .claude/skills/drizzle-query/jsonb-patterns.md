# JSONB Read, Write, Merge-Update & Filter Patterns

## JSONB Columns in This Project

| Table | Column | TypeScript type | Zod schema |
|---|---|---|---|
| `room_assets` | `metadata` | `AssetMetadata` | `AssetMetadataSchema` |
| `asset_variants` | `processingConfig` | `VariantProcessingConfig` | `VariantProcessingConfigSchema` |
| `document_artifacts` | `metadata` | `DocumentMetadata` | `DocumentMetadataSchema` |
| `products_catalog` | `metadata` | `ProductCatalogMetadata` | `ProductCatalogMetadataSchema` |
| `style_images` | `tags` | `string[]` | `StyleImageTagsSchema` |

## 1. Reading JSONB (typed, no casting needed)

Drizzle's `.$type<T>()` makes JSONB reads fully typed. No casting required.

```typescript
const [asset] = await db
  .select()
  .from(roomAssets)
  .where(eq(roomAssets.id, assetId));

// metadata is AssetMetadata | null (null if not set)
const width = asset?.metadata?.width;           // number | undefined
const orientation = asset?.metadata?.orientation; // 'landscape' | 'portrait' | 'square' | undefined
```

## 2. Writing JSONB (full replace)

Pass a plain object — Drizzle serializes to JSON automatically.

```typescript
import type { AssetMetadata } from '../db/schema/assets.schema.js';
import { validateJsonb } from '../db/jsonb-validators.js';
import { AssetMetadataSchema } from '../db/jsonb-schemas.js';

const metadata: AssetMetadata = {
  width: 1920,
  height: 1080,
  orientation: 'landscape',
  thumbnailGenerated: false,
};

// Validate before writing (service-layer boundary)
const validatedMetadata = validateJsonb(AssetMetadataSchema, metadata, 'AssetMetadata');

const [updated] = await db
  .update(roomAssets)
  .set({ metadata: validatedMetadata, updatedAt: new Date() })
  .where(eq(roomAssets.id, assetId))
  .returning();
```

## 3. Merge-Update JSONB (update specific keys only)

**Critical**: a plain `.set({ metadata: newValue })` replaces the WHOLE field.
To merge (update only some keys), use the PostgreSQL `||` operator.

```typescript
import { sql, eq } from 'drizzle-orm';

// Set thumbnailGenerated = true without touching other metadata keys
await db
  .update(roomAssets)
  .set({
    metadata: sql`metadata || ${JSON.stringify({ thumbnailGenerated: true })}::jsonb`,
    updatedAt: new Date(),
  })
  .where(eq(roomAssets.id, assetId));
```

For a typed merge helper:

```typescript
function jsonbMerge<T extends object>(updates: Partial<T>): SQL {
  return sql`${sql.raw('metadata')} || ${JSON.stringify(updates)}::jsonb`;
}

// Usage:
await db
  .update(roomAssets)
  .set({
    metadata: jsonbMerge<AssetMetadata>({ thumbnailGenerated: true, originalSize: 2048000 }),
    updatedAt: new Date(),
  })
  .where(eq(roomAssets.id, assetId));
```

## 4. Writing a JSONB array (style_images.tags)

```typescript
import { styleImages } from '../db/schema/style-images.schema.js';

const tags = ['modern', 'minimalist', 'scandinavian'];

await db
  .update(styleImages)
  .set({ tags })  // Drizzle serializes string[] as a JSON array
  .where(eq(styleImages.id, imageId));

// Reading back:
const [image] = await db.select().from(styleImages).where(eq(styleImages.id, imageId));
const firstTag = image?.tags?.[0]; // string | undefined
```

## 5. Filtering on a JSONB key (text comparison)

Use `->>` (extracts as text) for comparisons, `->` (extracts as JSON) for nesting.

```typescript
import { sql, eq, and } from 'drizzle-orm';

// Find all landscape assets in a room
const landscapeAssets = await db
  .select()
  .from(roomAssets)
  .where(
    and(
      eq(roomAssets.roomId, roomId),
      sql`metadata->>'orientation' = 'landscape'`,
    )
  );

// Numeric comparison (cast required)
const largeAssets = await db
  .select()
  .from(roomAssets)
  .where(
    and(
      eq(roomAssets.roomId, roomId),
      sql`(metadata->>'width')::int > 1920`,
    )
  );

// JSONB array contains value
const modernImages = await db
  .select()
  .from(styleImages)
  .where(sql`tags @> '["modern"]'::jsonb`);  // array containment
```

## 6. Filtering on nested JSONB (dimensions object)

```typescript
// AssetMetadata.dimensions: { length: number; width: number; unit: 'ft' | 'm' }
const metricAssets = await db
  .select()
  .from(roomAssets)
  .where(sql`metadata->'dimensions'->>'unit' = 'm'`);
```

## 7. JSONB NULL check

```typescript
import { isNull, isNotNull } from 'drizzle-orm';

// Assets WITH metadata (metadata column is not null)
const withMetadata = await db
  .select()
  .from(roomAssets)
  .where(
    and(
      eq(roomAssets.roomId, roomId),
      isNotNull(roomAssets.metadata),
    )
  );

// Check a key inside JSONB is present
const withThumbnail = await db
  .select()
  .from(roomAssets)
  .where(sql`metadata ? 'thumbnailGenerated'`);  // JSONB key existence operator
```

## 8. Appending to a JSONB array (push without replace)

```typescript
// Append a new tag to style_images.tags without fetching first
await db
  .update(styleImages)
  .set({
    tags: sql`COALESCE(tags, '[]'::jsonb) || '["eco-friendly"]'::jsonb`,
  })
  .where(eq(styleImages.id, imageId));
```

## 9. processingConfig write (asset_variants)

```typescript
import { assetVariants } from '../db/schema/asset-variants.schema.js';
import type { VariantProcessingConfig } from '../db/schema/asset-variants.schema.js';
import { validateJsonb } from '../db/jsonb-validators.js';
import { VariantProcessingConfigSchema } from '../db/jsonb-schemas.js';

const config: VariantProcessingConfig = {
  quality: 85,
  maxWidth: 1200,
  preserveAspectRatio: true,
  stripMetadata: true,
};

const validated = validateJsonb(VariantProcessingConfigSchema, config, 'VariantProcessingConfig');

const [variant] = await db
  .insert(assetVariants)
  .values({
    parentAssetId: assetId,
    variantType: 'optimized',
    format: 'webp',
    storagePath: `session_${sessionId}/room_${roomId}/photos/${assetId}_optimized.webp`,
    contentType: 'image/webp',
    fileSize: 0,          // updated after upload
    processingConfig: validated,
    processingStatus: 'pending',
  })
  .returning();
```

## 10. Raw SQL template literals for other patterns

```typescript
import { sql } from 'drizzle-orm';

// Current timestamp (avoid JS Date precision issues)
await db
  .update(assetVariants)
  .set({
    processedAt: sql`CURRENT_TIMESTAMP`,
    processingStatus: 'ready',
  })
  .where(eq(assetVariants.id, variantId));

// Increment a counter
await db
  .update(myTable)
  .set({ retryCount: sql`retry_count + 1` })
  .where(eq(myTable.id, id));

// Conditional update
await db
  .update(roomAssets)
  .set({
    status: sql`CASE WHEN file_size > 0 THEN 'uploaded' ELSE 'failed' END`,
  })
  .where(eq(roomAssets.id, assetId));
```

## Gotchas

| Issue | Explanation | Fix |
|---|---|---|
| Full replace on update | `.set({ metadata: obj })` replaces the whole column | Use `\|\|` merge for partial updates |
| `->>'key'` returns text | Numeric comparisons need `::int` cast | `(metadata->>'width')::int > 1920` |
| Array containment vs overlap | `@>` = contains all, `&&` = any overlap | Use `@>` for "has this tag" |
| `null` vs missing key | JSONB column null vs `{}` vs `{"key": null}` are different | Use `isNull(col)` for column null, `? 'key'` for key presence |
| `validateJsonb` throws | It throws `BadRequestError` by default — catch at controller layer | Only call inside service methods, not in SQL helpers |
