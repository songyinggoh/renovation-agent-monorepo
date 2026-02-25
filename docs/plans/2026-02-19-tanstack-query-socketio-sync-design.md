# TanStack Query + Socket.io Sync Design

**Date**: 2026-02-19
**Status**: Approved
**Approach**: Wire & Extend (Approach 1)

## Problem Statement

Three sync problems exist between the Socket.io real-time layer and TanStack Query cache:

1. **Race conditions**: Workers write to DB then emit Socket.io events. If the frontend queries REST immediately on the event, DB writes may not have propagated (especially across replicas).
2. **Missed events during reconnection**: Events fired during a Socket.io disconnect window are lost forever. No recovery mechanism exists.
3. **No optimistic UI for async generation**: Render generation and image processing show no in-progress states. Session/room queries are fully pessimistic.

## Current Architecture

- `useChat` handles Socket.io connection, chat streaming, and emits `window.CustomEvent` for session-level events
- `session-page-client.tsx` listens to `window.CustomEvent` with a 2s debounce and calls `refetchSession()`/`refetchRooms()`
- `useSocketQuerySync` exists but is **never wired in** — it handles delayed invalidation and reconnect recovery
- No progress tracking for async operations (image optimization, render generation)

## Design

### 1. Lift useChat to SessionPageClient

Move `useChat(sessionId)` from `ChatView` to `SessionPageClient`. This makes `socketRef` available for `useSocketQuerySync` without a context provider.

`ChatView` becomes presentational, receiving chat props:
- `messages`, `sendMessage`, `isConnected`, `error`, `isAssistantTyping`, `isLoadingHistory`

### 2. Wire useSocketQuerySync + Remove Legacy Bridge

In `SessionPageClient`:
- Call `useSocketQuerySync({ sessionId, socketRef })`
- Remove the `window.addEventListener('session:update', ...)` effect block
- Remove `lastRefetchRef`

In `useChat`:
- Remove both `window.dispatchEvent(new CustomEvent(...))` calls for `session:rooms_updated` and `session:phase_changed`
- Keep the event listeners registered (useSocketQuerySync listens on the same socket)
- Add message history re-fetch on reconnection

### 3. Shared Types for Render Events

Add to `packages/shared-types/src/socket-events.ts`:

```typescript
interface RenderStartedPayload {
  assetId: string;
  roomId: string;
  sessionId: string;
}

interface RenderCompletePayload {
  assetId: string;
  roomId: string;
  contentType: string;
  sizeBytes: number;
  model: string;
}

interface RenderFailedPayload {
  assetId: string;
  roomId: string;
  error: string;
}
```

Add `render:started`, `render:complete`, `render:failed` to `ServerToClientEvents`.

### 4. Progress Tracking Hooks

**`useAssetProcessingState(socketRef, sessionId)`**
- Local state: `Map<assetId, { status, progress, variantType }>`
- Listens to `asset:processing_progress` events
- Clears entries when status is `ready` or `failed` (after a short display delay)
- On reconnect: clears all state (graceful degradation)

**`useRenderState(socketRef, sessionId)`**
- Local state: `Map<assetId, { status: 'started' | 'complete' | 'failed', roomId }>`
- Listens to `render:started`, `render:complete`, `render:failed`
- On reconnect: clears all state

These hooks use local state driven by Socket.io events. They don't replace TanStack Query — they augment it with real-time progress that doesn't need REST polling.

### 5. Reconnection Recovery

On reconnect, `useSocketQuerySync`:
- Invalidates all `['session', sessionId, ...]` queries (catches missed state changes)
- Delay of 300ms lets server re-join the room

On reconnect, `useChat`:
- Re-fetches message history (catches missed messages)

On reconnect, progress hooks:
- Clear in-flight state (we don't know what happened during the gap)
- Query invalidation from useSocketQuerySync fetches the final state from REST

### 6. useChat Reconnection Message Sync

Currently `useChat` loads message history only on `chat:session_joined`. On reconnect, the socket reconnects and re-joins, triggering `chat:session_joined` again, which calls `loadMessageHistory()`. However, this replaces the entire message list — losing any optimistically added messages.

Fix: On reconnect, merge server history with local state rather than replacing. Messages are keyed by `id`, so we can deduplicate.

## Files Changed

| File | Change |
|------|--------|
| `frontend/hooks/useChat.ts` | Expose `socketRef`, remove CustomEvent dispatches, add reconnect message merge |
| `frontend/components/session/session-page-client.tsx` | Lift useChat, wire useSocketQuerySync, remove legacy bridge |
| `frontend/components/chat/chat-view.tsx` | Accept chat props instead of calling useChat |
| `frontend/hooks/useSocketQuerySync.ts` | Add render:started handler, minor type improvements |
| `packages/shared-types/src/socket-events.ts` | Add render event types to ServerToClientEvents |
| `frontend/hooks/useAssetProcessingState.ts` | New: progress tracking for image optimization |
| `frontend/hooks/useRenderState.ts` | New: progress tracking for render generation |

## Non-Goals

- Switching chat messages to TanStack Query (chat uses local state + Socket.io streaming, which is correct)
- Orphaned pending asset cleanup (tracked separately)
- Polling fallback for environments where WebSocket is blocked
