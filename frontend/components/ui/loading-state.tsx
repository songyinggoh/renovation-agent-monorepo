import { cn } from '@/lib/utils';

interface LoadingStateProps {
  message?: string;
  submessage?: string;
  variant?: 'blueprint' | 'building' | 'measuring';
  className?: string;
}

function BlueprintAnimation() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="text-primary">
      <rect
        x="8" y="8" width="48" height="48" rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="180"
        strokeDashoffset="180"
        className="animate-[blueprint-draw_1.5s_ease-out_forwards]"
      />
      <line
        x1="8" y1="24" x2="56" y2="24"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="48"
        strokeDashoffset="48"
        className="animate-[blueprint-draw_1s_ease-out_0.5s_forwards]"
      />
      <line
        x1="32" y1="24" x2="32" y2="56"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="32"
        strokeDashoffset="32"
        className="animate-[blueprint-draw_1s_ease-out_0.8s_forwards]"
      />
    </svg>
  );
}

function BuildingAnimation() {
  return (
    <div className="flex items-end justify-center gap-1 h-16">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-4 bg-primary/60 rounded-t animate-[blocks-stack_0.6s_ease-out_forwards]"
          style={{
            height: `${(i + 1) * 16}px`,
            animationDelay: `${i * 200}ms`,
            animationFillMode: 'backwards',
          }}
        />
      ))}
    </div>
  );
}

function MeasuringAnimation() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary animate-[shimmer-bar_1.5s_ease-in-out_infinite] rounded-full" style={{ width: '60%' }} />
      </div>
    </div>
  );
}

function AnimationForVariant({ variant }: { variant: NonNullable<LoadingStateProps['variant']> }) {
  switch (variant) {
    case 'blueprint':
      return <BlueprintAnimation />;
    case 'building':
      return <BuildingAnimation />;
    case 'measuring':
      return <MeasuringAnimation />;
  }
}

export function LoadingState({
  message = 'Loading...',
  submessage,
  variant = 'blueprint',
  className,
}: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 p-8', className)}>
      <AnimationForVariant variant={variant} />
      <div className="text-center">
        <p className="animate-pulse-subtle text-sm font-medium text-muted-foreground">
          {message}
        </p>
        {submessage && (
          <p className="mt-1 text-xs text-muted-foreground/70">{submessage}</p>
        )}
      </div>
    </div>
  );
}
