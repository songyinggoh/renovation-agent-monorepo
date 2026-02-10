'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { PHASE_CONFIG, type RenovationPhase } from '@/lib/design-tokens';
import { CheckCircle } from 'lucide-react';

interface PhaseTransitionProps {
  fromPhase: RenovationPhase;
  toPhase: RenovationPhase;
  onComplete?: () => void;
  className?: string;
}

export function PhaseTransition({ fromPhase, toPhase, onComplete, className }: PhaseTransitionProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm bg-blueprint-grid animate-fade-in',
        className
      )}
      onClick={() => {
        setVisible(false);
        onComplete?.();
      }}
    >
      <div className="animate-scale-in text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-phase-complete/20">
          <CheckCircle className="h-8 w-8 text-phase-complete" />
        </div>
        <p className="mt-4 font-display text-2xl tracking-tight">
          {PHASE_CONFIG[fromPhase].label} Complete
        </p>
        <p className="mt-2 text-muted-foreground">
          Moving to {PHASE_CONFIG[toPhase].label}
        </p>
      </div>
    </div>
  );
}
