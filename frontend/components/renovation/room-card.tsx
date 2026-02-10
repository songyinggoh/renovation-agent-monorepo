'use client';

import { Bath, ChefHat, Bed, Sofa, Warehouse, Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoomSummary } from '@/types/renovation';

const ROOM_ICONS: Record<string, typeof Home> = {
  kitchen: ChefHat,
  bathroom: Bath,
  bedroom: Bed,
  living: Sofa,
  basement: Warehouse,
};

interface RoomCardProps {
  room: RoomSummary;
  onClick?: () => void;
  className?: string;
}

export function RoomCard({ room, onClick, className }: RoomCardProps) {
  const Icon = ROOM_ICONS[room.type] ?? Home;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-all hover:shadow-md hover:scale-[1.02]',
        onClick && 'cursor-pointer',
        !onClick && 'cursor-default',
        className
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{room.name}</p>
        <p className="text-xs text-muted-foreground capitalize">{room.type}</p>
      </div>
      {room.budget && (
        <span className="currency text-sm text-foreground">
          ${Number(room.budget).toLocaleString()}
        </span>
      )}
    </button>
  );
}
