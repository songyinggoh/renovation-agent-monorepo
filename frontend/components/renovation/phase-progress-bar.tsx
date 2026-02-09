'use client';

import {
  ClipboardList,
  CheckSquare,
  Map,
  ImageIcon,
  CreditCard,
  CheckCircle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RENOVATION_PHASES, PHASE_INDEX, type RenovationPhase } from '@/lib/design-tokens';

const PHASE_ICONS = {
  INTAKE: ClipboardList,
  CHECKLIST: CheckSquare,
  PLAN: Map,
  RENDER: ImageIcon,
  PAYMENT: CreditCard,
  COMPLETE: CheckCircle,
  ITERATE: RefreshCw,
} as const;

interface PhaseProgressBarProps {
  currentPhase: RenovationPhase;
  className?: string;
}

export function PhaseProgressBar({ currentPhase, className }: PhaseProgressBarProps) {
  const currentIndex = PHASE_INDEX[currentPhase];

  return (
    <div className={cn('flex items-center gap-1 overflow-x-auto px-2 py-3', className)}>
      {RENOVATION_PHASES.map((phase, index) => {
        const Icon = PHASE_ICONS[phase];
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isFuture = index > currentIndex;

        return (
          <div key={phase} className="flex items-center">
            {/* Step indicator */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors',
                  isCompleted && 'border-transparent bg-phase-complete text-white',
                  isCurrent && 'animate-pulse-subtle border-primary bg-primary/10 text-primary',
                  isFuture && 'border-border bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={cn(
                  'text-[0.6rem] font-medium whitespace-nowrap',
                  isCompleted && 'text-phase-complete',
                  isCurrent && 'text-primary font-semibold',
                  isFuture && 'text-muted-foreground'
                )}
              >
                {phase.charAt(0) + phase.slice(1).toLowerCase()}
              </span>
            </div>

            {/* Connector line */}
            {index < RENOVATION_PHASES.length - 1 && (
              <div
                className={cn(
                  'mx-1 h-0.5 w-6 shrink-0',
                  index < currentIndex ? 'bg-phase-complete' : 'bg-border'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
