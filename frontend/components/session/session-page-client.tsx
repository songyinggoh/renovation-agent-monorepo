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

  const lastRefetchRef = useRef<number>(0);

  useEffect(() => {
    const handler = (event: CustomEvent<{ type: string }>) => {
      const now = Date.now();
      if (now - lastRefetchRef.current < 2000) return;
      lastRefetchRef.current = now;

      switch (event.detail.type) {
        case 'rooms_updated':
          refetchRooms();
          refetchSession();
          break;
        case 'phase_changed':
          refetchSession();
          break;
      }
    };

    window.addEventListener('session:update', handler as EventListener);
    return () => window.removeEventListener('session:update', handler as EventListener);
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
