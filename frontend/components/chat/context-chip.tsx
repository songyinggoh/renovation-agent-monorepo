'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContextChipProps {
  label: string;
  icon?: React.ReactNode;
  onRemove?: () => void;
  className?: string;
}

export function ContextChip({ label, icon, onRemove, className }: ContextChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary',
        className
      )}
    >
      {icon}
      {label}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
          aria-label={`Remove ${label}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}
