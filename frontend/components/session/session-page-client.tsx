'use client';

import { useSession } from '@/hooks/useSession';
import { useSessionRooms } from '@/hooks/useSessionRooms';
import { useChat } from '@/hooks/useChat';
import { useSocketQuerySync } from '@/hooks/useSocketQuerySync';
import { ChatView } from '@/components/chat/chat-view';
import { SessionSidebar } from '@/components/session/session-sidebar';

interface SessionPageClientProps {
  sessionId: string;
}

export function SessionPageClient({ sessionId }: SessionPageClientProps) {
  const { session, isLoading: sessionLoading } = useSession(sessionId);
  const {
    rooms,
    isLoading: roomsLoading,
    selectedRoomId,
    selectRoom,
  } = useSessionRooms(sessionId);

  // Lift useChat here so we can share socketRef with useSocketQuerySync
  const chat = useChat(sessionId);

  // Bridge Socket.io events → TanStack Query cache invalidation
  useSocketQuerySync({ sessionId, socketRef: chat.socketRef });

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
          messages={chat.messages}
          sendMessage={chat.sendMessage}
          isConnected={chat.isConnected}
          error={chat.error}
          isAssistantTyping={chat.isAssistantTyping}
          isLoadingHistory={chat.isLoadingHistory}
        />
      </div>
    </div>
  );
}
