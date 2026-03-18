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
import { ComparisonDialog } from '@/components/renovation/index';
import { PHASE_INDEX, type RenovationPhase } from '@/lib/design-tokens';
import { useState } from 'react';

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

  // Comparison state
  const [comparison, setComparison] = useState<{
    beforeUrl: string;
    afterUrl: string;
    roomName?: string;
  } | null>(null);

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

  const handleCompare = (renderId: string) => {
    const render = renders.find((r) => r.id === renderId);
    if (!render || !render.storagePath) return;

    const baseImageUrl = render.metadata?.baseImageUrl as string | undefined;
    if (!baseImageUrl) {
      // If no base image, we can't show the slider comparison
      // but maybe we can just show the render?
      // For now, only support comparison if baseImageUrl exists
      return;
    }

    const room = rooms.find((r) => r.id === selectedRoomId);

    setComparison({
      beforeUrl: baseImageUrl,
      afterUrl: render.storagePath,
      roomName: room?.name,
    });
  };

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
          socketRef={chat.socketRef}
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
            onCompare={handleCompare}
          />
        </aside>
      )}

      {comparison && (
        <ComparisonDialog
          open={!!comparison}
          onOpenChange={(open) => !open && setComparison(null)}
          beforeImageUrl={comparison.beforeUrl}
          afterImageUrl={comparison.afterUrl}
          roomName={comparison.roomName}
        />
      )}
    </div>
  );
}

