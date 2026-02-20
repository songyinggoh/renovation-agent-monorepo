# Join, Select, Aggregate & Pagination Patterns

## 1. Basic Join (innerJoin)

```typescript
import { db } from '../db/index.js';
import { roomAssets } from '../db/schema/assets.schema.js';
import { assetVariants } from '../db/schema/asset-variants.schema.js';
import { eq } from 'drizzle-orm';

// Get all variants for a specific asset
const rows = await db
  .select()
  .from(roomAssets)
  .innerJoin(assetVariants, eq(assetVariants.parentAssetId, roomAssets.id))
  .where(eq(roomAssets.id, assetId));

// rows is: Array<{ room_assets: RoomAsset; asset_variants: AssetVariant }>
// Access with: rows[0].room_assets, rows[0].asset_variants
```

## 2. Left Join (optional relation)

```typescript
import { renovationRooms } from '../db/schema/rooms.schema.js';
import { leftJoin } from 'drizzle-orm'; // NOT needed — leftJoin is a method

// Get all rooms with their asset count (rooms with no assets still appear)
const rows = await db
  .select({
    room: renovationRooms,
    firstAsset: roomAssets,       // null if no assets
  })
  .from(renovationRooms)
  .leftJoin(roomAssets, eq(roomAssets.roomId, renovationRooms.id))
  .where(eq(renovationRooms.sessionId, sessionId));

// firstAsset may be null — always guard:
for (const row of rows) {
  const asset = row.firstAsset; // RoomAsset | null
  if (asset) { /* ... */ }
}
```

## 3. Three-Table Join

```typescript
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { renovationRooms } from '../db/schema/rooms.schema.js';
import { roomAssets } from '../db/schema/assets.schema.js';
import { eq, and } from 'drizzle-orm';

// Get all assets for a session (across all rooms)
const rows = await db
  .select({
    sessionId: renovationSessions.id,
    roomId: renovationRooms.id,
    roomName: renovationRooms.name,
    asset: roomAssets,
  })
  .from(renovationSessions)
  .innerJoin(renovationRooms, eq(renovationRooms.sessionId, renovationSessions.id))
  .innerJoin(roomAssets, eq(roomAssets.roomId, renovationRooms.id))
  .where(
    and(
      eq(renovationSessions.id, sessionId),
      eq(roomAssets.status, 'ready'),
    )
  )
  .orderBy(renovationRooms.name, roomAssets.displayOrder);
```

## 4. Partial Select (pick only needed columns)

Use this to avoid fetching large JSONB blobs or heavy columns you don't need.

```typescript
// Select specific columns — result type is inferred automatically
const assets = await db
  .select({
    id: roomAssets.id,
    status: roomAssets.status,
    storagePath: roomAssets.storagePath,
    assetType: roomAssets.assetType,
    // metadata NOT selected — saves bandwidth if you don't need it
  })
  .from(roomAssets)
  .where(eq(roomAssets.roomId, roomId));

// TypeScript infers: Array<{ id: string; status: string; storagePath: string; assetType: string }>
```

## 5. Aggregate Counts

```typescript
import { sql, count, eq } from 'drizzle-orm';

// Count total assets in a room
const [result] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(roomAssets)
  .where(eq(roomAssets.roomId, roomId));

const total = result?.count ?? 0;

// Count by assetType (group by)
const countsByType = await db
  .select({
    assetType: roomAssets.assetType,
    count: sql<number>`count(*)::int`,
    totalBytes: sql<number>`sum(file_size)::int`,
  })
  .from(roomAssets)
  .where(eq(roomAssets.roomId, roomId))
  .groupBy(roomAssets.assetType)
  .orderBy(roomAssets.assetType);

// countsByType: Array<{ assetType: string; count: number; totalBytes: number }>
```

## 6. Count with Left Join (include zero-count rows)

```typescript
import { renovationRooms } from '../db/schema/rooms.schema.js';
import { roomAssets } from '../db/schema/assets.schema.js';
import { eq, sql } from 'drizzle-orm';

// Asset count per room — rooms with 0 assets included
const roomCounts = await db
  .select({
    roomId: renovationRooms.id,
    roomName: renovationRooms.name,
    assetCount: sql<number>`count(${roomAssets.id})::int`,
  })
  .from(renovationRooms)
  .leftJoin(roomAssets, eq(roomAssets.roomId, renovationRooms.id))
  .where(eq(renovationRooms.sessionId, sessionId))
  .groupBy(renovationRooms.id, renovationRooms.name)
  .orderBy(renovationRooms.name);
```

## 7. Offset Pagination

```typescript
const PAGE_SIZE = 20;

async function getAssets(roomId: string, page: number): Promise<RoomAsset[]> {
  return db
    .select()
    .from(roomAssets)
    .where(eq(roomAssets.roomId, roomId))
    .orderBy(desc(roomAssets.createdAt))
    .limit(PAGE_SIZE)
    .offset(page * PAGE_SIZE);
}
```

## 8. Cursor Pagination (more efficient for large tables)

Cursor pagination avoids `OFFSET` cost — use `createdAt` + `id` as compound cursor.

```typescript
import { and, lt, eq, desc, or } from 'drizzle-orm';

interface Cursor {
  createdAt: Date;
  id: string;
}

async function getMessagesBefore(
  sessionId: string,
  cursor: Cursor | null,
  limit = 50,
) {
  return db
    .select()
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.sessionId, sessionId),
        cursor
          ? or(
              lt(chatMessages.createdAt, cursor.createdAt),
              and(
                eq(chatMessages.createdAt, cursor.createdAt),
                lt(chatMessages.id, cursor.id),
              ),
            )
          : undefined,
      )
    )
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(limit);
}
```

## 9. inArray (WHERE IN)

```typescript
import { inArray } from 'drizzle-orm';

// Fetch multiple specific assets by ID
const assets = await db
  .select()
  .from(roomAssets)
  .where(inArray(roomAssets.id, assetIds));   // assetIds: string[]
```

## 10. Conditional WHERE Clauses

Build the WHERE dynamically without `any`:

```typescript
import { and, eq, isNull, SQL } from 'drizzle-orm';

function buildAssetFilter(params: {
  roomId: string;
  assetType?: string;
  status?: string;
  uploadedBy?: string | null;
}): SQL | undefined {
  const conditions: (SQL | undefined)[] = [
    eq(roomAssets.roomId, params.roomId),
    params.assetType ? eq(roomAssets.assetType, params.assetType) : undefined,
    params.status ? eq(roomAssets.status, params.status) : undefined,
    params.uploadedBy === null
      ? isNull(roomAssets.uploadedBy)
      : params.uploadedBy
        ? eq(roomAssets.uploadedBy, params.uploadedBy)
        : undefined,
  ];

  return and(...conditions.filter((c): c is SQL => c !== undefined));
}

const assets = await db
  .select()
  .from(roomAssets)
  .where(buildAssetFilter({ roomId, assetType: 'photo', status: 'ready' }));
```

## 11. Exists Subquery Check

```typescript
import { sql, eq } from 'drizzle-orm';

// Check if a session has any ready assets
const [row] = await db
  .select({
    hasReadyAssets: sql<boolean>`
      EXISTS (
        SELECT 1 FROM room_assets ra
        WHERE ra.session_id = ${sessionId}
          AND ra.status = 'ready'
      )
    `,
  })
  .from(renovationSessions)
  .where(eq(renovationSessions.id, sessionId))
  .limit(1);

const hasReadyAssets = row?.hasReadyAssets ?? false;
```
