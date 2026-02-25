# Component Patterns

Concrete templates for each component category in the renovation agent frontend. All patterns are extracted from existing components in the codebase.

## Common Imports

Every component starts with these:

```typescript
'use client';                                     // Only if interactive
import { cn } from '@/lib/utils';                 // Always — class merging
import { SomeIcon } from 'lucide-react';          // If icons needed
import { Badge } from '@/components/ui/badge';    // If using shadcn/ui
import { Button } from '@/components/ui/button';  // If using buttons
import type { RenovationPhase } from '@/lib/design-tokens';  // If phase-aware
import { PHASE_CONFIG, PHASE_INDEX, RENOVATION_PHASES } from '@/lib/design-tokens';  // If phase data needed
import type { RoomSummary, SessionSummary } from '@/types/renovation';  // If domain types needed
```

## Pattern 1: Data Display Card

Used for: room cards, contractor cards, document cards, estimate summaries.

**Conventions**:
- Rounded border container: `rounded-lg border border-border bg-card p-4`
- Flexbox layout with icon/content/value columns
- Currency values wrapped in `<span className="currency">`
- Optional `onClick` prop makes it interactive

```typescript
'use client';

import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DocumentCardProps {
  title: string;
  type: string;
  generatedAt: string;
  fileSize?: number;
  onClick?: () => void;
  className?: string;
}

export function DocumentCard({
  title,
  type,
  generatedAt,
  fileSize,
  onClick,
  className,
}: DocumentCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-4 rounded-lg border border-border bg-card p-4 text-left transition-all hover:shadow-md hover:scale-[1.02]',
        onClick && 'cursor-pointer',
        !onClick && 'cursor-default',
        className
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <FileText className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{title}</p>
        <p className="text-xs text-muted-foreground">{type}</p>
      </div>
      {fileSize && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {(fileSize / 1024).toFixed(0)} KB
        </span>
      )}
    </button>
  );
}
```

## Pattern 2: Phase-Aware Component

Used for: progress bars, phase badges, phase-colored borders, timeline elements.

**Conventions**:
- Accept `phase?: RenovationPhase` prop (or `currentPhase`)
- Use `PHASE_CONFIG[phase]` for labels, descriptions, icons
- Use `PHASE_INDEX[phase]` for ordering/progress calculations
- Phase colors via Tailwind: `text-phase-intake`, `bg-phase-plan/15`, etc.
- Map phase icons from `lucide-react` using a const record

```typescript
'use client';

import { cn } from '@/lib/utils';
import { PHASE_CONFIG, type RenovationPhase } from '@/lib/design-tokens';

interface PhaseIndicatorProps {
  phase: RenovationPhase;
  showDescription?: boolean;
  className?: string;
}

export function PhaseIndicator({ phase, showDescription = false, className }: PhaseIndicatorProps) {
  const config = PHASE_CONFIG[phase];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: `hsl(var(${config.accentVar}))` }}
      />
      <span className="text-sm font-medium">{config.label}</span>
      {showDescription && (
        <span className="text-xs text-muted-foreground">{config.description}</span>
      )}
    </div>
  );
}
```

**Phase badge usage** (using existing Badge component):

```typescript
import { Badge } from '@/components/ui/badge';
import type { RenovationPhase } from '@/lib/design-tokens';

// The badge component already has phase variants built in:
<Badge variant={`phase-${phase.toLowerCase()}`}>{phase}</Badge>
```

Available badge variants: `phase-intake`, `phase-checklist`, `phase-plan`, `phase-render`, `phase-payment`, `phase-complete`, `phase-iterate`.

## Pattern 3: Material-Aware Component

Used for: material swatches, product cards with material indicators, palette displays.

**Conventions**:
- Material colors accessed via `hsl(var(--material-{name}))` in inline styles
- 12 materials: oak, walnut, maple, marble, granite, slate, copper, brass, steel, porcelain, terracotta, concrete
- Small circular swatches: `h-8 w-8 rounded-full` (or `h-10 w-10` for larger)

```typescript
'use client';

import { cn } from '@/lib/utils';

interface MaterialPaletteProps {
  materials: string[];
  selected?: string;
  onSelect?: (material: string) => void;
  className?: string;
}

export function MaterialPalette({ materials, selected, onSelect, className }: MaterialPaletteProps) {
  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      {materials.map((material) => (
        <button
          key={material}
          onClick={() => onSelect?.(material)}
          className="flex flex-col items-center gap-1.5 transition-transform hover:scale-110"
        >
          <div
            className={cn(
              'h-10 w-10 rounded-full border-2 transition-all',
              selected === material
                ? 'border-primary ring-2 ring-primary/30 scale-110'
                : 'border-border'
            )}
            style={{ backgroundColor: `hsl(var(--material-${material}))` }}
          />
          <span className="text-[0.65rem] text-muted-foreground capitalize">{material}</span>
        </button>
      ))}
    </div>
  );
}
```

