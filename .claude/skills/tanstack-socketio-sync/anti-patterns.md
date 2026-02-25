# Anti-Patterns

## 1. window.CustomEvent Bridge

```typescript
// BAD: Fragile, out-of-band from React lifecycle
// useChat.ts
socket.on('session:rooms_updated', () => {
  window.dispatchEvent(new CustomEvent('session:update', { detail: { type: 'rooms_updated' } }));
});

// SessionPageClient.tsx
useEffect(() => {
  const handler = () => refetchRooms();
  window.addEventListener('session:update', handler);
  return () => window.removeEventListener('session:update', handler);
}, [refetchRooms]);
```

**Why it's wrong**: CustomEvents bypass React's lifecycle. They can fire after unmount, don't benefit from React's batching, have no type safety, and create an invisible side-channel that's hard to debug. The previous implementation used this pattern with a 2-second debounce — now replaced with direct `queryClient.invalidateQueries` from `useSocketQuerySync`.

**Fix**: Use `useSocketQuerySync` for all event-to-cache wiring.

---

## 2. Manual refetch() from Components

```typescript
// BAD: Component should not know about Socket.io events
function RoomCard({ roomId }: { roomId: string }) {
  const { refetch } = useSessionRooms(sessionId);

  useEffect(() => {
    const handler = () => refetch();
    window.addEventListener('rooms-updated', handler);
    return () => window.removeEventListener('rooms-updated', handler);
  }, [refetch]);
}
```

**Why it's wrong**: Scatters sync logic across components. Multiple components may refetch simultaneously. No delay to handle race conditions. Impossible to audit which events trigger which queries.

**Fix**: All invalidation goes through `useSocketQuerySync`. Components just consume query data.

---

## 3. Immediate Invalidation Without Delay

```typescript
// BAD: Races with DB write propagation
socket.on('render:complete', () => {
  queryClient.invalidateQueries({ queryKey: sessionRoomsQueryKey(sessionId) });
});
```

**Why it's wrong**: The worker emits the event immediately after its DB write, but the API may read from a different connection that hasn't seen the commit yet. The re-fetch returns stale data, and the user sees the old state.

**Fix**: Always use `delayedInvalidate()` with an appropriate delay tier.

---

## 4. Broad Invalidation for Specific Events

```typescript
// BAD: phase_changed only affects session data, not rooms
socket.on('session:phase_changed', () => {
  queryClient.invalidateQueries({ queryKey: ['session', sessionId] }); // Invalidates EVERYTHING
});
```

**Why it's wrong**: `['session', sessionId]` is a prefix match — it invalidates BOTH `['session', sessionId]` (session data) AND `['session', sessionId, 'rooms']` (room data). This triggers an unnecessary rooms re-fetch that wastes bandwidth and slows down the UI.

**Fix**: Target the narrowest query key. For `phase_changed`, only invalidate `sessionQueryKey(sessionId)`.

---

## 5. Missing Listener Cleanup

```typescript
// BAD: No cleanup — handler leaks and fires after unmount
useEffect(() => {
  socket.on('render:complete', handler);
  // Missing: return () => socket.off('render:complete', handler);
}, []);
```

**Why it's wrong**: If the user navigates away and back, a new handler is registered without removing the old one. Now two handlers fire for every event, causing double invalidation. After many navigations, dozens of handlers accumulate.

**Fix**: Always clean up in the useEffect return:
```typescript
return () => {
  socket.off('render:complete', handler);
};
```

---

## 6. Missing Timer Cleanup

```typescript
// BAD: Timer fires after component unmount
const handleComplete = () => {
  setTimeout(() => {
    queryClient.invalidateQueries({ queryKey });
  }, 500);
};
```

**Why it's wrong**: If the user navigates away within 500ms, the timer fires against a stale session. The invalidation targets a query key that may belong to the previous session, or the component tree no longer exists.

**Fix**: Track all timers in `pendingTimers` and clear them on cleanup:
```typescript
const timer = setTimeout(() => { ... }, 500);
pendingTimers.current.add(timer);
// Cleanup:
for (const timer of pendingTimers.current) clearTimeout(timer);
```

---

## 7. Separate Sync Hooks Per Event Type

```typescript
// BAD: Fragments sync logic across multiple hooks
function useRenderSync(socketRef, sessionId) { /* render events */ }
function useAssetSync(socketRef, sessionId) { /* asset events */ }
function useSessionSync(socketRef, sessionId) { /* session events */ }
```

**Why it's wrong**: Each hook manages its own timers, cleanup, and reconnection recovery. Reconnection recovery must invalidate ALL query types — splitting across hooks means each hook only recovers its own queries. Debugging requires checking multiple files.

**Fix**: Single `useSocketQuerySync` hook handles ALL event-to-cache sync. The dedicated hooks (`useAssetProcessingState`, `useRenderState`) are for ephemeral UI state only — they do NOT call `queryClient.invalidateQueries`.

---

## 8. Creating Additional Socket Connections

```typescript
// BAD: Second socket connection for sync events
function useSocketSync(sessionId: string) {
  const socket = io('http://localhost:3000'); // NEW connection!
  socket.on('render:complete', ...);
}
```

**Why it's wrong**: Doubles the number of WebSocket connections. The server may apply rate limits or authentication differently. Room membership is per-connection, so the sync socket would need its own `chat:join_session` call.

**Fix**: `useChat` is the single socket owner. All other hooks receive `socketRef` via props.

---

## 9. Polling Instead of Events

```typescript
// BAD: Polling for job status
const { data } = useQuery({
  queryKey: ['render-status', assetId],
  queryFn: () => fetchWithAuth(`/api/renders/${assetId}/status`),
  refetchInterval: 2000, // Poll every 2 seconds
});
```

**Why it's wrong**: Wastes bandwidth and server resources. Creates a minimum 2-second delay between job completion and UI update. Doesn't scale with number of concurrent jobs.

**Fix**: Use Socket.io events for real-time status + `delayedInvalidate` for cache sync.

---

## 10. Ignoring SessionId Filtering

```typescript
// BAD: Handles events from ALL sessions
const handlePhaseChanged = (data: { sessionId: string; phase: string }) => {
  delayedInvalidate(sessionQueryKey(data.sessionId), 100); // Wrong sessionId!
};
```

**Why it's wrong**: The handler uses `data.sessionId` instead of the hook's `sessionId`. In a multi-tab scenario or if the user switches sessions, this invalidates the wrong query. The hook should only care about events for its own session.

**Fix**: Always filter first, then use the hook's `sessionId`:
```typescript
if (data.sessionId !== sessionId) return;
delayedInvalidate(sessionQueryKey(sessionId), 100);
```
