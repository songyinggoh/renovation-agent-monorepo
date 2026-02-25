# Render Pipeline Bugs (discovered 2026-02-21)

## Bug 1: render:started drops sessionId

**File**: `backend/src/workers/render.worker.ts`, line 40
**Current code**:
```typescript
emitToSession(sessionId, 'render:started', { assetId, roomId });
```
**Problem**: `RenderStartedPayload` requires `sessionId`. The `useSocketQuerySync` handler guards
`if (data.sessionId !== sessionId) return` — so every `render:started` event is silently dropped.
**Fix**: `emitToSession(sessionId, 'render:started', { assetId, roomId, sessionId });`

## Bug 2: render:complete drops sessionId

**File**: `backend/src/workers/render.worker.ts`, line 55
**Current code**:
```typescript
emitToSession(sessionId, 'render:complete', { assetId, roomId, contentType, sizeBytes, model });
```
**Problem**: `RenderCompletePayload` requires `sessionId`. The handler does NOT filter by sessionId
(missing guard), causing spurious invalidations in multi-session/multi-tab scenarios.
**Fix**: Add `sessionId` to the emitted object AND add the guard in useSocketQuerySync.

## Bug 3: render:failed drops sessionId

**File**: `backend/src/workers/render.worker.ts`, line 83
Same issue as Bug 2 — emitted without `sessionId`, handler has no `sessionId` guard.

## Bug 4: handleRenderComplete missing sessionId guard

**File**: `frontend/hooks/useSocketQuerySync.ts`, line 130
**Current code**:
```typescript
const handleRenderComplete = (data: { assetId: string; roomId: string }) => {
  logger.info(...)
  delayedInvalidate(sessionRoomsQueryKey(sessionId), JOB_COMPLETE_DELAY_MS);
};
```
**Problem**: No `if (data.sessionId !== sessionId) return` guard.
**Fix**: Add guard after adding `sessionId` to `RenderCompletePayload`.

## Bug 5: handleRenderFailed missing sessionId guard

**File**: `frontend/hooks/useSocketQuerySync.ts`, line 145
Same as Bug 4 — no sessionId filter.

## Fix Order

Fix bugs 1-3 (worker) and bugs 4-5 (hook) in a single commit that also bumps the shared type
interfaces to add `sessionId` to all three payload types. Then layer in `render:progress` on top.
