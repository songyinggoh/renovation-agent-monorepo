'use client';

import { useState } from 'react';
import { PanelLeftClose, PanelLeft, Plus, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { RoomCard } from '@/components/renovation/room-card';
import { PHASE_CONFIG, type RenovationPhase } from '@/lib/design-tokens';
import type { RoomSummary, SessionStylePreferences } from '@/types/renovation';

type PhaseBadgeVariant =
  | 'phase-intake'
  | 'phase-checklist'
  | 'phase-plan'
  | 'phase-render'
  | 'phase-payment'
  | 'phase-complete'
  | 'phase-iterate';

interface SessionSidebarProps {
  phase: RenovationPhase;
  totalBudget: string | null;
  currency: string;
  stylePreferences: SessionStylePreferences | null;
  rooms: RoomSummary[];
  selectedRoomId: string | null;
  onSelectRoom: (roomId: string) => void;
  onAddRoom?: () => void;
  isLoading?: boolean;
}

export function SessionSidebar({
  phase,
  totalBudget,
  currency,
  stylePreferences,
  rooms,
  selectedRoomId,
  onSelectRoom,
  onAddRoom,
  isLoading,
}: SessionSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const phaseConfig = PHASE_CONFIG[phase];
  const badgeVariant = `phase-${phase.toLowerCase()}` as PhaseBadgeVariant;

  if (collapsed) {
    return (
      <div className="flex w-12 flex-col items-center border-r border-border bg-card py-3">
        <button
          onClick={() => setCollapsed(false)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Expand sidebar"
        >
          <PanelLeft className="h-5 w-5" />
        </button>
      </div>
    );
  }

  return (
    <aside className="flex w-64 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Badge variant={badgeVariant}>{phaseConfig.label}</Badge>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Budget */}
      {totalBudget && Number(totalBudget) > 0 && (
        <div className="border-b border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">Total Budget</p>
          <p className="currency text-lg font-semibold text-foreground">
            {currency === 'USD' ? '$' : currency}
            {Number(totalBudget).toLocaleString()}
          </p>
        </div>
      )}

      {/* Style preferences */}
      {stylePreferences?.preferredStyle && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Palette className="h-3.5 w-3.5" />
            <span>Style</span>
          </div>
          <p className="mt-1 text-sm font-medium text-foreground capitalize">
            {stylePreferences.preferredStyle}
          </p>
        </div>
      )}

      {/* Room list */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Rooms ({rooms.length})
          </p>
          {onAddRoom && (
            <button
              onClick={onAddRoom}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Add room"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>

        {isLoading && rooms.length === 0 && (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        )}

        {!isLoading && rooms.length === 0 && (
          <p className="px-1 text-xs text-muted-foreground">
            No rooms yet. The AI will create rooms during the intake conversation.
          </p>
        )}

        <div className="space-y-2">
          {rooms.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onClick={() => onSelectRoom(room.id)}
              className={cn(
                selectedRoomId === room.id &&
                  'ring-2 ring-primary ring-offset-1 ring-offset-background'
              )}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}
