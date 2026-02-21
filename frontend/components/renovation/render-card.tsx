'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { RenderEntry } from '@/hooks/useRenderState';

interface RenderAsset {
  id: string;
  roomId: string;
  status: 'processing' | 'ready' | 'failed';
  storagePath?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
}

interface RenderCardProps {
  render: RenderAsset;
  activeRender?: RenderEntry;
  onCompare?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  className?: string;
}

const STATUS_CONFIG = {
  processing: { label: 'Generating', variant: 'warning' as const, pulse: true },
  ready: { label: 'Ready', variant: 'success' as const, pulse: false },
  failed: { label: 'Failed', variant: 'destructive' as const, pulse: false },
};

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued...',
  generating: 'Generating image...',
  uploading: 'Uploading...',
  finalizing: 'Finalizing...',
};

export function RenderCard({
  render,
  activeRender,
  onCompare,
  onApprove,
  onReject,
  className,
}: RenderCardProps) {
  const config = STATUS_CONFIG[render.status];
  const prompt = typeof render.metadata?.prompt === 'string' ? render.metadata.prompt : undefined;
  const approvalStatus = typeof render.metadata?.approvalStatus === 'string' ? render.metadata.approvalStatus : undefined;
  const progress = activeRender?.progress;
  const stage = activeRender?.stage;

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:shadow-md',
        'ring-1 ring-transparent hover:ring-[hsl(var(--phase-render))]',
        className,
      )}
    >
      {/* Image / Shimmer */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {render.status === 'ready' && render.storagePath ? (
          <Image
            src={render.storagePath}
            alt={prompt ?? 'AI render'}
            fill
            className="object-cover transition-transform group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : render.status === 'processing' ? (
          <div className="flex h-full w-full items-center justify-center">
            <div className="animate-shimmer h-full w-full bg-gradient-to-r from-muted via-muted-foreground/5 to-muted bg-[length:200%_100%]" />
            {stage && (
              <span className="absolute text-sm font-medium text-muted-foreground">
                {STAGE_LABELS[stage] ?? stage}
              </span>
            )}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-sm text-muted-foreground">Generation failed</span>
          </div>
        )}

        {/* Status badge overlay */}
        <div className="absolute left-2 top-2">
          <Badge variant={config.variant} className={cn(config.pulse && 'animate-pulse-subtle')}>
            {config.label}
          </Badge>
        </div>
      </div>

      {/* Progress bar */}
      {render.status === 'processing' && progress !== undefined && (
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-[hsl(var(--phase-render))] transition-all duration-500 ease-out"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}

      {/* Content */}
      <div className="space-y-2 p-3">
        {prompt && (
          <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {prompt}
          </p>
        )}

        {/* Actions */}
        {render.status === 'ready' && (
          <div className="flex items-center gap-1.5">
            {onCompare && (
              <button
                onClick={onCompare}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Compare
              </button>
            )}
            {onApprove && approvalStatus !== 'approved' && (
              <button
                onClick={onApprove}
                className="rounded-md px-2 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
              >
                Approve
              </button>
            )}
            {onReject && approvalStatus !== 'rejected' && (
              <button
                onClick={onReject}
                className="rounded-md px-2 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                Reject
              </button>
            )}
            {approvalStatus === 'approved' && (
              <Badge variant="success" className="text-[10px]">Approved</Badge>
            )}
            {approvalStatus === 'rejected' && (
              <Badge variant="destructive" className="text-[10px]">Rejected</Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
