# Design Tokens CSS

Inline CSS block for PDF templates. Since templates are rendered as HTML strings by Puppeteer, they cannot reference `globals.css` or Tailwind. All design tokens must be inlined.

## Source of Truth

The canonical values come from `frontend/app/globals.css` `:root` block. This file converts the HSL triplets (e.g., `16 65% 45%`) to actual `hsl()` function calls for use in self-contained templates.

**If the design system changes, update this file to match.**

## Complete Token Block

Copy this entire block into the template's `<style>`:

```css
:root {
  /* ============================================
     CORE PALETTE (from globals.css :root)
     ============================================ */

  /* Primary: Warm terracotta */
  --primary: hsl(16, 65%, 45%);
  --primary-foreground: hsl(40, 33%, 98%);

  /* Secondary: Sage green */
  --secondary: hsl(140, 20%, 92%);
  --secondary-foreground: hsl(140, 25%, 20%);

  /* Neutrals: Warm grays */
  --background: hsl(40, 33%, 98%);
  --foreground: hsl(20, 20%, 12%);
  --card: hsl(0, 0%, 100%);
  --muted: hsl(30, 15%, 93%);
  --muted-foreground: hsl(20, 10%, 38%);
  --border: hsl(30, 15%, 88%);

  /* Semantic */
  --success: hsl(142, 71%, 45%);
  --warning: hsl(38, 92%, 50%);
  --destructive: hsl(0, 84%, 60%);
  --info: hsl(210, 60%, 50%);

  /* Chat */
  --chat-user: hsl(16, 65%, 45%);
  --chat-assistant: hsl(30, 15%, 93%);

  /* ============================================
     PHASE ACCENT COLORS
     ============================================ */
  --phase-intake: hsl(210, 60%, 50%);
  --phase-checklist: hsl(45, 85%, 50%);
  --phase-plan: hsl(160, 50%, 42%);
  --phase-render: hsl(270, 55%, 55%);
  --phase-payment: hsl(16, 65%, 45%);
  --phase-complete: hsl(142, 71%, 45%);
  --phase-iterate: hsl(200, 60%, 50%);

  /* ============================================
     MATERIAL PALETTE
     ============================================ */
  --material-oak: hsl(30, 45%, 55%);
  --material-walnut: hsl(25, 40%, 35%);
  --material-maple: hsl(40, 50%, 70%);
  --material-marble: hsl(220, 10%, 90%);
  --material-granite: hsl(0, 0%, 45%);
  --material-slate: hsl(210, 10%, 40%);
  --material-copper: hsl(20, 70%, 50%);
  --material-brass: hsl(45, 65%, 55%);
  --material-steel: hsl(210, 5%, 65%);
  --material-porcelain: hsl(200, 15%, 95%);
  --material-terracotta: hsl(16, 65%, 45%);
  --material-concrete: hsl(30, 5%, 60%);

  /* ============================================
     CHART / DATA VISUALIZATION
     ============================================ */
  --chart-budget: hsl(142, 71%, 45%);
  --chart-spent: hsl(16, 65%, 45%);
  --chart-remaining: hsl(210, 60%, 50%);
  --chart-timeline: hsl(45, 85%, 50%);
}
```

## Phase Color Mapping

Use this map when you need to dynamically set a phase color:

| Phase | CSS Variable | HSL Value | Hex (approx) |
|---|---|---|---|
| INTAKE | `--phase-intake` | `hsl(210, 60%, 50%)` | `#3385CC` |
| CHECKLIST | `--phase-checklist` | `hsl(45, 85%, 50%)` | `#EBB513` |
| PLAN | `--phase-plan` | `hsl(160, 50%, 42%)` | `#35A87C` |
| RENDER | `--phase-render` | `hsl(270, 55%, 55%)` | `#8B5AC9` |
| PAYMENT | `--phase-payment` | `hsl(16, 65%, 45%)` | `#BD5A27` |
| COMPLETE | `--phase-complete` | `hsl(142, 71%, 45%)` | `#21C45D` |
| ITERATE | `--phase-iterate` | `hsl(200, 60%, 50%)` | `#3399CC` |

**CHECKLIST** uses dark text (`--foreground`) because its yellow background has insufficient contrast with white text.

## Material Color Mapping

For inline material swatches in product tables:

| Material | CSS Variable | HSL Value |
|---|---|---|
| Oak | `--material-oak` | `hsl(30, 45%, 55%)` |
| Walnut | `--material-walnut` | `hsl(25, 40%, 35%)` |
| Maple | `--material-maple` | `hsl(40, 50%, 70%)` |
| Marble | `--material-marble` | `hsl(220, 10%, 90%)` |
| Granite | `--material-granite` | `hsl(0, 0%, 45%)` |
| Slate | `--material-slate` | `hsl(210, 10%, 40%)` |
| Copper | `--material-copper` | `hsl(20, 70%, 50%)` |
| Brass | `--material-brass` | `hsl(45, 65%, 55%)` |
| Steel | `--material-steel` | `hsl(210, 5%, 65%)` |
| Porcelain | `--material-porcelain` | `hsl(200, 15%, 95%)` |
| Terracotta | `--material-terracotta` | `hsl(16, 65%, 45%)` |
| Concrete | `--material-concrete` | `hsl(30, 5%, 60%)` |

## Typography Scale (Print)

For PDF templates, use fixed `pt` sizes instead of fluid `clamp()`:

| Level | Font Family | Size | Weight | Line Height |
|---|---|---|---|---|
| h1 | DM Serif Display | 24pt | 400 | 1.2 |
| h2 | DM Serif Display | 18pt | 400 | 1.2 |
| h3 | DM Serif Text | 14pt | 400 | 1.3 |
| h4 | DM Serif Text | 12pt | 400 | 1.3 |
| body | Inter | 10pt | 400 | 1.6 |
| small | Inter | 8pt | 400 | 1.5 |
| code | JetBrains Mono | 9pt | 400 | 1.4 |
| currency | JetBrains Mono | inherit | 600 | — |
| meta | Inter | 7pt | 400 | 1.4 |

## Usage with Handlebars Phase Helper

```handlebars
{{!-- Dynamic phase-colored border --}}
<div style="border-left: 3pt solid {{phaseColor phase}}; padding-left: 12pt;">
  <h3>{{roomName}}</h3>
  <p>Phase: <span class="phase-badge phase-badge--{{lowercase phase}}">{{phase}}</span></p>
</div>
```

## Accessibility Notes

- Minimum text size in PDF: 7pt (footer meta)
- Body text: 10pt minimum for readability
- Color contrast: All text on white background meets WCAG AA
- `--muted-foreground` at 38% lightness provides 4.8:1 contrast on white
