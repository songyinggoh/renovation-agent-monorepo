'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { Logger } from '@/lib/logger';

const logger = new Logger({ serviceName: 'AssetProcessingState' });

/** How long to keep a completed/failed entry visible for UI transitions */
const COMPLETION_DISPLAY_MS = 2000;

export interface AssetProcessingEntry {
  assetId: string;
  status: 'processing' | 'ready' | 'failed';
  progress: number;
  variantType?: string;
}

/**
 * Tracks in-flight asset processing (image optimization) via Socket.io events.
 * Provides real-time progress for UI display without REST polling.
 *
 * On reconnection, clears all state — useSocketQuerySync handles
 * fetching the final state from REST.
 */
export function useAssetProcessingState(socketRef: React.RefObject<Socket | null>) {
  const [processingAssets, setProcessingAssets] = useState<Map<string, AssetProcessingEntry>>(new Map());
  const removalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearAll = useCallback(() => {
    setProcessingAssets(new Map());
    for (const timer of removalTimers.current.values()) {
      clearTimeout(timer);
    }
    removalTimers.current.clear();
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleProgress = (data: { assetId: string; status: string; progress: number; variantType?: string }) => {
      logger.info('Asset processing progress', { assetId: data.assetId, status: data.status, progress: data.progress });

      setProcessingAssets((prev) => {
        const next = new Map(prev);
        next.set(data.assetId, {
          assetId: data.assetId,
          status: data.status as AssetProcessingEntry['status'],
          progress: data.progress,
          variantType: data.variantType,
        });
        return next;
      });

      // Schedule removal for completed/failed assets
      if (data.status === 'ready' || data.status === 'failed') {
        const existing = removalTimers.current.get(data.assetId);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
          removalTimers.current.delete(data.assetId);
          setProcessingAssets((prev) => {
            const next = new Map(prev);
            next.delete(data.assetId);
            return next;
          });
        }, COMPLETION_DISPLAY_MS);

        removalTimers.current.set(data.assetId, timer);
      }
    };

    const handleConnect = () => {
      clearAll();
    };

    socket.on('asset:processing_progress', handleProgress);
    socket.on('connect', handleConnect);

    const timers = removalTimers.current;

    return () => {
      socket.off('asset:processing_progress', handleProgress);
      socket.off('connect', handleConnect);

      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, [socketRef, clearAll]);

  return { processingAssets };
}
