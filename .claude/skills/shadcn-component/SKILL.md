---
name: shadcn-component
description: >
  Scaffolds new React components following the project's 6-wave design system conventions:
  phase tokens (7), material tokens (12), surface tokens (3), custom animations, and
  dark mode (Blueprint Mode). Handles placement in the correct directory (ui, renovation,
  chat, brand), barrel export wiring, 'use client' boundaries, and shadcn/ui composition.
user-invocable: true
---

# /shadcn-component

Component scaffolding skill for the renovation agent monorepo. Creates components that follow the established 6-wave design system, correct directory structure, barrel exports, and naming conventions.

## When to Use

- Creating a new domain component (renovation, chat, brand)
- Adding a new shadcn/ui primitive via the CLI
- Creating a composite component that wraps shadcn primitives with domain logic
- Adding a new skeleton loader variant
- Creating a phase-aware or material-aware component
- Adding a new loading/empty state variant

## Invocation

```
/shadcn-component <description of the component>
```

**Examples**:
```
/shadcn-component create a contractor-comparison table for the PLAN phase
/shadcn-component create a document-card component for rendered PDFs
/shadcn-component add a cost-breakdown table with phase-colored rows
/shadcn-component create a photo-gallery component for room assets
/shadcn-component add an estimate-summary card with budget gauge
```

## Component Directory Map

| Directory | Purpose | Has Barrel Export? | RSC Default? |
|---|---|---|---|
| `frontend/components/ui/` | shadcn/ui primitives + generic UI (skeleton-loader, loading-state) | No (import directly) | Varies |
| `frontend/components/renovation/` | Domain components for renovation features | Yes (`index.ts`) | No (`'use client'`) |
| `frontend/components/chat/` | Chat UX components (messages, inputs, suggestions) | No (import directly) | No (`'use client'`) |
| `frontend/components/brand/` | Brand-specific components (logo, marketing) | No | Varies |
| `frontend/components/providers/` | Context providers (QueryProvider, ThemeProvider) | No | No (`'use client'`) |

### Decision Tree: Where Does My Component Go?

```
Is it a generic UI primitive (button, badge, card, skeleton)?
  YES → components/ui/
  NO ↓
Is it specific to the chat interface (messages, input, bubbles)?
  YES → components/chat/
  NO ↓
Is it specific to renovation domain (rooms, phases, budget, materials)?
  YES → components/renovation/ (+ add to index.ts barrel)
  NO ↓
Is it brand/marketing related?
  YES → components/brand/
  NO → components/ui/ (default)
```

## Workflow

### Step 1: Determine Component Type

Choose from the patterns in [component-patterns.md](./component-patterns.md):
- **Data display**: Card, badge, swatch, gauge (read-only data presentation)
- **Interactive**: Button, approval widget, slider, selection (user actions)
- **Composite**: Wraps multiple shadcn primitives (card + badge + button)
- **Phase-aware**: Accepts `phase?: RenovationPhase` prop, uses phase tokens
- **Material-aware**: Uses `--material-*` tokens for color swatches

### Step 2: Choose Naming Convention

- **File name**: `kebab-case.tsx` (e.g., `contractor-card.tsx`)
- **Component name**: `PascalCase` (e.g., `ContractorCard`)
- **Props interface**: `{ComponentName}Props` (e.g., `ContractorCardProps`)
- Always include `className?: string` prop for composition
- Always accept domain-specific props as typed interfaces, not `any`

### Step 3: Apply Design System

See [design-system-tokens.md](./design-system-tokens.md) for the complete token reference:
- Use `hsl(var(--token))` in Tailwind classes (e.g., `text-primary`, `bg-phase-intake`)
- Use `cn()` from `@/lib/utils` for conditional class merging
- Use semantic color tokens, never raw HSL values
- Dark mode automatically handled by CSS variable swaps in `.dark`

### Step 4: Wire Exports

For `components/renovation/` components:
```typescript
// Add to frontend/components/renovation/index.ts
export { NewComponent } from './new-component';
```

For all other directories, import directly by file path.

### Step 5: Add Skeleton (if applicable)

If the component shows async data, add a skeleton variant to `skeleton-loader.tsx`:
1. Add the variant name to the `SkeletonLoaderProps['variant']` union
2. Create a `{Name}Skeleton` function component
3. Add the case to the `renderItems()` switch

### Step 6: Verify

```bash
cd frontend
npm run type-check   # No TypeScript errors
npm run lint         # No ESLint warnings
```

## Key Rules

1. **Always `'use client'`** for components with onClick, useState, useEffect, or animations
2. **Never use `any`** — always type props with explicit interfaces
3. **Always include `className?: string`** — enables composition via `cn()`
4. **Use `cn()` for conditional classes** — not ternaries or string concatenation
5. **Import from `@/` aliases** — not relative paths (e.g., `@/lib/utils`, `@/components/ui/badge`)
6. **Use `<Image>` from `next/image`** — not `<img>` (ESLint rule)
7. **Icons from `lucide-react`** — the project's icon library
8. **No inline styles** unless dynamically computed (e.g., `style={{ backgroundColor: ... }}`)
9. **Barrel exports only for `renovation/`** — other dirs use direct imports
10. **Currency values use `.currency` class** — for `JetBrains Mono` + `tabular-nums`

## Key References

- [component-patterns.md](./component-patterns.md) — Templates for each component category
- [design-system-tokens.md](./design-system-tokens.md) — Complete token inventory with Tailwind class names
