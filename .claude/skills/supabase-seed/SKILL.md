---
name: supabase-seed
description: >
  Seeds the database with products catalog, design styles, and style images using the
  project's idempotent seed patterns. Covers standalone tsx scripts, dev-only HTTP
  endpoints, and creating new seed data files. Use when populating the DB for development,
  adding new seed data categories, or debugging empty catalog issues.
user-invocable: true
---

# /supabase-seed

Database seeding skill for the renovation agent monorepo. Guides seeding products, styles, and style images using the established idempotent patterns — inline TypeScript arrays with `onConflictDoNothing`.

## When to Use

- Setting up a fresh development database
- Adding new seed data (products, styles, style images)
- Debugging "no products found" or empty catalog issues
- Creating a new seed data category (e.g., contractors, materials)

## Invocation

```
/supabase-seed [action]
```

**Examples**:
```
/supabase-seed                           # Seed everything (products + styles + images)
/supabase-seed products                  # Seed products catalog only
/supabase-seed styles                    # Seed styles + style images
/supabase-seed add 10 new lighting products for industrial style
/supabase-seed create contractor seed data
```

## Existing Seed Infrastructure

### Data Files (`backend/src/data/`)

| File | Export | Count | Unique Key |
|---|---|---|---|
| `seed-products.ts` | `SEED_PRODUCTS: SeedProduct[]` | 37 items | `name` (unique constraint) |
| `seed-styles.ts` | `SEED_STYLES: SeedStyle[]` | 5 styles | `slug` (unique constraint) |
| `seed-style-images.ts` | `SEED_STYLE_IMAGES: SeedStyleManifest[]` | 25 images | `storagePath` |
| `index.ts` | Barrel re-exports all three | — | — |

### Seed Mechanisms

| What | How | Command |
|---|---|---|
| **Products** | Standalone `tsx` script | `cd backend && npm run db:seed-products` |
| **Styles** | Dev-only HTTP endpoint | `POST http://localhost:3000/api/styles/seed` |
| **Style Images** | Dev-only HTTP endpoint | `POST http://localhost:3000/api/styles/seed-images` |

## Workflow: Seed Everything

### Step 1: Verify DB Connection

```bash
cd backend && npm run db:check-tables
```

Should show 12+ tables. If not, run migrations first: `npm run db:migrate`

### Step 2: Seed Products (standalone script)

```bash
cd backend && npm run db:seed-products
```

The script uses `onConflictDoNothing({ target: productsCatalog.name })` — safe to re-run.

### Step 3: Seed Styles (requires running server)

```bash
# Terminal 1: Start backend
cd backend && npm run dev

# Terminal 2: Seed styles
curl -X POST http://localhost:3000/api/styles/seed
curl -X POST http://localhost:3000/api/styles/seed-images
```

These endpoints only exist when `NODE_ENV=development`. They return 403 in production.

### Step 4: Verify

```bash
cd backend && npm run db:studio
```

Check `products_catalog`, `style_catalog`, and `style_images` tables in Drizzle Studio.

## Workflow: Add New Seed Data

### Adding Products

Edit `backend/src/data/seed-products.ts`:

```typescript
export const SEED_PRODUCTS: SeedProduct[] = [
  // ...existing products
  {
    name: 'Unique Product Name',        // MUST be unique (conflict key)
    description: 'Product description',
    category: 'lighting',               // Must match ProductCategory type
    priceRange: '$100-$200',
    currency: 'USD',
    sourceUrl: 'https://example.com/product',
    imageUrl: 'https://example.com/image.jpg',
    metadata: {
      brand: 'BrandName',
      style: ['industrial', 'modern-minimalist'],
      roomTypes: ['living-room', 'bedroom'],
      material: 'brass',
    },
  },
];
```

**Conventions**:
- `category` must be one of: `flooring`, `lighting`, `furniture`, `fixtures`, `paint`, `hardware`
- `style` array uses slugs from `SEED_STYLES` (e.g., `modern-minimalist`, `japandi`)
- `roomTypes` uses slugs from `ROOM_TYPES` in shared-types
- `metadata` fields are JSONB — flexible but use existing patterns

