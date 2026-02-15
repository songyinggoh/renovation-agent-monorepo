# Phase 2 Gaps: Product DB Seeding + Style Image Pipeline - Research

**Researched:** 2026-02-15
**Domain:** Drizzle ORM seeding, product catalog design, style image storage strategy
**Confidence:** HIGH

## Summary

Two gaps exist in Phase 2's data pipeline: (1) products are searched from an in-memory array (`SEED_PRODUCTS`) instead of the database, and (2) style images have DB records and a service but no seeding is triggered and no images are downloaded.

The codebase already has a complete pattern for both problems. `StyleService.seedStyles()` shows how to seed a catalog table with `onConflictDoNothing`. `StyleImageService.seedFromManifest()` already handles creating `style_images` DB records from the seed manifest without downloading files. The seeding is exposed via `POST /api/styles/seed` routes.

**Primary recommendation:** Create a `product_catalog` table for the seed products (separate from per-room `product_recommendations`), add a seed method mirroring `StyleService.seedStyles()`, update `search_products` tool to query DB, and for style images simply use the existing `seedFromManifest()` with Unsplash URLs stored as `sourceUrl` references (no download needed).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.38.3 | ORM for inserts/queries | Already used throughout codebase |
| pg | ^8.13.1 | PostgreSQL driver | Already configured with connection pool |
| zod | ^3.24.1 | Schema validation | Already used for env validation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tsx | ^4.19.2 | Run TypeScript scripts | Already used for migration scripts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `product_catalog` table | Reuse `product_recommendations` | `product_recommendations` is per-room with FK to `renovation_rooms` - wrong semantic; catalog is global |
| Downloading Unsplash images | Referencing URLs directly | External URLs work fine for dev/demo; Supabase Storage download can be added later when storage is configured |

## Architecture Patterns

### Gap 1: Product Catalog - Recommended Approach

The `product_recommendations` table has a `roomId` FK and is designed for per-session AI recommendations. Seed products need a **separate catalog table** (`product_catalog`) that serves as the global product database the AI searches against.

**Schema shape should mirror `SeedProduct` interface:**
```typescript
// Current SeedProduct interface (backend/src/data/seed-products.ts)
export interface SeedProduct {
  name: string;
  category: string;
  description: string;
  estimatedPrice: string;
  currency: string;
  productUrl: string | null;
  imageUrl: string | null;
  recommendationReason: string;
  metadata: {
    brand: string;
    style: string[];
    roomTypes: string[];
    material?: string;
    dimensions?: string;
  };
}
```

**New table schema pattern (following existing conventions):**
```typescript
// backend/src/db/schema/product-catalog.schema.ts
import { pgTable, uuid, text, numeric, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const productCatalog = pgTable('product_catalog', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description'),
  estimatedPrice: numeric('estimated_price', { precision: 10, scale: 2 }),
  currency: text('currency').default('USD'),
  productUrl: text('product_url'),
  imageUrl: text('image_url'),
  recommendationReason: text('recommendation_reason'),
  metadata: jsonb('metadata').$type<{
    brand: string;
    style: string[];
    roomTypes: string[];
    material?: string;
    dimensions?: string;
  }>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_product_catalog_category').on(table.category),
]);

export type ProductCatalogEntry = typeof productCatalog.$inferSelect;
export type NewProductCatalogEntry = typeof productCatalog.$inferInsert;
```

**Seed method pattern (mirroring StyleService.seedStyles):**
```typescript
// In ProductService or new ProductCatalogService
async seedProducts(): Promise<number> {
  const values = SEED_PRODUCTS.map(p => ({
    name: p.name,
    category: p.category,
    description: p.description,
    estimatedPrice: p.estimatedPrice,
    currency: p.currency,
    productUrl: p.productUrl,
    imageUrl: p.imageUrl,
    recommendationReason: p.recommendationReason,
    metadata: p.metadata,
  }));

  const result = await db
    .insert(productCatalog)
    .values(values)
    .onConflictDoNothing({ target: productCatalog.name });

  return result.rowCount ?? 0;
}
```

**Updated search_products tool pattern:**
```typescript
// Replace in-memory search with DB query
import { ilike, eq, lte, sql } from 'drizzle-orm';

async searchProducts(filters: ProductSearchFilters): Promise<ProductCatalogEntry[]> {
  const conditions = [];

  if (filters.category) {
    conditions.push(eq(productCatalog.category, filters.category));
  }
  if (filters.maxPrice) {
    conditions.push(lte(productCatalog.estimatedPrice, String(filters.maxPrice)));
  }
  if (filters.query) {
    const pattern = `%${filters.query}%`;
    conditions.push(sql`(${productCatalog.name} ILIKE ${pattern} OR ${productCatalog.description} ILIKE ${pattern})`);
  }
  // style and roomType filters use JSONB queries:
  if (filters.style) {
    conditions.push(sql`${productCatalog.metadata}->>'style' ? ${filters.style}`);
    // OR: sql`${productCatalog.metadata}->'style' @> ${JSON.stringify([filters.style])}::jsonb`
  }
  if (filters.roomType) {
    conditions.push(sql`${productCatalog.metadata}->'roomTypes' @> ${JSON.stringify([filters.roomType])}::jsonb`);
  }

  return db.select().from(productCatalog)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
}
```

