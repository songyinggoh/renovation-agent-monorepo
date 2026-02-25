# Optimistic UI Patterns

## Two Strategies

This codebase uses two complementary strategies for optimistic UI with async jobs:

### Strategy 1: Fast Invalidation (Current, Simpler)

For job-started events, use a short delay (100ms) so TanStack Query re-fetches quickly and picks up the "processing" status from the database:

```typescript
const handleRenderStarted = (data: { assetId: string; roomId: string; sessionId: string }) => {
  if (data.sessionId !== sessionId) return;
  logger.info('Render started', { assetId: data.assetId, roomId: data.roomId });
  // Short delay — the DB already has the "started" status
  delayedInvalidate(sessionRoomsQueryKey(sessionId), 100);
};
```

**Pros**: Simple, no manual cache manipulation, always consistent with server
**Cons**: 100ms + network round-trip delay before UI updates

### Strategy 2: setQueryData (When Immediate Response Needed)

For cases where even 100ms + re-fetch latency is too slow, directly mutate the TanStack Query cache:

```typescript
const handleJobStarted = (data: { assetId: string }) => {
  queryClient.setQueryData(queryKey, (old: DataType | undefined) => {
    if (!old) return old;
    return {
      ...old,
      items: old.items.map(item =>
        item.id === data.assetId
          ? { ...item, status: 'generating' }
          : item
      ),
    };
  });
  // Still invalidate on completion to reconcile with server truth
};
```

**Pros**: Instant UI update, no network round-trip
**Cons**: Must manually maintain cache shape, rollback on failure, risk of cache/server divergence

## Current Implementation: Progress State Hooks

For in-flight job tracking, the codebase uses dedicated state hooks instead of manipulating TanStack Query cache. These provide real-time progress without REST polling:

### useAssetProcessingState

Tracks image optimization jobs:

```typescript
interface AssetProcessingEntry {
  assetId: string;
  status: 'processing' | 'ready' | 'failed';
  progress: number;       // 0-100
  variantType?: string;   // Which variant is being processed
}
```

- Listens to `asset:processing_progress` events
- Maintains a `Map<string, AssetProcessingEntry>` with real-time status
- Auto-removes completed/failed entries after 2 seconds (`COMPLETION_DISPLAY_MS`)
- Clears all state on reconnection (REST re-fetch handles final state)

### useRenderState

Tracks AI render generation jobs:

```typescript
interface RenderEntry {
  assetId: string;
  roomId: string;
  status: 'started' | 'complete' | 'failed';
  error?: string;
}
```

- Listens to `render:started`, `render:complete`, `render:failed`
- Maintains a `Map<string, RenderEntry>` with real-time status
- Auto-removes completed renders after 3 seconds, failed after 5 seconds
- Clears all state on reconnection

### Division of Responsibility

```
useAssetProcessingState / useRenderState
  └── Real-time progress display (spinners, progress bars, status badges)
  └── Ephemeral state — cleared on reconnect, auto-removed on completion

useSocketQuerySync
  └── Cache invalidation (triggers REST re-fetch for permanent data)
  └── Ensures TanStack Query cache reflects final DB state
```

The progress hooks give instant visual feedback. The sync hook ensures the permanent query cache is updated when jobs complete.

## Timed Removal Pattern

Both progress hooks auto-remove completed/failed entries after a display period:

```typescript
const COMPLETION_DISPLAY_MS = 2000; // Asset processing
const COMPLETE_DISPLAY_MS = 3000;   // Render success
const FAILED_DISPLAY_MS = 5000;     // Render failure (shown longer)

if (data.status === 'ready' || data.status === 'failed') {
  const existing = removalTimers.current.get(data.assetId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    removalTimers.current.delete(data.assetId);
    setProcessingAssets((prev) => {
      const next = new Map(prev);
      next.delete(data.assetId);
      return next;
    });
  }, COMPLETION_DISPLAY_MS);

  removalTimers.current.set(data.assetId, timer);
}
```

**Key details**:
- Previous timer for the same asset is cleared before setting a new one (handles rapid status changes)
- Timers are tracked in a `Map<assetId, timer>` for cleanup on unmount
- Longer display for failures so users can read error messages

## Designing Optimistic UI for a New Pipeline

When adding a new async pipeline (e.g., document generation, payment processing):

### Step 1: Identify Events
What Socket.io events will the backend emit?
- Job started (e.g., `doc:generation_started`)
- Progress updates (optional, e.g., `doc:generation_progress`)
- Job completed (e.g., `doc:generation_complete`)
- Job failed (e.g., `doc:generation_failed`)

### Step 2: Choose Progress Strategy
Does the UI need real-time progress (spinner, percentage)?
- **Yes** → Create a `useDocGenerationState` hook following the `useRenderState` pattern
- **No** → Just add handlers in `useSocketQuerySync` with appropriate delays

### Step 3: Add Cache Sync
In `useSocketQuerySync`:
- Started event: 100ms delay (or no invalidation if progress hook handles display)
- Complete event: 500ms delay (worker DB write propagation)
- Failed event: 500ms delay (error status must propagate)

### Step 4: Handle Reconnection
- If you created a progress hook: add `clearAll()` on `connect`
- In `useSocketQuerySync`: add the new query key to `handleConnect`

### Step 5: Handle Failure States
The failure handler must:
1. Update the progress hook to show error state
2. Invalidate the TanStack Query cache so the permanent UI reflects the failure
3. Show the failure state long enough for the user to read it

## User-Initiated Optimistic Mutations

For user actions (not background jobs), use TanStack Query's `useMutation` with `onMutate`:

```typescript
const mutation = useMutation({
  mutationFn: (data) => fetchWithAuth('/api/endpoint', { method: 'POST', body: data }),
  onMutate: async (newData) => {
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData(queryKey);
    queryClient.setQueryData(queryKey, (old) => ({ ...old, ...newData }));
    return { previous };
  },
  onError: (_err, _newData, context) => {
    queryClient.setQueryData(queryKey, context?.previous); // Rollback
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey }); // Reconcile with server
  },
});
```

This pattern is for synchronous user actions (e.g., rename room, update budget) where the REST API response confirms the mutation. For async background jobs, use the progress hook pattern instead.
