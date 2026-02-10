'use client';

import { MapPin, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ContractorCardProps {
  name: string;
  specialty: string;
  estimatedCost: number | null;
  currency?: string;
  rating?: number;
  location?: string;
  className?: string;
}

export function ContractorCard({
  name,
  specialty,
  estimatedCost,
  currency = '$',
  rating,
  location,
  className,
}: ContractorCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{name}</p>
          <Badge variant="secondary" className="mt-1">
            {specialty}
          </Badge>
        </div>
        {rating !== undefined && (
          <div className="flex items-center gap-1 text-sm">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            <span className="tabular-nums">{rating.toFixed(1)}</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        {estimatedCost !== null && (
          <span className="currency">
            {currency}{estimatedCost.toLocaleString()}
          </span>
        )}
        {location && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {location}
          </span>
        )}
      </div>
    </div>
  );
}