### Gap 2: Style Images - Recommended Approach

**The infrastructure is already built.** `StyleImageService.seedFromManifest()` creates DB records with `sourceUrl` pointing to Unsplash URLs. The `storagePath` field gets a synthetic path (`styles/{slug}/{filename}`) even without actual upload.

**What needs to happen:**
1. Call `POST /api/styles/seed` to seed the `style_catalog` table (prerequisite)
2. Call `POST /api/styles/seed-images` to seed the `style_images` table

These routes already exist in `backend/src/routes/style.routes.ts`.

**For the AI tool to return image URLs, modify `StyleImageService` to return `sourceUrl` when storage is not configured:**
```typescript
// In StyleImageService.getImagesByStyle or wherever URLs are built
function resolveImageUrl(image: StyleImage): string {
  if (isStorageEnabled()) {
    return buildPublicUrl(image.storagePath);
  }
  // Fall back to original Unsplash source URL
  return image.sourceUrl ?? buildPublicUrl(image.storagePath);
}
```

### Project Structure (files to create/modify)

```
backend/src/
├── db/schema/
│   ├── product-catalog.schema.ts   # NEW - global product catalog table
│   └── index.ts                    # MODIFY - add export
├── services/
│   ├── product.service.ts          # MODIFY - add seedProducts(), replace searchSeedProducts() with DB query
│   └── style-image.service.ts      # MODIFY - add sourceUrl fallback for publicUrl
├── controllers/
│   └── product.controller.ts       # MODIFY - add seedProducts endpoint
├── routes/
│   └── product.routes.ts           # MODIFY - add POST /seed route
├── tools/
│   └── search-products.tool.ts     # MODIFY - use DB-backed search
└── data/
    └── seed-products.ts            # NO CHANGE - still the source of seed data
```

### Anti-Patterns to Avoid
- **Don't put catalog data in `product_recommendations`:** That table has a required `roomId` FK and represents per-session AI picks, not the global catalog.
- **Don't download Unsplash images during seeding:** Adds complexity, network dependency, and storage cost for zero functional benefit in dev. The `sourceUrl` reference works.
- **Don't auto-seed on server startup:** Follow the existing pattern of explicit `POST /seed` endpoints. Auto-seeding causes issues in tests and multi-instance deployments.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSONB array queries | Custom JS filtering | PostgreSQL `@>` operator via `sql` template | DB-level filtering is faster and correct |
| Idempotent seeding | Check-then-insert logic | `onConflictDoNothing` / `onConflictDoUpdate` | Drizzle has built-in upsert support; already used in `StyleService` |
| Image URL resolution | Custom URL builder from scratch | Existing `buildPublicUrl()` + `sourceUrl` fallback | `StyleImageService` already handles both paths |
| Migration generation | Hand-written SQL | `npm run db:generate` (drizzle-kit) | Drizzle-kit generates correct SQL from schema changes |

## Common Pitfalls

### Pitfall 1: JSONB Query Syntax in Drizzle
**What goes wrong:** Using JavaScript array methods to filter JSONB fields after fetching all rows, or incorrect JSONB operator syntax.
**Why it happens:** Drizzle's type-safe API doesn't have first-class JSONB array operators; you must use `sql` template literals.
**How to avoid:** Use PostgreSQL's `@>` containment operator for array-in-JSONB queries:
```typescript
// Check if metadata->'style' array contains a value
sql`${productCatalog.metadata}->'style' @> ${JSON.stringify([styleSlug])}::jsonb`

// Check if metadata->'roomTypes' array contains a value
sql`${productCatalog.metadata}->'roomTypes' @> ${JSON.stringify([roomType])}::jsonb`
```
**Warning signs:** Fetching all products then filtering in JS; using `?` operator instead of `@>` for array containment.

### Pitfall 2: Numeric Comparison with String Type
**What goes wrong:** `estimatedPrice` is stored as `numeric(10,2)` in Postgres but comes as string in Drizzle. Direct comparison with number fails.
**Why it happens:** PostgreSQL `numeric` type maps to string in JS to preserve precision.
**How to avoid:** Cast or compare as string:
```typescript
// Use lte with string value
lte(productCatalog.estimatedPrice, String(filters.maxPrice))
// OR use sql for explicit cast
sql`${productCatalog.estimatedPrice}::numeric <= ${filters.maxPrice}`
```

