# Transaction Patterns

## When to Use Transactions

Transactions ensure multiple writes either all succeed or all fail together. Use them when:
- Creating a parent row and one or more child rows (room + first asset)
- Updating multiple tables that must stay in sync (asset status + variant status)
- Moving an entity between states where intermediate states must not be visible
- Any "delete A then insert B" operation that must be atomic

## 1. Basic Transaction

```typescript
import { db } from '../db/index.js';
import { renovationRooms } from '../db/schema/rooms.schema.js';
import { roomAssets } from '../db/schema/assets.schema.js';

// Create a room and its first asset atomically
const { room, asset } = await db.transaction(async (tx) => {
  const [room] = await tx
    .insert(renovationRooms)
    .values({
      sessionId,
      name: 'Living Room',
      roomType: 'living_room',
    })
    .returning();

  if (!room) throw new Error('Room insert failed');

  const [asset] = await tx
    .insert(roomAssets)
    .values({
      sessionId,
      roomId: room.id,
      assetType: 'photo',
      storagePath: `session_${sessionId}/room_${room.id}/photos/initial.jpg`,
      source: 'user_upload',
      originalFilename: 'photo.jpg',
      contentType: 'image/jpeg',
      fileSize: 1024000,
      status: 'pending',
    })
    .returning();

  if (!asset) throw new Error('Asset insert failed');

  return { room, asset };
});
// If any line above throws, BOTH inserts are rolled back automatically
```

## 2. Transaction with Error Handling

Drizzle automatically rolls back if the callback throws. You just need to handle the error at the call site.

```typescript
import { NotFoundError, ConflictError } from '../utils/errors.js';

async function confirmAndProcess(assetId: string): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      // Lock the row during transaction (SELECT ... FOR UPDATE)
      const [asset] = await tx
        .select()
        .from(roomAssets)
        .where(eq(roomAssets.id, assetId))
        .for('update');  // Row-level lock

      if (!asset) throw new NotFoundError(`Asset not found: ${assetId}`);
      if (asset.status !== 'uploaded') {
        throw new ConflictError(`Asset not in uploadable state: ${asset.status}`);
      }

      // Update asset status
      await tx
        .update(roomAssets)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(eq(roomAssets.id, assetId));

      // Create variant record atomically
      await tx
        .insert(assetVariants)
        .values({
          parentAssetId: assetId,
          variantType: 'thumbnail',
          format: 'webp',
          storagePath: `...`,
          contentType: 'image/webp',
          fileSize: 0,
          processingStatus: 'pending',
        });
    });
  } catch (error) {
    // Transaction already rolled back — just re-throw
    throw error;
  }
}
```

## 3. Transaction with SELECT FOR UPDATE (row lock)

Prevents race conditions when multiple workers might process the same row simultaneously.

```typescript
// Only one worker can process a given asset at a time
const [asset] = await tx
  .select()
  .from(roomAssets)
  .where(
    and(
      eq(roomAssets.id, assetId),
      eq(roomAssets.status, 'uploaded'),
    )
  )
  .for('update')     // Locks the row
  .limit(1);

if (!asset) {
  // Either not found OR already locked by another worker
  return; // Let the other worker handle it
}
```

## 4. Nested Logic in a Transaction

```typescript
// Atomically advance session phase + update all room assets
await db.transaction(async (tx) => {
  // Update session phase
  const [session] = await tx
    .update(renovationSessions)
    .set({ phase: 'RENDER', updatedAt: new Date() })
    .where(
      and(
        eq(renovationSessions.id, sessionId),
        eq(renovationSessions.phase, 'PLAN'),  // Guard: only from PLAN
      )
    )
    .returning();

  if (!session) {
    throw new ConflictError('Session is not in PLAN phase — cannot advance to RENDER');
  }

  // Mark all room photos as ready for rendering
  await tx
    .update(roomAssets)
    .set({ status: 'ready', updatedAt: new Date() })
    .where(
      and(
        eq(roomAssets.sessionId, sessionId),
        eq(roomAssets.assetType, 'photo'),
        eq(roomAssets.status, 'uploaded'),
      )
    );
});
```

## 5. Transaction with Multiple Reads (read-then-write)

```typescript
// Count assets before deciding to proceed
await db.transaction(async (tx) => {
  const [countRow] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(roomAssets)
    .where(
      and(
        eq(roomAssets.roomId, roomId),
        eq(roomAssets.status, 'ready'),
      )
    );

  const readyCount = countRow?.count ?? 0;

  if (readyCount === 0) {
    throw new BadRequestError('No ready assets to process');
  }

  // Proceed with insert knowing count is accurate (within this transaction)
  await tx
    .insert(documentArtifacts)
    .values({
      sessionId,
      roomId,
      phase: 'PLAN',
      format: 'pdf',
      status: 'pending',
      title: `Renovation Plan - ${readyCount} photos`,
    });
});
```

## 6. Propagating tx into Service Methods

When a service method needs to participate in a caller's transaction, accept an optional `tx` parameter:

```typescript
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import type { ExtractTablesWithRelations } from 'drizzle-orm';

type Tx = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof import('../db/schema/index.js'),
  ExtractTablesWithRelations<typeof import('../db/schema/index.js')>
>;

async function createAsset(
  params: NewRoomAsset,
  tx?: Tx,
): Promise<RoomAsset> {
  const client = tx ?? db;  // Use transaction if provided, else global db

  const [asset] = await client
    .insert(roomAssets)
    .values(params)
    .returning();

  if (!asset) throw new Error('Asset creation failed');
  return asset;
}

// Called standalone (auto-commits):
const asset = await createAsset(params);

// Called inside a transaction:
await db.transaction(async (tx) => {
  const room = await createRoom(roomParams, tx);
  const asset = await createAsset({ ...assetParams, roomId: room.id }, tx);
  return { room, asset };
});
```

## 7. Savepoints (nested transactions)

Drizzle doesn't expose savepoints directly, but you can use `sql` to create them manually for partial rollback within a transaction:

```typescript
// If variant creation fails, roll back just that part (not the whole room creation)
await db.transaction(async (tx) => {
  const [room] = await tx.insert(renovationRooms).values(...).returning();

  // Try to create variants — if fails, roll back just this part
  try {
    await tx.execute(sql`SAVEPOINT create_variant`);

    await tx.insert(assetVariants).values(...);

    await tx.execute(sql`RELEASE SAVEPOINT create_variant`);
  } catch {
    await tx.execute(sql`ROLLBACK TO SAVEPOINT create_variant`);
    logger.warn('Variant creation failed — continuing without variants');
  }
  // room creation is unaffected by variant failure
  return room;
});
```

## Transaction Anti-Patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| Long-running transaction with external API calls | Locks held for seconds | Do API calls OUTSIDE the transaction, write result inside |
| Transaction with `await sleep()` or polling | Keeps connection locked | Move polling outside; only use tx for the final write |
| Throwing non-Error in transaction callback | May not trigger rollback in some drivers | Always throw `new Error(...)` or a class extending Error |
| Forgetting `.returning()` on the first insert | `room` is undefined — next insert crashes | Always use `.returning()` and guard with `if (!room) throw` |
| SELECT inside transaction without FOR UPDATE | Race condition if two processes read same row | Add `.for('update')` when the select determines the subsequent write |
