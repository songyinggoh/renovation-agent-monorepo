# Realtime Sync Specialist - Memory

## Established Patterns
- Delayed invalidation via `delayedInvalidate()` in `useSocketQuerySync.ts`
- Delay tiers: 100ms (direct write), 200ms (multi-write), 500ms (worker completion), 300ms (reconnection)
- All handlers filter by `sessionId` and log via structured `Logger`
- `useChat` owns socket, exposes `socketRef`; `useSocketQuerySync` attaches listeners to same socket
- Both hooks wired in `SessionPageClient` (orchestration point)
- `setQueryData` (not `delayedInvalidate`) for progress events — no DB read, synchronous patch, no timer needed

## Event Registry (as of 2026-02-21)
- `session:rooms_updated` → rooms + session (200ms)
- `session:phase_changed` → session (100ms)
- `asset:processing_progress` (ready/failed) → rooms (500ms)
- `render:started` → rooms (100ms) — DB record already written by requestRender() before job enqueue
- `render:progress` → setQueryData on rooms cache (0ms, no refetch)
- `render:complete` → rooms (500ms)
- `render:failed` → rooms (500ms)
- `doc:generated` → session (500ms)
- `connect` (reconnection) → session + rooms (300ms)

## Known Bugs in Codebase (as of 2026-02-21)
See `render-pipeline-bugs.md` for details. Summary:
1. `render.worker.ts` emits `render:started` without `sessionId` → handler silently drops every event
2. `render.worker.ts` emits `render:complete` without `sessionId` → unfiltered invalidations
3. `render.worker.ts` emits `render:failed` without `sessionId` → unfiltered invalidations
4. `useSocketQuerySync` `handleRenderComplete` missing `sessionId` guard
5. `useSocketQuerySync` `handleRenderFailed` missing `sessionId` guard

## Key Decision: CustomEvent Bridge Removed
- Previous pattern used `window.dispatchEvent(new CustomEvent('session:update'))` from useChat + `addEventListener` in SessionPageClient with 2s debounce
- Replaced with direct `queryClient.invalidateQueries` from `useSocketQuerySync` — composable, React-native, precise timing

## Key Decision: render:started uses invalidate not setQueryData
- The DB record is written with status:'processing' by requestRender() BEFORE the job is enqueued
- So invalidating at render:started (100ms) hits the API after the write is committed — no race
- No need for optimistic setQueryData here; the REST response already has the correct status

## Key Decision: render:progress uses setQueryData not invalidate
- Progress updates must not trigger REST fetches — too frequent, no DB changes during progress
- setQueryData patches ephemeral `renderProgress` and `renderStage` fields on RoomSummary
- These fields are optional and undefined in REST responses — cleared naturally on next invalidation

## Reconnection Recovery is Already Correct
- handleConnect invalidates ['session', sessionId] prefix (300ms)
- This covers both sessionQueryKey and sessionRoomsQueryKey (renders included)
- No changes needed when adding render pipeline

## Type Contract Rules
- All terminal render events (started/complete/failed) MUST include sessionId in payload
- Progress fields (renderProgress, renderStage) are frontend-only — NOT persisted in DB
- Mark them optional on RoomSummary/RenderSummary so REST responses don't fail type checks

## File Locations
- Sync bridge: `frontend/hooks/useSocketQuerySync.ts`
- Session query key: `frontend/hooks/useSession.ts` → sessionQueryKey()
- Rooms query key: `frontend/hooks/useSessionRooms.ts` → sessionRoomsQueryKey()
- Shared types: `packages/shared-types/src/socket-events.ts`
- Render worker: `backend/src/workers/render.worker.ts`
- Render service: `backend/src/services/render.service.ts`
- Socket emitter: `backend/src/utils/socket-emitter.ts`