### Pitfall 3: Style Catalog Must Be Seeded Before Style Images
**What goes wrong:** `style_images` has FK to `style_catalog.id`. Seeding images before styles causes FK violations.
**Why it happens:** `seedFromManifest()` looks up `styleCatalog` by slug to get the UUID.
**How to avoid:** Always seed styles first, then images. The existing routes handle this correctly (separate endpoints).

### Pitfall 4: Missing Schema Export in index.ts
**What goes wrong:** New schema file created but not exported from `backend/src/db/schema/index.ts`, so Drizzle doesn't see it for migrations.
**Why it happens:** Easy to forget the barrel export.
**How to avoid:** After creating `product-catalog.schema.ts`, immediately add `export * from './product-catalog.schema.js';` to `index.ts`.

## Code Examples

### Existing Seed Pattern (from StyleService)
```typescript
// Source: backend/src/services/style.service.ts
async seedStyles(): Promise<number> {
  const result = await db
    .insert(styleCatalog)
    .values(SEED_STYLES)
    .onConflictDoNothing({ target: styleCatalog.slug });

  const insertedCount = result.rowCount ?? 0;
  return insertedCount;
}
```

### Existing Style Image Seed Pattern (from StyleImageService)
```typescript
// Source: backend/src/services/style-image.service.ts
// seedFromManifest creates DB records with sourceUrl, no file download
async seedFromManifest(manifests: SeedStyleManifest[]): Promise<number> {
  // For each manifest:
  //   1. Look up style by slug
  //   2. For each image entry, check if already exists by storagePath
  //   3. Insert record with sourceUrl reference
  // Returns count of newly inserted records
}
```

### Existing Seed Route Pattern (from style.routes.ts)
```typescript
// Source: backend/src/routes/style.routes.ts
router.post('/seed', seedStyles);
router.post('/seed-images', seedStyleImages);
```

### Drizzle Migration Script Pattern
```bash
# Generate migration from schema changes
cd backend && npm run db:generate
# Apply migration
npm run db:migrate
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory SEED_PRODUCTS array | Should be DB-backed product_catalog | Current gap | search_products tool limited to 30 hard-coded items |
| Unsplash URLs as sourceUrl only | sourceUrl + optional Supabase Storage upload | Already designed | Works without Supabase; upgradeable later |

**Current state:**
- `search_products` tool calls `ProductService.searchSeedProducts()` which filters `SEED_PRODUCTS` in memory
- `StyleImageService.seedFromManifest()` exists and works but is never called automatically
- Both seed routes exist at `POST /api/styles/seed` and `POST /api/styles/seed-images`
- No equivalent seed route exists for products

## Open Questions

1. **Should `product_catalog.name` have a UNIQUE constraint?**
   - What we know: `styleCatalog.slug` is unique and used as conflict target. Product names in seed data are all unique.
   - Recommendation: Add unique constraint on `name` to enable `onConflictDoNothing`. If products from multiple sources are added later, switch to a composite key (name + brand).

2. **Should the search fall back to in-memory if DB is empty?**
   - What we know: During development, the DB may not be seeded yet. The in-memory search currently works.
   - Recommendation: Keep `searchSeedProducts()` as a fallback method. In `searchProducts()`, check DB first; if zero total products in catalog, fall back to in-memory. Log a warning suggesting seeding.

3. **GIN index on JSONB metadata for style/roomType queries?**
   - What we know: With only 30 products, a GIN index is unnecessary. But if the catalog grows to hundreds, JSONB containment queries benefit from indexing.
   - Recommendation: Skip GIN index for now. Add it later if product count exceeds 100. Document this as a future optimization.

## Sources

### Primary (HIGH confidence)
- `backend/src/data/seed-products.ts` - 30 curated products with SeedProduct interface
- `backend/src/data/seed-style-images.ts` - 25 Unsplash image references across 5 styles
- `backend/src/services/style.service.ts` - Existing seedStyles() pattern with onConflictDoNothing
- `backend/src/services/style-image.service.ts` - Existing seedFromManifest() and uploadImage() patterns
- `backend/src/services/product.service.ts` - Current in-memory searchSeedProducts() implementation
- `backend/src/db/schema/products.schema.ts` - product_recommendations table (per-room, has roomId FK)
- `backend/src/db/schema/styles.schema.ts` - style_catalog table structure (reference for new catalog table)
- `backend/src/config/env.ts` - isStorageEnabled() checks Supabase config

### Secondary (MEDIUM confidence)
- Drizzle ORM JSONB containment operator syntax verified via codebase patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use in this exact codebase
- Architecture: HIGH - patterns directly observed in existing code (StyleService, StyleImageService)
- Pitfalls: HIGH - derived from actual schema shapes and Drizzle behavior observed in codebase

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable - internal codebase patterns unlikely to change)
