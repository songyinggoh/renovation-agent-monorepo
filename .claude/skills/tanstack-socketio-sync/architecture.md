# Architecture

## Data Flow

```
[BullMQ Worker / LangGraph Tool]
        | DB write (PostgreSQL)
        v
   emitToSession(sessionId, event, data)    <-- backend/src/utils/socket-emitter.ts
        |
        v
   Socket.io Server  -->  io.to(`session:${sessionId}`).emit(event, data)
        |
        | WebSocket transport
        v
   useChat (owns Socket.io connection)      <-- frontend/hooks/useChat.ts
   |  exposes socketRef
   v
   useSocketQuerySync (event listeners)     <-- frontend/hooks/useSocketQuerySync.ts
   |  delayedInvalidate(queryKey, delayMs)
   v
   queryClient.invalidateQueries()          <-- TanStack Query re-fetches from REST API
        |
        v
   REST API  -->  PostgreSQL (reads committed data)
```

**The core problem**: Workers write to DB then emit a Socket.io event. The frontend receives the event instantly, but if it queries the REST API immediately, the write may not be visible yet due to:
- Connection pool isolation (worker uses different DB connection than API)
- Transaction commit timing
- PostgreSQL replication lag (if read replicas exist)

## Hook Wiring Diagram

```
SessionPageClient                           <-- frontend/components/session/session-page-client.tsx
|-- useSession(sessionId)                   --> TanStack Query ['session', sessionId]
|-- useSessionRooms(sessionId)              --> TanStack Query ['session', sessionId, 'rooms']
|-- useChat(sessionId)                      --> Socket.io connection + chat state
|   \-- exposes socketRef                   --> shared with other hooks
|-- useSocketQuerySync({ sessionId, socketRef })
|   \-- Socket.io event listeners           --> queryClient.invalidateQueries()
|-- useAssetProcessingState(socketRef)      --> real-time processing progress (Map)
\-- useRenderState(socketRef)               --> real-time render status (Map)
```

**Key principle**: `useChat` is the single owner of the Socket.io connection. All other hooks that need socket events receive `socketRef` as a prop. Never create additional socket connections.

## Query Key Structure

```typescript
// Session data (phase, budget, style, metadata)
sessionQueryKey(sessionId)       --> ['session', sessionId]

// Rooms + assets (room list, thumbnails, render results)
sessionRoomsQueryKey(sessionId)  --> ['session', sessionId, 'rooms']
```

Both are prefixed with `['session', sessionId]`. This means:
- `invalidateQueries({ queryKey: ['session', sessionId] })` — invalidates EVERYTHING (session + rooms). Use only for reconnection.
- `invalidateQueries({ queryKey: ['session', sessionId, 'rooms'] })` — invalidates rooms only. Use for asset/render events.

When adding new query types (documents, payments, etc.), always prefix with `['session', sessionId]` so reconnection recovery catches them automatically.

## Backend Emit Pattern

Workers and LangGraph tools emit events via the `emitToSession` utility:

```typescript
// backend/src/utils/socket-emitter.ts
export function emitToSession(sessionId: string, event: string, data: unknown): void {
  const io = getSocketServer();
  io?.to(`session:${sessionId}`).emit(event, data);
}
```

This is a fire-and-forget utility. It emits to a Socket.io room named `session:${sessionId}`. No-ops gracefully if Socket.io is not initialized.

**Emit sources**:
| Source | File | Events |
|---|---|---|
| save_intake_state tool | `backend/src/tools/save-intake-state.tool.ts` | `session:rooms_updated`, `session:phase_changed` |
| Image optimization worker | `backend/src/workers/image.worker.ts` | `asset:processing_progress` (processing/ready/failed) |
| Render generation worker | `backend/src/workers/render.worker.ts` | `render:started`, `render:complete`, `render:failed` |

## Shared Type Contract

All event payloads and Socket.io event interfaces live in `packages/shared-types/src/socket-events.ts`:

```typescript
export interface ServerToClientEvents {
  // Chat events (handled by useChat)
  'chat:session_joined': (data: ChatJoinSessionPayload) => void;
  'chat:message_ack': (data: ChatMessageAckPayload) => void;
  'chat:assistant_token': (data: ChatAssistantTokenPayload) => void;
  'chat:tool_call': (data: ChatToolCallPayload) => void;
  'chat:tool_result': (data: ChatToolResultPayload) => void;
  'chat:error': (data: ChatErrorPayload) => void;
  'chat:warning': (data: ChatWarningPayload) => void;

  // Sync events (handled by useSocketQuerySync)
  'session:rooms_updated': (data: SessionRoomsUpdatedPayload) => void;
  'session:phase_changed': (data: SessionPhaseChangedPayload) => void;
  'asset:processing_progress': (data: AssetProcessingProgressPayload) => void;
  'render:started': (data: RenderStartedPayload) => void;
  'render:complete': (data: RenderCompletePayload) => void;
  'render:failed': (data: RenderFailedPayload) => void;
}
```

When adding a new event:
1. Define the payload interface in `socket-events.ts`
2. Add it to `ServerToClientEvents`
3. Add handler in `useSocketQuerySync`
4. Emit via `emitToSession` in the backend

## Key File References

| File | Purpose |
|---|---|
| `frontend/hooks/useSocketQuerySync.ts` | Sync bridge — ALL event-to-cache-invalidation logic |
| `frontend/hooks/useChat.ts` | Socket.io connection owner, exposes `socketRef` |
| `frontend/hooks/useSession.ts` | `sessionQueryKey()` factory |
| `frontend/hooks/useSessionRooms.ts` | `sessionRoomsQueryKey()` factory |
| `frontend/hooks/useAssetProcessingState.ts` | Real-time asset processing progress |
| `frontend/hooks/useRenderState.ts` | Real-time render generation status |
| `frontend/components/session/session-page-client.tsx` | Orchestration point — wires all hooks |
| `packages/shared-types/src/socket-events.ts` | Event payload types + interface contract |
| `backend/src/utils/socket-emitter.ts` | `emitToSession()` utility |
| `backend/src/workers/image.worker.ts` | Asset processing emitter |
| `backend/src/workers/render.worker.ts` | Render generation emitter |
| `backend/src/tools/save-intake-state.tool.ts` | Session/room update emitter |
| `frontend/lib/logger.ts` | Browser Logger (structured JSON via console methods) |
