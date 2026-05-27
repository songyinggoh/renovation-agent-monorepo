# Design System Tokens

Complete token inventory for the renovation agent frontend. Source of truth: `frontend/app/globals.css`.

## Core Palette

| Token | Tailwind Class | HSL (Light) | HSL (Dark / Blueprint) | Use For |
|---|---|---|---|---|
| `--primary` | `text-primary`, `bg-primary` | `16 65% 45%` | `20 70% 55%` | Terracotta — CTAs, active states |
| `--primary-foreground` | `text-primary-foreground` | `40 33% 98%` | `220 25% 8%` | Text on primary backgrounds |
| `--secondary` | `bg-secondary` | `140 20% 92%` | `220 15% 18%` | Sage green — secondary actions |
| `--secondary-foreground` | `text-secondary-foreground` | `140 25% 20%` | `40 15% 90%` | Text on secondary backgrounds |
| `--background` | `bg-background` | `40 33% 98%` | `220 25% 8%` | Page background |
| `--foreground` | `text-foreground` | `20 20% 12%` | `40 15% 90%` | Default text |
| `--card` | `bg-card` | `0 0% 100%` | `220 20% 12%` | Card backgrounds |
| `--muted` | `bg-muted` | `30 15% 93%` | `220 15% 18%` | Subtle backgrounds |
| `--muted-foreground` | `text-muted-foreground` | `20 10% 38%` | `220 10% 55%` | Secondary text (WCAG AA: 4.8:1) |
| `--border` | `border-border` | `30 15% 88%` | `220 15% 20%` | Borders, dividers |

## Semantic Colors

| Token | Tailwind Class | HSL | Use For |
|---|---|---|---|
| `--success` | `text-success`, `bg-success/15` | `142 71% 45%` | Completed states, positive actions |
| `--warning` | `text-warning`, `bg-warning/15` | `38 92% 50%` | Caution states, star ratings |
| `--destructive` | `text-destructive`, `bg-destructive/15` | `0 84% 60%` | Errors, delete actions, over-budget |
| `--info` | `text-info`, `bg-info/15` | `210 60% 50%` | Informational callouts |

## Phase Colors (7)

| Phase | Token | Tailwind Class | HSL (Light) |
|---|---|---|---|
| INTAKE | `--phase-intake` | `text-phase-intake`, `bg-phase-intake/15` | `210 60% 50%` |
| CHECKLIST | `--phase-checklist` | `text-phase-checklist`, `bg-phase-checklist/15` | `45 85% 50%` |
| PLAN | `--phase-plan` | `text-phase-plan`, `bg-phase-plan/15` | `160 50% 42%` |
| RENDER | `--phase-render` | `text-phase-render`, `bg-phase-render/15` | `270 55% 55%` |
| PAYMENT | `--phase-payment` | `text-phase-payment`, `bg-phase-payment/15` | `16 65% 45%` |
| COMPLETE | `--phase-complete` | `text-phase-complete`, `bg-phase-complete/15` | `142 71% 45%` |
| ITERATE | `--phase-iterate` | `text-phase-iterate`, `bg-phase-iterate/15` | `200 60% 50%` |

**Dynamic phase color** (when phase is a variable):
```typescript
// Via inline style (when phase is dynamic):
style={{ color: `hsl(var(${PHASE_CONFIG[phase].accentVar}))` }}

// Via badge variant (preferred):
<Badge variant={`phase-${phase.toLowerCase()}`}>{phase}</Badge>
```

## Material Colors (12)

| Material | Token | HSL (Light) |
|---|---|---|
| Oak | `--material-oak` | `30 45% 55%` |
| Walnut | `--material-walnut` | `25 40% 35%` |
| Maple | `--material-maple` | `40 50% 70%` |
| Marble | `--material-marble` | `220 10% 90%` |
| Granite | `--material-granite` | `0 0% 45%` |
| Slate | `--material-slate` | `210 10% 40%` |
| Copper | `--material-copper` | `20 70% 50%` |
| Brass | `--material-brass` | `45 65% 55%` |
| Steel | `--material-steel` | `210 5% 65%` |
| Porcelain | `--material-porcelain` | `200 15% 95%` |
| Terracotta | `--material-terracotta` | `16 65% 45%` |
| Concrete | `--material-concrete` | `30 5% 60%` |

