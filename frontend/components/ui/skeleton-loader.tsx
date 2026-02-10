import { cn } from '@/lib/utils';

interface SkeletonLoaderProps {
  variant: 'chat-message' | 'session-card' | 'room-card' | 'budget-gauge' | 'phase-bar';
  count?: number;
  className?: string;
}

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-muted-foreground/10',
        className
      )}
    />
  );
}

function ChatMessageSkeleton({ align }: { align: 'left' | 'right' }) {
  return (
    <div className={`flex ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-3',
          align === 'right' ? 'rounded-br-sm bg-primary/10' : 'rounded-bl-sm bg-muted'
        )}
      >
        <div className="space-y-2">
          <Shimmer className="h-3 w-48" />
          <Shimmer className="h-3 w-32" />
          {align === 'left' && <Shimmer className="h-3 w-40" />}
        </div>
      </div>
    </div>
  );
}

function SessionCardSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-5">
      <div className="min-w-0 flex-1 space-y-2">
        <Shimmer className="h-4 w-48" />
        <Shimmer className="h-3 w-32" />
      </div>
      <Shimmer className="h-5 w-16 rounded-full" />
    </div>
  );
}

function RoomCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border p-4">
      <Shimmer className="h-10 w-10 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-4 w-32" />
        <Shimmer className="h-3 w-20" />
      </div>
      <Shimmer className="h-4 w-16" />
    </div>
  );
}

function BudgetGaugeSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2">
      <Shimmer className="h-32 w-32 rounded-full" />
      <div className="flex gap-4">
        <Shimmer className="h-3 w-20" />
        <Shimmer className="h-3 w-20" />
      </div>
    </div>
  );
}

function PhaseBarSkeleton() {
  return (
    <div className="flex items-center gap-1 px-2 py-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <Shimmer className="h-8 w-8 rounded-full" />
            <Shimmer className="h-2 w-12" />
          </div>
          {i < 6 && <Shimmer className="mx-1 h-0.5 w-6" />}
        </div>
      ))}
    </div>
  );
}

export function SkeletonLoader({ variant, count = 1, className }: SkeletonLoaderProps) {
  function renderItems(): React.ReactNode {
    switch (variant) {
      case 'chat-message':
        return Array.from({ length: count }, (_, i) => (
          <ChatMessageSkeleton key={i} align={i % 2 === 0 ? 'right' : 'left'} />
        ));
      case 'session-card':
        return Array.from({ length: count }, (_, i) => <SessionCardSkeleton key={i} />);
      case 'room-card':
        return Array.from({ length: count }, (_, i) => <RoomCardSkeleton key={i} />);
      case 'budget-gauge':
        return <BudgetGaugeSkeleton />;
      case 'phase-bar':
        return <PhaseBarSkeleton />;
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      {renderItems()}
    </div>
  );
}
