'use client';

import { useEffect, useRef } from 'react';
import { useSession } from '@/hooks/useSession';
import { useSessionRooms } from '@/hooks/useSessionRooms';
import { ChatView } from '@/components/chat/chat-view';
import { SessionSidebar } from '@/components/session/session-sidebar';

interface SessionPageClientProps {
  sessionId: string;
}

export function SessionPageClient({ sessionId }: SessionPageClientProps) {
  const { session, isLoading: sessionLoading, refetch: refetchSession } = useSession(sessionId);
  const {
    rooms,
    isLoading: roomsLoading,
    selectedRoomId,
    selectRoom,
    refetch: refetchRooms,
  } = useSessionRooms(sessionId);

  // Listen for session:phase_changed and session:rooms_updated via the existing socket
  // We poll-check by watching for custom events dispatched from the socket layer
  // For now, use a MutationObserver-like approach: watch messages for tool results
  const lastRefetchRef = useRef<number>(0);

  // Expose a global callback the socket can invoke to trigger refetch
  useEffect(() => {
    const handler = (event: CustomEvent<{ type: string }>) => {
      const now = Date.now();
      // Debounce to avoid rapid-fire refetches
      if (now - lastRefetchRef.current < 2000) return;
      lastRefetchRef.current = now;

      if (event.detail.type === 'rooms_updated') {
        refetchRooms();
      }
      if (event.detail.type === 'phase_changed' || event.detail.type === 'rooms_updated') {
        refetchSession();
      }
    };

    window.addEventListener('session:update', handler as EventListener);
    return () => window.removeEventListener('session:update', handler as EventListener);
  }, [refetchSession, refetchRooms]);

  // Also refetch when tool_result for save_intake_state appears in messages
  // We do this by polling the chat messages via a simpler approach:
  // Expose refetch functions on window for the socket hook to call
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    win.__sessionRefetch = () => {
      refetchSession();
      refetchRooms();
    };
    return () => {
      delete win.__sessionRefetch;
    };
  }, [refetchSession, refetchRooms]);

  const phase = session?.phase ?? 'INTAKE';

  return (
    <div className="flex h-[calc(100vh-10rem)]">
      <SessionSidebar
        phase={phase}
        totalBudget={session?.totalBudget ?? null}
        currency={session?.currency ?? 'USD'}
        stylePreferences={session?.stylePreferences ?? null}
        rooms={rooms}
        selectedRoomId={selectedRoomId}
        onSelectRoom={selectRoom}
        isLoading={sessionLoading || roomsLoading}
      />
      <div className="flex-1">
        <ChatView
          sessionId={sessionId}
          phase={phase}
          roomId={selectedRoomId ?? undefined}
        />
      </div>
    </div>
  );
}
