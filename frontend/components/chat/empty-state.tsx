'use client';

import { Home } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SuggestionBubbles } from './suggestion-bubbles';
import { PHASE_CONFIG, type RenovationPhase } from '@/lib/design-tokens';

const DEFAULT_SUGGESTIONS = [
  'I want to renovate my kitchen',
  'Help me plan a bathroom remodel',
  'What does a full renovation cost?',
  'I need help choosing materials',
];

const PHASE_SUGGESTIONS: Partial<Record<RenovationPhase, string[]>> = {
  INTAKE: DEFAULT_SUGGESTIONS,
  CHECKLIST: [
    'What should I include in my checklist?',
    'Add electrical work to the plan',
    'Do I need permits?',
  ],
  PLAN: [
    'Show me the budget breakdown',
    'What\'s the timeline look like?',
    'Can we reduce costs anywhere?',
  ],
};

interface EmptyStateProps {
  variant: 'first-time' | 'returning';
  sessionTitle?: string;
  phase?: RenovationPhase;
  onSuggestionSelect: (suggestion: string) => void;
  className?: string;
}

export function EmptyState({
  variant,
  sessionTitle,
  phase,
  onSuggestionSelect,
  className,
}: EmptyStateProps) {
  const suggestions = phase
    ? (PHASE_SUGGESTIONS[phase] ?? DEFAULT_SUGGESTIONS)
    : DEFAULT_SUGGESTIONS;

  return (
    <div className={cn('flex flex-1 flex-col items-center justify-center p-8 text-center', className)}>
      {variant === 'returning' ? (
        <>
          <p className="text-sm font-medium text-foreground">
            Welcome back{sessionTitle ? ` to ${sessionTitle}` : ''}
          </p>
          {phase && (
            <p className="mt-1 text-xs text-muted-foreground">
              {PHASE_CONFIG[phase].description}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="rounded-full bg-primary/10 p-4">
            <Home className="h-8 w-8 text-primary" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            Let&apos;s plan something beautiful
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Describe your renovation vision and our AI will help you plan every detail.
          </p>
        </>
      )}
      <SuggestionBubbles
        suggestions={suggestions}
        onSelect={onSuggestionSelect}
        className="mt-6 justify-center"
      />
    </div>
  );
}