## Pattern 4: Composite Card with Actions

Used for: approval widgets, interactive cards with buttons, expandable details.

**Conventions**:
- Compose shadcn `Button` and `Badge` inside a card layout
- Use semantic status colors: `bg-success/15 text-success`, `bg-destructive/15 text-destructive`
- Status state via discriminated union type or string literal union

```typescript
'use client';

import { Check, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ActionCardProps {
  title: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected';
  onApprove?: () => void;
  onReject?: () => void;
  className?: string;
}

export function ActionCard({
  title,
  description,
  status,
  onApprove,
  onReject,
  className,
}: ActionCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        {status !== 'pending' && (
          <Badge variant={status === 'approved' ? 'success' : 'destructive'}>
            {status}
          </Badge>
        )}
      </div>
      {status === 'pending' && (
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
      )}
    </div>
  );
}
```

## Pattern 5: Empty/Loading State

Used for: first-time user experience, data loading, error states.

**Conventions**:
- Centered layout: `flex flex-1 flex-col items-center justify-center p-8 text-center`
- Large icon in circle: `rounded-full bg-primary/10 p-4` + icon `h-8 w-8`
- Heading + description + suggestion bubbles
- Phase-aware suggestions using `PHASE_CONFIG`
- Loading animations: `blueprint`, `building`, `measuring` variants

```typescript
'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NoResultsStateProps {
  query: string;
  onClear?: () => void;
  className?: string;
}

export function NoResultsState({ query, onClear, className }: NoResultsStateProps) {
  return (
    <div className={cn('flex flex-1 flex-col items-center justify-center p-8 text-center', className)}>
      <div className="rounded-full bg-muted p-4">
        <Search className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-foreground">No results found</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        We couldn&apos;t find anything for &ldquo;{query}&rdquo;. Try a different search term.
      </p>
      {onClear && (
        <button
          onClick={onClear}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Clear search
        </button>
      )}
    </div>
  );
}
```

## Pattern 6: Skeleton Loader Variant

Add to `frontend/components/ui/skeleton-loader.tsx`.

**Conventions**:
- Each variant is a private function component (not exported)
- Uses the `Shimmer` helper for animated pulse blocks
- Mirrors the visual structure of the real component

```typescript
// 1. Add variant to the union type
interface SkeletonLoaderProps {
  variant: 'chat-message' | 'session-card' | 'room-card' | 'budget-gauge' | 'phase-bar' | 'document-card';
  //                                                                                        ^^^^^^^^^ new
  count?: number;
  className?: string;
}

// 2. Create the skeleton function
function DocumentCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border p-4">
      <Shimmer className="h-10 w-10 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-4 w-40" />
        <Shimmer className="h-3 w-24" />
      </div>
      <Shimmer className="h-3 w-12" />
    </div>
  );
}

// 3. Add case to renderItems()
case 'document-card':
  return Array.from({ length: count }, (_, i) => <DocumentCardSkeleton key={i} />);
```

## Pattern 7: SVG-Based Visualization

Used for: budget gauge, progress rings, timeline charts.

**Conventions**:
- Inline SVG in JSX
- Dynamic values via props (percentages, amounts)
- Colors from CSS variables: `hsl(var(--chart-budget))`, `hsl(var(--destructive))`
- Transitions: `className="transition-all duration-700"`

```typescript
// See BudgetGauge for the canonical SVG arc pattern:
// frontend/components/renovation/budget-gauge.tsx
```

## Animation Classes Available

Use these Tailwind animation classes (defined in `globals.css`):

| Class | Effect | Use For |
|---|---|---|
| `animate-slide-up` | Slides up with fade-in | Staggered list items |
| `animate-fade-in` | Simple opacity fade | Appearing elements |
| `animate-scale-in` | Scale from 0.95 → 1 + fade | Modal/card entry |
| `animate-pulse-subtle` | Gentle opacity pulse | Active/current state |
| `animate-shimmer` | Horizontal shimmer sweep | Loading states |

For staggered animations:
```typescript
style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'backwards' }}
```

## Surface Classes

Apply to page-level containers, not individual components:

| Class | Background | Use For |
|---|---|---|
| `.surface-chat` | `--surface-chat` | Chat interface pages |
| `.surface-dashboard` | `--surface-dashboard` | Dashboard/overview pages |
| `.surface-planning` | `--surface-planning` | Planning/configuration pages |
