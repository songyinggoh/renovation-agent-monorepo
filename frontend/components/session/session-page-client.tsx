'use client';

import { useSession } from '@/hooks/useSession';
import { useSessionRooms } from '@/hooks/useSessionRooms';
import { useChat } from '@/hooks/useChat';
import { useSocketQuerySync } from '@/hooks/useSocketQuerySync';
import { useRenderState } from '@/hooks/useRenderState';
import { useRoomRenders } from '@/hooks/useRoomRenders';
import { ChatView } from '@/components/chat/chat-view';
import { SessionSidebar } from '@/components/session/session-sidebar';
import { RenderGallery } from '@/components/renovation/render-gallery';
import { PHASE_INDEX, type RenovationPhase } from '@/lib/design-tokens';

interface SessionPageClientProps {
  sessionId: string;
}

/** Renders panel is visible once the session reaches the RENDER phase or later. */
function isRenderPhase(phase: RenovationPhase): boolean {
  return PHASE_INDEX[phase] >= PHASE_INDEX.RENDER;
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

  // Track in-flight render jobs via Socket.io events
  const { activeRenders } = useRenderState(chat.socketRef);

  // Fetch persisted renders for the selected room
  const { renders } = useRoomRenders(selectedRoomId);

  const phase = session?.phase ?? 'INTAKE';
  const showRenders = isRenderPhase(phase) && !!selectedRoomId && renders.length > 0;

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
      {showRenders && (
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Renders</h2>
          <RenderGallery
            roomId={selectedRoomId!}
            sessionId={sessionId}
            renders={renders}
            activeRenders={activeRenders}
          />
        </aside>
      )}
    </div>
  );
}