**Usage** (always via inline style since no Tailwind classes generated):
```typescript
style={{ backgroundColor: `hsl(var(--material-${materialName}))` }}
```

## Surface Tokens (3)

| Surface | Token | Utility Class | Use For |
|---|---|---|---|
| Chat | `--surface-chat` | `.surface-chat` | Chat interface backgrounds |
| Dashboard | `--surface-dashboard` | `.surface-dashboard` | Dashboard/overview pages |
| Planning | `--surface-planning` | `.surface-planning` | Planning configuration pages |

Apply as a CSS class on page-level containers, not individual components.

## Chart Colors

| Token | HSL | Use For |
|---|---|---|
| `--chart-budget` | `142 71% 45%` | Budget remaining (green) |
| `--chart-spent` | `16 65% 45%` | Amount spent (terracotta) |
| `--chart-remaining` | `210 60% 50%` | Remaining allocation (blue) |
| `--chart-timeline` | `45 85% 50%` | Timeline indicators (yellow) |

## Typography Utility Classes

| Class | Font | Effect |
|---|---|---|
| `.currency` | JetBrains Mono | Monospace + tabular-nums for aligned currency values |
| `.measurement` | JetBrains Mono | Monospace + tabular-nums for dimensions |
| `.technical-code` | JetBrains Mono | Monospace for technical identifiers |
| `.tabular-nums` | Inherited | Just tabular-nums variant (for ratings, etc.) |

## Fluid Typography (Screen)

| Class | Range | Use For |
|---|---|---|
| `text-fluid-xs` | 0.7rem → 0.75rem | Fine print |
| `text-fluid-sm` | 0.8rem → 0.875rem | Secondary text |
| `text-fluid-base` | 0.9rem → 1rem | Body text |
| `text-fluid-lg` | 1.1rem → 1.25rem | Emphasis |
| `text-fluid-xl` | 1.2rem → 1.5rem | Section headers |
| `text-fluid-2xl` | 1.4rem → 1.875rem | Page headers |
| `text-fluid-3xl` | 1.75rem → 2.25rem | Hero text |
| `text-fluid-4xl` | 2rem → 3rem | Display text |

## Font Families

| CSS Variable | Tailwind Class | Font | Use For |
|---|---|---|---|
| `--font-sans` | `font-sans` | Inter | Body, UI labels (default) |
| `--font-display` | `font-display` | DM Serif Display | h1, h2 headings |
| `--font-display-text` | — | DM Serif Text | h3-h6 headings |
| `--font-mono` | `font-mono` | JetBrains Mono | Code, currency, measurements |

## Dark Mode (Blueprint Mode)

Dark mode is activated by the `.dark` class on `<html>`. All CSS variables automatically swap — no conditional logic needed in components.

**Key differences in Blueprint Mode**:
- Background: Deep navy (`220 25% 8%`) instead of warm white
- Primary: Copper (`20 70% 55%`) instead of terracotta
- Cards: Dark navy (`220 20% 12%`) instead of white
- Phase/material colors slightly adjusted for dark background contrast

Components should **never** hard-code light or dark values. Always use CSS variable tokens.

## Common Tailwind Patterns

```typescript
// Card container
'rounded-lg border border-border bg-card p-4'

// Hover interaction
'transition-all hover:shadow-md hover:scale-[1.02]'

// Icon in circle
'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10'

// Semantic status indicator
'bg-success/15 text-success'   // Approved/complete
'bg-warning/15 text-warning'   // Caution
'bg-destructive/15 text-destructive'  // Error/rejected

// Phase-colored element (dynamic)
`bg-phase-${phase.toLowerCase()}/15 text-phase-${phase.toLowerCase()}`

// Muted secondary text
'text-xs text-muted-foreground'

// Truncated text with min-width
'min-w-0 flex-1 truncate'
```

## shadcn/ui Configuration

From `frontend/components.json`:

```json
{
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

**Adding a new shadcn primitive**:
```bash
npx shadcn@latest add [component] --yes
```

This installs to `frontend/components/ui/`. The `--yes` flag skips confirmation prompts.
