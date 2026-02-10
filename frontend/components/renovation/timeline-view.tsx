'use client';

import { cn } from '@/lib/utils';
import type { RenovationPhase } from '@/lib/design-tokens';

export interface TimelineItem {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  phase: RenovationPhase;
  status: 'pending' | 'active' | 'completed';
}

interface TimelineViewProps {
  items: TimelineItem[];
  className?: string;
}

export function TimelineView({ items, className }: TimelineViewProps) {
  return (
    <div className={cn('relative space-y-0', className)}>
      {items.map((item, index) => (
        <div key={item.id} className="flex gap-4">
          {/* Vertical line + dot */}
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'h-3 w-3 rounded-full border-2 shrink-0',
                item.status === 'completed' && 'border-transparent bg-phase-complete',
                item.status === 'active' && 'animate-pulse-subtle border-primary bg-primary/30',
                item.status === 'pending' && 'border-border bg-muted'
              )}
            />
            {index < items.length - 1 && (
              <div
                className={cn(
                  'w-0.5 flex-1 min-h-[2rem]',
                  item.status === 'completed' ? 'bg-phase-complete' : 'bg-border'
                )}
              />
            )}
          </div>

          {/* Content */}
          <div className="pb-6 min-w-0">
            <p className={cn(
              'text-sm font-medium',
              item.status === 'active' ? 'text-primary' : 'text-muted-foreground'
            )}>
              {item.label}
            </p>
            <p className="technical-code mt-0.5 text-xs text-muted-foreground">
              {item.startDate} — {item.endDate}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
