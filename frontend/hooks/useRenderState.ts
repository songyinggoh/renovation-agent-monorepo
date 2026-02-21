'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { Logger } from '@/lib/logger';

const logger = new Logger({ serviceName: 'RenderState' });

/** Display delay for completed renders before removal */
const COMPLETE_DISPLAY_MS = 3000;
/** Display delay for failed renders before removal */
const FAILED_DISPLAY_MS = 5000;

export interface RenderEntry {
  assetId: string;
  roomId: string;
  status: 'started' | 'complete' | 'failed';
  progress?: number;
  stage?: string;
  error?: string;
}

/**
 * Tracks in-flight render generation jobs via Socket.io events.
 * Provides real-time status for UI display without REST polling.
 *
 * On reconnection, clears all state — useSocketQuerySync handles
 * fetching the final state from REST.
 */
export function useRenderState(socketRef: React.RefObject<Socket | null>) {
  const [activeRenders, setActiveRenders] = useState<Map<string, RenderEntry>>(new Map());
  const removalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearAll = useCallback(() => {
    setActiveRenders(new Map());
    for (const timer of removalTimers.current.values()) {
      clearTimeout(timer);
    }
    removalTimers.current.clear();
  }, []);

  const scheduleRemoval = useCallback((assetId: string, delayMs: number) => {
    const existing = removalTimers.current.get(assetId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      removalTimers.current.delete(assetId);
      setActiveRenders((prev) => {
        const next = new Map(prev);
        next.delete(assetId);
        return next;
      });
    }, delayMs);

    removalTimers.current.set(assetId, timer);
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleStarted = (data: { assetId: string; roomId: string; sessionId: string }) => {
      logger.info('Render started', { assetId: data.assetId, roomId: data.roomId });
      setActiveRenders((prev) => {
        const next = new Map(prev);
        next.set(data.assetId, {
          assetId: data.assetId,
          roomId: data.roomId,
          status: 'started',
        });
        return next;
      });
    };

    const handleProgress = (data: { assetId: string; roomId: string; sessionId: string; progress: number; stage: string }) => {
      logger.info('Render progress', { assetId: data.assetId, progress: data.progress, stage: data.stage });
      setActiveRenders((prev) => {
        const existing = prev.get(data.assetId);
        if (!existing) return prev;
        const next = new Map(prev);
        next.set(data.assetId, {
          ...existing,
          progress: data.progress,
          stage: data.stage,
        });
        return next;
      });
    };

    const handleComplete = (data: { assetId: string; roomId: string }) => {
      logger.info('Render complete', { assetId: data.assetId, roomId: data.roomId });
      setActiveRenders((prev) => {
        const next = new Map(prev);
        const existing = prev.get(data.assetId);
        next.set(data.assetId, {
          assetId: data.assetId,
          roomId: existing?.roomId ?? data.roomId,
          status: 'complete',
        });
        return next;
      });
      scheduleRemoval(data.assetId, COMPLETE_DISPLAY_MS);
    };

    const handleFailed = (data: { assetId: string; roomId: string; error: string }) => {
      logger.warn('Render failed', undefined, { assetId: data.assetId, error: data.error });
      setActiveRenders((prev) => {
        const next = new Map(prev);
        next.set(data.assetId, {
          assetId: data.assetId,
          roomId: data.roomId,
          status: 'failed',
          error: data.error,
        });
        return next;
      });
      scheduleRemoval(data.assetId, FAILED_DISPLAY_MS);
    };

    const handleConnect = () => {
      clearAll();
    };

    socket.on('render:started', handleStarted);
    socket.on('render:progress', handleProgress);
    socket.on('render:complete', handleComplete);
    socket.on('render:failed', handleFailed);
    socket.on('connect', handleConnect);

    const timers = removalTimers.current;

    return () => {
      socket.off('render:started', handleStarted);
      socket.off('render:progress', handleProgress);
      socket.off('render:complete', handleComplete);
      socket.off('render:failed', handleFailed);
      socket.off('connect', handleConnect);

      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, [socketRef, clearAll, scheduleRemoval]);

  return { activeRenders };
}
