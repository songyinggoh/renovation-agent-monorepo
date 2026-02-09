'use client';

import { cn } from '@/lib/utils';
import { BudgetGauge } from '@/components/renovation/budget-gauge';
import { PhaseProgressBar } from '@/components/renovation/phase-progress-bar';
import type { RenovationPhase } from '@/lib/design-tokens';

interface BudgetSummaryData {
  totalBudget: number;
  spent: number;
  currency?: string;
  breakdown?: Array<{ label: string; amount: number }>;
}

interface PhaseTransitionData {
  phase: RenovationPhase;
  message?: string;
}

type VisualResponseProps = {
  className?: string;
} & (
  | { type: 'budget-summary'; data: BudgetSummaryData }
  | { type: 'phase-transition'; data: PhaseTransitionData }
);

export function VisualResponse(props: VisualResponseProps) {
  const { className } = props;

  switch (props.type) {
    case 'budget-summary': {
      const { totalBudget, spent, currency, breakdown } = props.data;
      return (
        <div className={cn('rounded-lg border border-border bg-card p-4 my-2', className)}>
          <BudgetGauge totalBudget={totalBudget} spent={spent} currency={currency} />
          {breakdown && breakdown.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {breakdown.map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="currency">${item.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'phase-transition': {
      const { phase, message } = props.data;
      const defaultMessage = `Moving to ${phase.charAt(0) + phase.slice(1).toLowerCase()}`;
      return (
        <div className={cn('rounded-lg border border-border bg-card p-4 my-2 text-center', className)}>
          <p className="font-display text-lg">{message ?? defaultMessage}</p>
          <PhaseProgressBar currentPhase={phase} className="mt-3 justify-center" />
        </div>
      );
    }
  }
}
