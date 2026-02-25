---
name: tanstack-socketio-sync
description: TanStack Query + Socket.io synchronization patterns — race conditions between job-complete events and REST API readiness, missed events during reconnection windows, and optimistic UI patterns for async generation pipelines.
user-invocable: false
---

# TanStack Query + Socket.io Sync

Apply these rules when writing or reviewing code that bridges Socket.io events to TanStack Query cache state. This skill covers the three hardest problems in this integration:

1. **Race conditions** between worker job-complete events and REST API data readiness
2. **Missed events** during Socket.io reconnection windows
3. **Optimistic UI** for async generation pipelines (image optimization, AI renders)

## Architecture Overview

See [architecture.md](./architecture.md) for:
- Hook wiring diagram (useChat → socketRef → useSocketQuerySync)
- Query key structure and prefix conventions
- Backend emit flow (BullMQ worker → emitToSession → Socket.io room)
- SessionPageClient orchestration point

## Race Conditions

See [race-conditions.md](./race-conditions.md) for:
- Why race conditions happen (DB write vs event emit timing)
- Delay tier system (100ms / 200ms / 500ms / 300ms)
- `delayedInvalidate()` pattern with timer tracking
- Diagnosis checklist for stale UI after events
- Connection pool isolation between workers and API

## Reconnection Recovery

See [reconnection-recovery.md](./reconnection-recovery.md) for:
- Broad invalidation strategy on reconnect
- `hasConnectedOnce` guard pattern
- Progress state hooks clearing on reconnect
- Adding new query types to reconnection handler
- Gap window analysis (what events can be missed)

## Optimistic UI Patterns

See [optimistic-ui.md](./optimistic-ui.md) for:
- Job-started fast invalidation (100ms) vs job-complete slow invalidation (500ms)
- `setQueryData` for immediate UI state changes
- Reconciliation on completion/failure
- `useAssetProcessingState` and `useRenderState` patterns
- Timed removal of completed/failed entries

## Event Handler Design

See [event-handlers.md](./event-handlers.md) for:
- Handler template with sessionId filtering + logging + cleanup
- Event → query key mapping table
- Adding new event types (type contract → handler → cleanup → reconnection)
- Shared type contract in `packages/shared-types/src/socket-events.ts`
- Registration and cleanup in useEffect

## Anti-Patterns

See [anti-patterns.md](./anti-patterns.md) for:
- window.CustomEvent bridge (fragile, out-of-band)
- Manual refetch() from components (bypasses sync bridge)
- Immediate invalidation without delay (races with DB writes)
- Broad invalidation for specific events (wasteful)
- Missing listener cleanup (duplicate invalidations)
- Separate sync hooks per event type (fragmentation)

## Testing

See [testing.md](./testing.md) for:
- Mock socket setup for `useSocketQuerySync` tests
- `vi.useFakeTimers()` + `vi.advanceTimersByTime()` for delay testing
- Testing sessionId filtering
- Testing reconnection recovery
- QueryClientProvider wrapper pattern
