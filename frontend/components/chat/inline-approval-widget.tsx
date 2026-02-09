'use client';

import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface InlineApprovalWidgetProps {
  title: string;
  description: string;
  onApprove: () => void;
  onReject: () => void;
  status?: 'pending' | 'approved' | 'rejected';
  className?: string;
}

export function InlineApprovalWidget({
  title,
  description,
  onApprove,
  onReject,
  status = 'pending',
  className,
}: InlineApprovalWidgetProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4 my-2', className)}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>

      {status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onApprove} className="gap-1.5">
            <Check className="h-3.5 w-3.5" />
            Approve
          </Button>
          <Button size="sm" variant="outline" onClick={onReject} className="gap-1.5">
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
      ) : (
        <div className={cn(
          'mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
          status === 'approved' && 'bg-success/15 text-success',
          status === 'rejected' && 'bg-destructive/15 text-destructive'
        )}>
          {status === 'approved' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {status === 'approved' ? 'Approved' : 'Rejected'}
        </div>
      )}
    </div>
  );
}
