'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import { sessionQueryKey } from '@/hooks/useSession';
import { sessionRoomsQueryKey } from '@/hooks/useSessionRooms';
import { Logger } from '@/lib/logger';

const logger = new Logger({ serviceName: 'SocketQuerySync' });

/**
 * Delay (ms) before invalidating queries after a job-complete event.
 * Handles the race condition where the DB write from a worker may not
 * be visible via the REST API immediately after the Socket.io event.
 */
const JOB_COMPLETE_DELAY_MS = 500;

interface UseSocketQuerySyncOptions {
  sessionId: string;
  socketRef: React.RefObject<Socket | null>;
}

/**
 * Bridge hook connecting Socket.io events to TanStack Query cache.
 *
 * Solves three problems:
 * 1. **Race conditions**: Delays query invalidation after job-complete events
 *    to ensure DB writes have propagated before the REST API is queried.
 * 2. **Missed events during reconnection**: Invalidates all session-scoped
 *    queries on reconnection to catch any events missed during the gap.
 * 3. **Direct cache sync**: Replaces the fragile window.CustomEvent bridge
 *    with direct TanStack Query invalidation from Socket.io events.
 */
export function useSocketQuerySync({ sessionId, socketRef }: UseSocketQuerySyncOptions) {
  const queryClient = useQueryClient();
  const hasConnectedOnce = useRef(false);
  const pendingTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  /**
   * Invalidate a query with a delay, retrying if the data appears stale.
   * This handles the race where a worker emits a Socket.io event before
   * its DB write is visible to the REST API.
   */
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

  /**
   * Invalidate all session-scoped queries.
   * Used on reconnection to recover from missed events.
   */
  const invalidateAllSessionQueries = useCallback(() => {
    logger.info('Invalidating all session queries (reconnection recovery)', { sessionId });
    queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
  }, [queryClient, sessionId]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !sessionId) return;

    // --- Reconnection recovery ---
    const handleConnect = () => {
      if (hasConnectedOnce.current) {
        // This is a reconnection — invalidate everything to catch missed events
        logger.info('Socket reconnected — recovering missed events', { sessionId });
        // Small delay to let the server re-join the room before we query
        delayedInvalidate(sessionQueryKey(sessionId), 300);
        delayedInvalidate(sessionRoomsQueryKey(sessionId), 300);
      }
      hasConnectedOnce.current = true;
    };

    // --- Session-level events (replaces window.CustomEvent bridge) ---
    const handleRoomsUpdated = (data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return;
      logger.info('Rooms updated — invalidating queries', { sessionId });
      // Rooms are created by the AI tool which writes to DB before emitting,
      // but add a small delay for safety
      delayedInvalidate(sessionRoomsQueryKey(sessionId), 200);
      delayedInvalidate(sessionQueryKey(sessionId), 200);
    };

    const handlePhaseChanged = (data: { sessionId: string; phase: string }) => {
      if (data.sessionId !== sessionId) return;
      logger.info('Phase changed — invalidating session query', {
        sessionId,
        newPhase: data.phase,
      });
      // Phase change is a DB write that happens before emit, minimal delay
      delayedInvalidate(sessionQueryKey(sessionId), 100);
    };

    // --- Asset processing events ---
    const handleAssetProgress = (data: { assetId: string; status: string }) => {
      if (data.status === 'ready' || data.status === 'failed') {
        logger.info('Asset processing complete — invalidating room assets', {
          assetId: data.assetId,
          status: data.status,
        });
        // Asset variants are written by the worker before emitting
        delayedInvalidate(sessionRoomsQueryKey(sessionId), JOB_COMPLETE_DELAY_MS);
      }
    };

    // --- Render job events ---
    const handleRenderStarted = (data: { assetId: string; roomId: string; sessionId: string }) => {
      if (data.sessionId !== sessionId) return;
      logger.info('Render started', {
        assetId: data.assetId,
        roomId: data.roomId,
      });
      // No query invalidation needed — progress hooks handle the UI state.
      // This event is registered so useSocketQuerySync is the single source
      // of truth for all render-related Socket.io events.
    };

    const handleRenderComplete = (data: { assetId: string; roomId: string; sessionId: string }) => {
      if (data.sessionId !== sessionId) return;
      logger.info('Render complete — invalidating queries', {
        assetId: data.assetId,
        roomId: data.roomId,
      });
      // Worker writes to DB before emitting, but add delay for write propagation
      delayedInvalidate(sessionRoomsQueryKey(sessionId), JOB_COMPLETE_DELAY_MS);
    };

    const handleRenderProgress = (data: { assetId: string; sessionId: string; progress: number; stage: string }) => {
      if (data.sessionId !== sessionId) return;
      // Progress is ephemeral — no query invalidation needed.
      // useRenderState handles the UI update via its own listener.
    };

    const handleDocGenerated = (data: { sessionId: string; roomId: string }) => {
      if (data.sessionId !== sessionId) return;
      logger.info('Document generated — invalidating session query', { sessionId, roomId: data.roomId });
      delayedInvalidate(sessionQueryKey(sessionId), JOB_COMPLETE_DELAY_MS);
    };

    const handleRenderFailed = (data: { assetId: string; roomId: string; sessionId: string; error: string }) => {
      if (data.sessionId !== sessionId) return;
      logger.warn('Render failed', undefined, {
        assetId: data.assetId,
        roomId: data.roomId,
        error: data.error,
      });
      // Still invalidate to reflect the failed status in UI
      delayedInvalidate(sessionRoomsQueryKey(sessionId), JOB_COMPLETE_DELAY_MS);
    };

    // Register all listeners
    socket.on('connect', handleConnect);
    socket.on('session:rooms_updated', handleRoomsUpdated);
    socket.on('session:phase_changed', handlePhaseChanged);
    socket.on('asset:processing_progress', handleAssetProgress);
    socket.on('render:started', handleRenderStarted);
    socket.on('render:complete', handleRenderComplete);
    socket.on('render:progress', handleRenderProgress);
    socket.on('render:failed', handleRenderFailed);
    socket.on('doc:generated', handleDocGenerated);

    // Capture ref value for cleanup (React exhaustive-deps rule)
    const timers = pendingTimers.current;

    return () => {
      socket.off('connect', handleConnect);
      socket.off('session:rooms_updated', handleRoomsUpdated);
      socket.off('session:phase_changed', handlePhaseChanged);
      socket.off('asset:processing_progress', handleAssetProgress);
      socket.off('render:started', handleRenderStarted);
      socket.off('render:complete', handleRenderComplete);
      socket.off('render:progress', handleRenderProgress);
      socket.off('render:failed', handleRenderFailed);
      socket.off('doc:generated', handleDocGenerated);

      // Clear pending timers on cleanup
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, [sessionId, socketRef, delayedInvalidate, invalidateAllSessionQueries]);
}
