'use client';

import { cn } from '@/lib/utils';

interface SuggestionBubblesProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  className?: string;
}

export function SuggestionBubbles({ suggestions, onSelect, className }: SuggestionBubblesProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap gap-2 px-4 py-3', className)}>
      {suggestions.map((suggestion, index) => (
        <button
          key={`${index}-${suggestion}`}
          onClick={() => onSelect(suggestion)}
          className="animate-slide-up rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'backwards' }}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
