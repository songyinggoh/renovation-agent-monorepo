# Reconnection Recovery

## The Problem

When the Socket.io connection drops (WiFi switch, server restart, network interruption), events emitted during the gap are lost. Socket.io does NOT queue events for offline clients. When the client reconnects, it has no way to know what changed.

## Gap Window Analysis

During a disconnection window, these events can be missed:
- `session:rooms_updated` — rooms created/modified by AI tool
- `session:phase_changed` — session advanced to next phase
- `asset:processing_progress` — image optimization started/completed/failed
- `render:started/complete/failed` — render generation lifecycle

The impact of missing each event:
- **Rooms/phase**: UI shows stale session state until manual refresh
- **Asset progress**: UI shows "processing" indefinitely for a completed asset
- **Render status**: UI shows no render when one actually completed

## Recovery Strategy: Broad Invalidation

On reconnection, invalidate ALL session-scoped queries to catch any missed events:

```typescript
const handleConnect = () => {
  if (hasConnectedOnce.current) {
    // This is a reconnection — invalidate everything
    logger.info('Socket reconnected — recovering missed events', { sessionId });
    delayedInvalidate(sessionQueryKey(sessionId), 300);
    delayedInvalidate(sessionRoomsQueryKey(sessionId), 300);
  }
  hasConnectedOnce.current = true;
};
```

**Key details**:
- `hasConnectedOnce` guard prevents invalidation on initial connection (no events to miss)
- 300ms delay lets the server re-join the socket room before queries fire
- Both `sessionQueryKey` AND `sessionRoomsQueryKey` are invalidated (broad sweep)

## First-Connect Guard

```typescript
const hasConnectedOnce = useRef(false);
```

On first `connect`, no recovery is needed — the user just loaded the page and TanStack Query's initial fetch is already in flight. The guard ensures we only do recovery invalidation on the SECOND and subsequent `connect` events.

## Progress State Hooks: Clear on Reconnect

The optimistic progress hooks (`useAssetProcessingState`, `useRenderState`) track in-flight job status via Socket.io events. On reconnection, this state is unreliable — a job may have completed during the gap. Both hooks clear their state on reconnect:

```typescript
// useAssetProcessingState
const handleConnect = () => {
  clearAll(); // Clears processingAssets Map + cancels removal timers
};
socket.on('connect', handleConnect);

// useRenderState
const handleConnect = () => {
  clearAll(); // Clears activeRenders Map + cancels removal timers
};
socket.on('connect', handleConnect);
```

The `useSocketQuerySync` reconnection handler then fetches the true state from REST, which shows final statuses (ready/failed/complete) instead of the optimistic "processing" state.

## Adding New Query Types to Reconnection

When you add a new TanStack Query hook (e.g., `useSessionDocuments`):

### If the query key is prefixed with `['session', sessionId]`:
No changes needed. The existing `invalidateQueries({ queryKey: ['session', sessionId] })` catches it automatically because TanStack Query does prefix matching.

However, the current implementation invalidates `sessionQueryKey` and `sessionRoomsQueryKey` separately (not the broad prefix). So you need to add the new key:

```typescript
const handleConnect = () => {
  if (hasConnectedOnce.current) {
    delayedInvalidate(sessionQueryKey(sessionId), 300);
    delayedInvalidate(sessionRoomsQueryKey(sessionId), 300);
    delayedInvalidate(sessionDocumentsQueryKey(sessionId), 300); // ADD THIS
  }
  hasConnectedOnce.current = true;
};
```

### If the query key has a different prefix:
You MUST add it to the reconnection handler. Otherwise, events missed during the gap will never be recovered.

## Socket.io Reconnection Config

The connection is configured in `useChat.ts`:

```typescript
socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000', {
  auth: token ? { token } : {},
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
```

- Up to 5 reconnection attempts
- 1 second between attempts
- Falls back to polling if WebSocket fails
- After 5 failures, connection is abandoned (user must refresh)

## Room Re-join on Reconnect

When Socket.io reconnects, the client's room memberships are lost. The `useChat` hook re-joins on `connect`:

```typescript
socket.on('connect', () => {
  socket.emit('chat:join_session', { sessionId });
});
```

This fires before `useSocketQuerySync`'s `handleConnect`. The 300ms delay in the sync handler ensures the room join has completed before queries are invalidated (otherwise the server wouldn't know which session's data to include).