### Adding Styles

Edit `backend/src/data/seed-styles.ts`:

```typescript
export const SEED_STYLES: SeedStyle[] = [
  // ...existing styles
  {
    slug: 'art-deco',                    // kebab-case, unique
    name: 'Art Deco',
    description: 'Glamorous geometric patterns...',
    colorPalette: ['#1a1a2e', '#e6b31e', '#f0e6d3'],
    materials: ['marble', 'brass', 'velvet', 'lacquer'],
    keywords: ['geometric', 'glamour', 'gold', 'symmetry'],
    metadata: {
      suitableRooms: ['living-room', 'bedroom', 'bathroom'],
      era: '1920s-1930s',
      origin: 'France',
    },
  },
];
```

### Adding Style Images

Edit `backend/src/data/seed-style-images.ts`:

```typescript
export const SEED_STYLE_IMAGES: SeedStyleManifest[] = [
  // ...existing manifests
  {
    styleSlug: 'art-deco',
    images: [
      {
        filename: 'art-deco-living-room.jpg',
        sourceUrl: 'https://images.unsplash.com/photo-xxx',
        alt: 'Art deco living room with geometric wallpaper',
        tags: ['living-room', 'geometric', 'gold-accents'],
        isPrimary: true,
      },
      // 4 more images...
    ],
  },
];
```

**Convention**: 5 images per style, one with `isPrimary: true`.

## Workflow: Create New Seed Category

For a completely new data type (e.g., contractors, materials):

### Step 1: Create Data File

Create `backend/src/data/seed-{category}.ts`:

```typescript
import type { New{Category} } from '../db/schema/index.js';

export interface Seed{Category} {
  // Omit auto-generated fields
  name: string;
  // ...other fields
}

export const SEED_{CATEGORY}: Seed{Category}[] = [
  // data...
];
```

### Step 2: Add to Barrel

```typescript
// backend/src/data/index.ts
export { SEED_{CATEGORY}, type Seed{Category} } from './seed-{category}.js';
```

### Step 3: Create Seed Script

Create `backend/scripts/seed-{category}.ts`:

```typescript
import { db, pool } from '../src/db/index.js';
import { myTable } from '../src/db/schema/index.js';
import { SEED_DATA } from '../src/data/index.js';
import { Logger } from '../src/utils/logger.js';

const logger = new Logger({ serviceName: 'seed-{category}' });

async function main(): Promise<void> {
  try {
    logger.info('Starting seed', { count: SEED_DATA.length });

    const result = await db
      .insert(myTable)
      .values(SEED_DATA)
      .onConflictDoNothing({ target: myTable.uniqueColumn });

    const inserted = result.rowCount ?? 0;
    logger.info('Seed complete', { inserted, total: SEED_DATA.length });
  } catch (error) {
    logger.error('Seed failed', error as Error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
```

### Step 4: Add npm Script

```json
// backend/package.json
"db:seed-{category}": "tsx scripts/seed-{category}.ts"
```

### Step 5: Verify

```bash
cd backend && npm run db:seed-{category}
cd backend && npm run db:studio  # inspect table
```

## Idempotency Patterns

| Strategy | When to Use | Example |
|---|---|---|
| `onConflictDoNothing()` | Insert-only, keep existing data | Products, styles |
| `onConflictDoUpdate()` | Upsert, update existing records | Style images (update metadata) |
| Pre-check `SELECT` | Complex logic before insert | Style images (skip if storage path exists) |

**Always use a unique constraint column as the conflict target.**

## Common Mistakes

| Mistake | Fix |
|---|---|
| Seed fails with "relation does not exist" | Run `npm run db:migrate` first |
| Products not appearing after seed | Check `onConflictDoNothing` — products may already exist with same name |
| Style seed returns 404 | Ensure `NODE_ENV=development` and server is running |
| Pool hangs after script | Ensure `pool.end()` is in the `finally` block |
| Missing barrel export | Add to `backend/src/data/index.ts` |
