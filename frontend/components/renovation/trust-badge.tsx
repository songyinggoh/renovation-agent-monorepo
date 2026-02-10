import { Shield, CheckCircle, Lock, Award } from 'lucide-react';
import { cn } from '@/lib/utils';

const BADGE_CONFIG = {
  secure: { icon: Shield, label: 'Secure' },
  verified: { icon: CheckCircle, label: 'Verified' },
  encrypted: { icon: Lock, label: 'Encrypted' },
  guaranteed: { icon: Award, label: 'Guaranteed' },
} as const;

interface TrustBadgeProps {
  type: keyof typeof BADGE_CONFIG;
  className?: string;
}

export function TrustBadge({ type, className }: TrustBadgeProps) {
  const { icon: Icon, label } = BADGE_CONFIG[type];

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
