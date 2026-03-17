'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { Logger } from '@/lib/logger';

const logger = new Logger({ serviceName: 'DocumentState' });

/** Display delay for completed documents before removal */
const COMPLETE_DISPLAY_MS = 3000;
/** Display delay for failed documents before removal */
const FAILED_DISPLAY_MS = 5000;

export interface DocumentGenerationEntry {
  jobId?: string;
  sessionId: string;
  documentType: 'checklist_pdf' | 'plan_pdf';
  roomId?: string;
  status: 'started' | 'complete' | 'failed';
  documentId?: string;
  error?: string;
}

/**
 * Tracks in-flight document generation jobs via Socket.io events.
 * Provides real-time status for UI display.
 */
export function useDocumentState(socketRef: React.RefObject<Socket | null>) {
  const [activeDocuments, setActiveDocuments] = useState<Map<string, DocumentGenerationEntry>>(new Map());
  const removalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearAll = useCallback(() => {
    setActiveDocuments(new Map());
    for (const timer of removalTimers.current.values()) {
      clearTimeout(timer);
    }
    removalTimers.current.clear();
  }, []);

  const scheduleRemoval = useCallback((key: string, delayMs: number) => {
    const existing = removalTimers.current.get(key);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      removalTimers.current.delete(key);
      setActiveDocuments((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    }, delayMs);

    removalTimers.current.set(key, timer);
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    // Use a unique key for each document generation job to track state
    const getJobKey = (data: { sessionId: string; documentType: string; roomId?: string }) => 
      `${data.sessionId}-${data.documentType}-${data.roomId ?? 'all'}`;

    const handleStarted = (data: { jobId: string; sessionId: string; documentType: DocumentGenerationEntry['documentType']; roomId?: string }) => {
      const key = getJobKey(data);
      logger.info('Document generation started', { key, jobId: data.jobId });
      setActiveDocuments((prev) => {
        const next = new Map(prev);
        next.set(key, {
          jobId: data.jobId,
          sessionId: data.sessionId,
          documentType: data.documentType,
          roomId: data.roomId,
          status: 'started',
        });
        return next;
      });
    };

    const handleComplete = (data: { sessionId: string; documentType: DocumentGenerationEntry['documentType']; roomId?: string; documentId: string }) => {
      const key = getJobKey(data);
      logger.info('Document generation complete', { key, documentId: data.documentId });
      setActiveDocuments((prev) => {
        const next = new Map(prev);
        const existing = prev.get(key);
        next.set(key, {
          ...existing,
          sessionId: data.sessionId,
          documentType: data.documentType,
          roomId: data.roomId,
          documentId: data.documentId,
          status: 'complete',
        });
        return next;
      });
      scheduleRemoval(key, COMPLETE_DISPLAY_MS);
    };

    const handleFailed = (data: { sessionId: string; documentType: DocumentGenerationEntry['documentType']; roomId?: string; error: string }) => {
      const key = getJobKey(data);
      logger.warn('Document generation failed', undefined, { key, error: data.error });
      setActiveDocuments((prev) => {
        const next = new Map(prev);
        const existing = prev.get(key);
        next.set(key, {
          ...existing,
          sessionId: data.sessionId,
          documentType: data.documentType,
          roomId: data.roomId,
          status: 'failed',
          error: data.error,
        });
        return next;
      });
      scheduleRemoval(key, FAILED_DISPLAY_MS);
    };

    const handleConnect = () => {
      clearAll();
    };

    socket.on('doc:generation_started', handleStarted);
    socket.on('doc:generation_complete', handleComplete);
    socket.on('doc:generation_failed', handleFailed);
    socket.on('connect', handleConnect);

    const timers = removalTimers.current;

    return () => {
      socket.off('doc:generation_started', handleStarted);
      socket.off('doc:generation_complete', handleComplete);
      socket.off('doc:generation_failed', handleFailed);
      socket.off('connect', handleConnect);

      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, [socketRef, clearAll, scheduleRemoval]);

  return { activeDocuments };
}
