import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success:
          "border-transparent bg-success/15 text-success",
        warning:
          "border-transparent bg-warning/15 text-warning",
        info:
          "border-transparent bg-info/15 text-info",
        "phase-intake":
          "border-transparent bg-phase-intake/15 text-phase-intake font-mono text-[0.65rem] uppercase tracking-wider",
        "phase-checklist":
          "border-transparent bg-phase-checklist/15 text-phase-checklist font-mono text-[0.65rem] uppercase tracking-wider",
        "phase-plan":
          "border-transparent bg-phase-plan/15 text-phase-plan font-mono text-[0.65rem] uppercase tracking-wider",
        "phase-render":
          "border-transparent bg-phase-render/15 text-phase-render font-mono text-[0.65rem] uppercase tracking-wider",
        "phase-payment":
          "border-transparent bg-phase-payment/15 text-phase-payment font-mono text-[0.65rem] uppercase tracking-wider",
        "phase-complete":
          "border-transparent bg-phase-complete/15 text-phase-complete font-mono text-[0.65rem] uppercase tracking-wider",
        "phase-iterate":
          "border-transparent bg-phase-iterate/15 text-phase-iterate font-mono text-[0.65rem] uppercase tracking-wider",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
