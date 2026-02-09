'use client';

import { cn } from '@/lib/utils';

interface MaterialSwatchProps {
  material: string;
  name: string;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

export function MaterialSwatch({ material, name, selected = false, onClick, className }: MaterialSwatchProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-1.5 transition-transform hover:scale-110',
        className
      )}
    >
      <div
        className={cn(
          'h-10 w-10 rounded-full border-2 transition-all',
          selected ? 'border-primary ring-2 ring-primary/30 scale-110' : 'border-border'
        )}
        style={{ backgroundColor: `hsl(var(--material-${material}))` }}
      />
      <span className="text-[0.65rem] text-muted-foreground capitalize">{name}</span>
    </button>
  );
}
