# Race Conditions

## Why They Happen

When a BullMQ worker or LangGraph tool completes work:

```
1. Worker writes to PostgreSQL (INSERT/UPDATE)
2. Worker calls emitToSession() → Socket.io event sent to frontend
3. Frontend receives event, invalidates query
4. TanStack Query re-fetches from REST API
5. REST API queries PostgreSQL → may NOT see the write from step 1
```

Step 5 can fail to see step 1's write because:
- **Connection pool isolation**: Workers and the REST API use different database connections. The worker's connection committed the transaction, but the API's connection may still see the pre-commit state.
- **Transaction visibility**: PostgreSQL's MVCC means a new query may not see a recently committed transaction if the API's connection started a snapshot before the commit.
- **Replication lag**: If using read replicas, the write on the primary hasn't replicated yet.

## Delay Tier System

The `delayedInvalidate()` function adds a configurable delay between receiving the Socket.io event and invalidating the TanStack Query cache:

| Delay | When to Use | Examples |
|---|---|---|
| **100ms** | Event source writes to DB synchronously before emitting. The write and emit happen in the same process. Minimal delay for safety. | `session:phase_changed` (LangGraph tool), `render:started` (worker beginning) |
| **200ms** | Source creates multiple related rows in a single operation. Slightly longer for multi-row write propagation. | `session:rooms_updated` (AI creates rooms + updates session) |
| **500ms** | Worker job completion. Workers use separate DB connections and may run on different processes. The `JOB_COMPLETE_DELAY_MS` constant. | `asset:processing_progress` (ready/failed), `render:complete`, `render:failed` |
| **300ms** | Reconnection recovery. Small delay to let the server re-join the socket room before querying. | `connect` event (second+ connection) |

**Rule of thumb**: If the event emitter and REST API share the same Node.js process and connection pool, use 100-200ms. If they run in separate processes (BullMQ workers), use 500ms.

## The delayedInvalidate Pattern

```typescript
const delayedInvalidate = useCallback(
  (queryKey: readonly unknown[], delayMs = JOB_COMPLETE_DELAY_MS, attempt = 0) => {
    const timer = setTimeout(() => {
      pendingTimers.current.delete(timer);
      logger.info('Invalidating query after delay', {
        queryKey: queryKey.join('/'),
        delayMs,
        attempt,
      });
      queryClient.invalidateQueries({ queryKey });
    }, delayMs);
    pendingTimers.current.add(timer);
  },
  [queryClient],
);
```

**Critical details**:
- Every timer is tracked in `pendingTimers` (a `Set<ReturnType<typeof setTimeout>>`)
- Timers are cleared on unmount to prevent stale invalidations
- The `attempt` parameter enables future retry logic if needed
- Uses `useCallback` with `[queryClient]` dependency to maintain stable reference

## Timer Hygiene

All pending timers must be cleared on cleanup:

```typescript
// Capture ref value for cleanup (React exhaustive-deps rule)
const timers = pendingTimers.current;

return () => {
  // ... socket.off() calls ...

  // Clear pending timers on cleanup
  for (const timer of timers) {
    clearTimeout(timer);
  }
  timers.clear();
};
```

Leaked timers cause:
- Stale query invalidations after navigating away from the session page
- Memory leaks in long-running sessions
- Invalidations targeting the wrong session after session switching

## Diagnosis Checklist

When the UI shows stale data after an event:

### 1. Verify Event Arrives
Open browser DevTools console, filter for `SocketQuerySync`. Every handler logs before invalidating:
```
SocketQuerySync: Render complete — invalidating queries { assetId: "a-1", roomId: "r-1" }
SocketQuerySync: Invalidating query after delay { queryKey: "session/sess-1/rooms", delayMs: 500 }
```

If no log appears: the event is not reaching the frontend. Check backend `emitToSession` call, socket room membership, and network tab.

### 2. Verify Delay Timing
Is 500ms enough? Temporarily increase to 1000ms or 2000ms to test. If the data appears with a longer delay, the original delay is too short for your environment.

Common causes of needing longer delays:
- Remote database (network latency added to write propagation)
- High database load (transaction commit queued)
- Read replica lag

### 3. Verify Query Key
Open React Query DevTools (`@tanstack/react-query-devtools`). After the delay fires:
- Does the targeted query key exist in the cache?
- Does the query re-fetch? (status should flash to `fetching`)
- If the key doesn't match, the invalidation is a no-op

### 4. Verify SessionId Filtering
Every handler filters by `sessionId`:
```typescript
if (data.sessionId !== sessionId) return;
```
If the event's sessionId doesn't match the hook's sessionId, the handler silently returns. Log both values to verify.

### 5. Verify REST API Response
After invalidation, does the API actually return the updated data? The issue might be server-side:
- Check the API route's SQL query
- Check if the API reads from a read replica that's lagging
- Check if the API has its own cache layer returning stale data

### 6. Check for Duplicate Handlers
Multiple `useSocketQuerySync` instances (from route transitions or component remounts) can cause conflicting invalidations. The hook should only exist once in `SessionPageClient`.
