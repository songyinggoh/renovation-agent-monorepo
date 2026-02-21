'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { RenderCard } from './render-card';
import type { RenderEntry } from '@/hooks/useRenderState';

interface RenderAsset {
  id: string;
  roomId: string;
  status: 'processing' | 'ready' | 'failed';
  storagePath?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
}

type StatusFilter = 'all' | 'ready' | 'processing' | 'failed';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'processing', label: 'In Progress' },
  { value: 'failed', label: 'Failed' },
];

interface RenderGalleryProps {
  roomId: string;
  sessionId: string;
  renders: RenderAsset[];
  activeRenders?: Map<string, RenderEntry>;
  onCompare?: (renderId: string) => void;
  onApprove?: (renderId: string) => void;
  onReject?: (renderId: string) => void;
  className?: string;
}

export function RenderGallery({
  renders,
  activeRenders,
  onCompare,
  onApprove,
  onReject,
  className,
}: RenderGalleryProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return renders;
    return renders.filter(r => r.status === filter);
  }, [renders, filter]);

  if (renders.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8', className)}>
        <p className="text-sm font-medium text-muted-foreground">No renders yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ask the AI to generate a renovation render for this room
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              filter === f.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(render => (
          <RenderCard
            key={render.id}
            render={render}
            activeRender={activeRenders?.get(render.id)}
            onCompare={onCompare ? () => onCompare(render.id) : undefined}
            onApprove={onApprove ? () => onApprove(render.id) : undefined}
            onReject={onReject ? () => onReject(render.id) : undefined}
          />
        ))}
      </div>

      {filtered.length === 0 && renders.length > 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No renders match this filter
        </p>
      )}
    </div>
  );
}
