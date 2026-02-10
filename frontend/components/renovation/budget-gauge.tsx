'use client';

import { cn } from '@/lib/utils';

interface BudgetGaugeProps {
  totalBudget: number;
  spent: number;
  currency?: string;
  className?: string;
}

export function BudgetGauge({ totalBudget, spent, currency = '$', className }: BudgetGaugeProps) {
  const percentage = totalBudget > 0 ? Math.min((spent / totalBudget) * 100, 100) : 0;
  const remaining = totalBudget - spent;

  const getColor = () => {
    if (percentage >= 100) return 'hsl(var(--destructive))';
    if (percentage >= 90) return 'hsl(var(--warning))';
    return 'hsl(var(--chart-budget))';
  };

  const arcDegrees = (percentage / 100) * 270;

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div className="relative h-32 w-32">
        {/* Background arc */}
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-[135deg]">
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth="8"
            strokeDasharray={`${(270 / 360) * 2 * Math.PI * 50} ${2 * Math.PI * 50}`}
            strokeLinecap="round"
          />
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke={getColor()}
            strokeWidth="8"
            strokeDasharray={`${(arcDegrees / 360) * 2 * Math.PI * 50} ${2 * Math.PI * 50}`}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="currency text-lg">
            {currency}{remaining.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">remaining</span>
        </div>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>Spent: <span className="currency text-foreground">{currency}{spent.toLocaleString()}</span></span>
        <span>Total: <span className="currency text-foreground">{currency}{totalBudget.toLocaleString()}</span></span>
      </div>
    </div>
  );
}
