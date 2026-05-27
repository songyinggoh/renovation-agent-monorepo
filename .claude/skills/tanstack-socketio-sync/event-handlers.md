# Event Handler Design

## Handler Template

Every handler in `useSocketQuerySync` follows this structure:

```typescript
const handleEventName = (data: EventPayloadType) => {
  // 1. Session scoping — ignore events from other sessions
  if (data.sessionId !== sessionId) return;

  // 2. Structured logging with relevant context
  logger.info('Description of what happened', {
    sessionId,
    ...relevantFields,
  });

  // 3. Delayed invalidation targeting the narrowest query key
  delayedInvalidate(targetQueryKey(sessionId), appropriateDelayMs);
};

// 4. Registration in useEffect body
socket.on('namespace:event_name', handleEventName);

// 5. Cleanup in useEffect return
socket.off('namespace:event_name', handleEventName);
```

## Event → Query Key Mapping

| Socket.io Event | Payload | Delay | Query Keys Invalidated | Source |
|---|---|---|---|---|
| `session:rooms_updated` | `{ sessionId, rooms }` | 200ms | `sessionRoomsQueryKey`, `sessionQueryKey` | `save_intake_state` tool |
| `session:phase_changed` | `{ sessionId, phase }` | 100ms | `sessionQueryKey` | `save_intake_state` tool |
| `asset:processing_progress` | `{ assetId, status, progress }` | 500ms | `sessionRoomsQueryKey` (only on ready/failed) | Image worker |
| `render:started` | `{ assetId, roomId, sessionId }` | — | No invalidation (progress hook handles UI) | Render worker |
| `render:complete` | `{ assetId, roomId, sessionId, contentType, sizeBytes, model }` | 500ms | `sessionRoomsQueryKey` | Render worker |
| `render:failed` | `{ assetId, roomId, sessionId, error }` | 500ms | `sessionRoomsQueryKey` | Render worker |
| `connect` (reconnection) | — | 300ms | `sessionQueryKey`, `sessionRoomsQueryKey` | Socket.io client |

## Adding a New Event Type

### Step 1: Define the Payload Type

In `packages/shared-types/src/socket-events.ts`:

```typescript
export interface DocGenerationCompletePayload {
  sessionId: string;
  documentId: string;
  documentType: string;
}
```

### Step 2: Add to ServerToClientEvents

```typescript
export interface ServerToClientEvents {
  // ... existing events ...
  'doc:generation_complete': (data: DocGenerationCompletePayload) => void;
}
```

### Step 3: Add the Handler

In `frontend/hooks/useSocketQuerySync.ts`, inside the `useEffect`:

```typescript
const handleDocComplete = (data: DocGenerationCompletePayload) => {
  if (data.sessionId !== sessionId) return;
  logger.info('Document generation complete — invalidating queries', {
    documentId: data.documentId,
    documentType: data.documentType,
  });
  delayedInvalidate(sessionDocumentsQueryKey(sessionId), JOB_COMPLETE_DELAY_MS);
};
```

### Step 4: Register and Clean Up

```typescript
// Register (inside useEffect body)
socket.on('doc:generation_complete', handleDocComplete);

// Cleanup (inside useEffect return function)
socket.off('doc:generation_complete', handleDocComplete);
```

### Step 5: Update Reconnection Handler

If the event affects a query key outside the existing reconnection recovery:

```typescript
const handleConnect = () => {
  if (hasConnectedOnce.current) {
    delayedInvalidate(sessionQueryKey(sessionId), 300);
    delayedInvalidate(sessionRoomsQueryKey(sessionId), 300);
    delayedInvalidate(sessionDocumentsQueryKey(sessionId), 300); // NEW
  }
  hasConnectedOnce.current = true;
};
```

### Step 6: Emit from Backend

In the worker or service:

```typescript
import { emitToSession } from '../utils/socket-emitter.js';

// After DB write completes
emitToSession(sessionId, 'doc:generation_complete', {
  sessionId,
  documentId,
  documentType: 'renovation_plan',
});
```

**Always emit AFTER the DB write**, never before. The delay on the frontend handles propagation lag, but emitting before the write guarantees a race condition.

## Conditional Invalidation

Some events should only trigger invalidation in specific states:

```typescript
// Only invalidate on terminal status, not intermediate progress
const handleAssetProgress = (data: { assetId: string; status: string }) => {
  if (data.status === 'ready' || data.status === 'failed') {
    // Terminal state — invalidate to show final result
    delayedInvalidate(sessionRoomsQueryKey(sessionId), JOB_COMPLETE_DELAY_MS);
  }
  // 'processing' status — no invalidation needed
  // (useAssetProcessingState handles the UI for in-progress state)
};
```

## Events Without Cache Invalidation

Some events are registered in `useSocketQuerySync` for logging/routing purposes but don't trigger invalidation:

```typescript
const handleRenderStarted = (data: { assetId: string; roomId: string; sessionId: string }) => {
  if (data.sessionId !== sessionId) return;
  logger.info('Render started', { assetId: data.assetId, roomId: data.roomId });
  // No query invalidation — useRenderState handles the UI
};
```

Register these handlers in `useSocketQuerySync` anyway so it remains the single source of truth for all non-chat Socket.io event handling. This prevents fragmentation where some events are handled in the sync hook and others in random components.

## Naming Convention

| Pattern | Example |
|---|---|
| Event name | `namespace:verb_noun` — `session:rooms_updated`, `render:complete` |
| Handler name | `handleNounVerbed` — `handleRoomsUpdated`, `handleRenderComplete` |
| Payload type | `NounVerbedPayload` — `SessionRoomsUpdatedPayload`, `RenderCompletePayload` |
