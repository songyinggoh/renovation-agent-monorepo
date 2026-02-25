# Template Structure

Complete HTML boilerplate for Puppeteer PDF templates. Every template follows this structure.

## Base Template

```handlebars
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{projectTitle}} — {{documentTitle}}</title>

  {{!-- Google Fonts (loaded via @import for Puppeteer compatibility) --}}
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=DM+Serif+Display&family=DM+Serif+Text&family=JetBrains+Mono:wght@400;500&display=swap');
  </style>

  <style>
    /* ============================================
       RESET & BASE
       ============================================ */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      font-size: 11pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: hsl(20 20% 12%);
      background: white;
      line-height: 1.6;
    }

    /* ============================================
       DESIGN TOKENS (from globals.css :root)
       ============================================ */
    {{!-- See design-tokens-css.md for the full token set --}}

    :root {
      /* Core palette */
      --primary: hsl(16, 65%, 45%);
      --primary-light: hsl(16, 65%, 55%);
      --secondary: hsl(140, 20%, 92%);
      --secondary-dark: hsl(140, 25%, 20%);
      --background: hsl(40, 33%, 98%);
      --foreground: hsl(20, 20%, 12%);
      --muted: hsl(30, 15%, 93%);
      --muted-foreground: hsl(20, 10%, 38%);
      --border: hsl(30, 15%, 88%);
      --success: hsl(142, 71%, 45%);
      --warning: hsl(38, 92%, 50%);
      --destructive: hsl(0, 84%, 60%);

      /* Phase colors */
      --phase-intake: hsl(210, 60%, 50%);
      --phase-checklist: hsl(45, 85%, 50%);
      --phase-plan: hsl(160, 50%, 42%);
      --phase-render: hsl(270, 55%, 55%);
      --phase-payment: hsl(16, 65%, 45%);
      --phase-complete: hsl(142, 71%, 45%);
      --phase-iterate: hsl(200, 60%, 50%);

      /* Material colors */
      --material-oak: hsl(30, 45%, 55%);
      --material-walnut: hsl(25, 40%, 35%);
      --material-marble: hsl(220, 10%, 90%);
      --material-copper: hsl(20, 70%, 50%);
      --material-brass: hsl(45, 65%, 55%);
      --material-steel: hsl(210, 5%, 65%);
    }

    /* ============================================
       TYPOGRAPHY (matches frontend font system)
       ============================================ */

    h1, h2 {
      font-family: 'DM Serif Display', Georgia, serif;
      font-weight: 400;
      line-height: 1.2;
    }

    h3, h4, h5, h6 {
      font-family: 'DM Serif Text', Georgia, serif;
      font-weight: 400;
      line-height: 1.3;
    }

    h1 { font-size: 24pt; margin-bottom: 8pt; color: var(--foreground); }
    h2 { font-size: 18pt; margin-bottom: 6pt; color: var(--foreground); }
    h3 { font-size: 14pt; margin-bottom: 4pt; color: var(--foreground); }
    h4 { font-size: 12pt; margin-bottom: 4pt; color: var(--muted-foreground); }

    p { margin-bottom: 8pt; }

    code, .technical-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9pt;
      background: var(--muted);
      padding: 1pt 3pt;
      border-radius: 2pt;
    }

    .currency {
      font-family: 'JetBrains Mono', monospace;
      font-variant-numeric: tabular-nums;
    }

    .measurement {
      font-family: 'JetBrains Mono', monospace;
      font-variant-numeric: tabular-nums;
    }

    /* ============================================
       PRINT & PAGE LAYOUT
       ============================================ */

    @page {
      size: A4;
      margin: 15mm 15mm 20mm 15mm;
    }

    @page :first {
      margin-top: 10mm;
    }

    .page-break {
      page-break-after: always;
      break-after: page;
    }

    .no-break {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* ============================================
       HEADER / FOOTER
       ============================================ */

    .doc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12pt;
      border-bottom: 2pt solid var(--primary);
      margin-bottom: 20pt;
    }

    .doc-header__logo {
      font-family: 'DM Serif Display', serif;
      font-size: 16pt;
      color: var(--primary);
    }

    .doc-header__meta {
      text-align: right;
      font-size: 8pt;
      color: var(--muted-foreground);
    }

    .doc-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 8pt 15mm;
      font-size: 7pt;
      color: var(--muted-foreground);
      border-top: 0.5pt solid var(--border);
      display: flex;
      justify-content: space-between;
    }

    /* ============================================
       COMPONENT STYLES
       ============================================ */

    /* Phase badge */
    .phase-badge {
      display: inline-block;
      padding: 2pt 8pt;
      border-radius: 10pt;
      font-size: 8pt;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
      color: white;
    }

    .phase-badge--intake { background: var(--phase-intake); }
    .phase-badge--checklist { background: var(--phase-checklist); color: var(--foreground); }
    .phase-badge--plan { background: var(--phase-plan); }
    .phase-badge--render { background: var(--phase-render); }
    .phase-badge--payment { background: var(--phase-payment); }
    .phase-badge--complete { background: var(--phase-complete); }
    .phase-badge--iterate { background: var(--phase-iterate); }

    /* Table */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12pt 0;
      font-size: 9pt;
    }

    thead th {
      background: var(--muted);
      font-weight: 600;
      text-align: left;
      padding: 6pt 8pt;
      border-bottom: 1pt solid var(--border);
    }

    tbody td {
      padding: 6pt 8pt;
      border-bottom: 0.5pt solid var(--border);
      vertical-align: top;
    }

    tbody tr:nth-child(even) {
      background: hsl(40, 33%, 99%);
    }

    /* Checklist item */
    .checklist-item {
      display: flex;
      align-items: flex-start;
      gap: 8pt;
      padding: 6pt 0;
      border-bottom: 0.5pt solid var(--border);
    }

    .checklist-item__check {
      width: 12pt;
      height: 12pt;
      border: 1pt solid var(--border);
      border-radius: 2pt;
      flex-shrink: 0;
      margin-top: 2pt;
    }

    .checklist-item__check--done {
      background: var(--success);
      border-color: var(--success);
      position: relative;
    }

    .checklist-item__check--done::after {
      content: '✓';
      color: white;
      font-size: 8pt;
      position: absolute;
      top: -1pt;
      left: 2pt;
    }

    .checklist-item__text {
      flex: 1;
    }

    .checklist-item__priority {
      font-size: 7pt;
      font-weight: 600;
      text-transform: uppercase;
      padding: 1pt 4pt;
      border-radius: 2pt;
    }

    .priority--high {
      background: hsl(0, 84%, 95%);
      color: hsl(0, 84%, 45%);
    }

    .priority--medium {
      background: hsl(38, 92%, 95%);
      color: hsl(38, 92%, 35%);
    }

    .priority--low {
      background: hsl(210, 60%, 95%);
      color: hsl(210, 60%, 40%);
    }

    /* Budget/cost row */
    .cost-row {
      display: flex;
      justify-content: space-between;
      padding: 4pt 0;
      border-bottom: 0.5pt solid var(--border);
    }

    .cost-row__label { color: var(--muted-foreground); }
    .cost-row__value { font-weight: 600; }

    .cost-total {
      display: flex;
      justify-content: space-between;
      padding: 8pt 0;
      border-top: 2pt solid var(--foreground);
      font-size: 12pt;
      font-weight: 700;
    }

    /* Material swatch (inline) */
    .material-swatch {
      display: inline-flex;
      align-items: center;
      gap: 4pt;
      font-size: 8pt;
    }

    .material-swatch__dot {
      width: 8pt;
      height: 8pt;
      border-radius: 50%;
      border: 0.5pt solid var(--border);
    }

    /* Section divider */
    .section-divider {
      border: none;
      border-top: 1pt solid var(--border);
      margin: 16pt 0;
    }

    /* Info box */
    .info-box {
      background: hsl(210, 60%, 97%);
      border-left: 3pt solid var(--phase-intake);
      padding: 8pt 12pt;
      margin: 12pt 0;
      border-radius: 0 4pt 4pt 0;
      font-size: 9pt;
    }

    /* Warning box */
    .warning-box {
      background: hsl(38, 92%, 97%);
      border-left: 3pt solid var(--warning);
      padding: 8pt 12pt;
      margin: 12pt 0;
      border-radius: 0 4pt 4pt 0;
      font-size: 9pt;
    }

    /* Progress bar */
    .progress-bar {
      background: var(--muted);
      height: 8pt;
      border-radius: 4pt;
      overflow: hidden;
      margin: 4pt 0;
    }

    .progress-bar__fill {
      height: 100%;
      border-radius: 4pt;
      background: var(--primary);
    }

    /* Room card */
    .room-card {
      border: 1pt solid var(--border);
      border-radius: 6pt;
      padding: 12pt;
      margin-bottom: 12pt;
      page-break-inside: avoid;
    }

    .room-card__header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8pt;
    }

    .room-card__title {
      font-family: 'DM Serif Text', serif;
      font-size: 13pt;
    }

    /* Watermark */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 72pt;
      color: rgba(0, 0, 0, 0.04);
      font-family: 'DM Serif Display', serif;
      white-space: nowrap;
      pointer-events: none;
      z-index: -1;
    }
  </style>
</head>
<body>
  {{!-- Optional watermark --}}
  {{#if watermark}}
  <div class="watermark">{{watermark}}</div>
  {{/if}}

  {{!-- Document header --}}
  <header class="doc-header">
    <div class="doc-header__logo">Renovation Agent</div>
    <div class="doc-header__meta">
      <div>{{projectTitle}}</div>
      <div>{{formatDate generatedAt}}</div>
      <div><span class="phase-badge phase-badge--{{lowercase phase}}">{{phase}}</span></div>
    </div>
  </header>

  {{!-- Document title --}}
  <h1>{{documentTitle}}</h1>

  {{!-- Template body goes here --}}
  {{> body}}

  {{!-- Fixed footer (appears on every page) --}}
  <footer class="doc-footer">
    <span>Generated by Renovation Agent</span>
    <span>{{projectTitle}} — {{formatDate generatedAt}}</span>
  </footer>
</body>
</html>
```

## Handlebars Partials

### `partials/page-break.hbs`

```handlebars
<div class="page-break"></div>
```

### `partials/room-header.hbs`

```handlebars
<div class="room-card__header">
  <h3 class="room-card__title">{{name}}</h3>
  {{#if budget}}
  <span class="currency">${{formatNumber budget}}</span>
  {{/if}}
</div>
```

### `partials/cost-summary.hbs`

```handlebars
<div class="cost-summary">
  {{#each items}}
  <div class="cost-row">
    <span class="cost-row__label">{{label}}</span>
    <span class="cost-row__value currency">${{formatNumber amount}}</span>
  </div>
  {{/each}}
  <div class="cost-total">
    <span>Total</span>
    <span class="currency">${{formatNumber total}}</span>
  </div>
</div>
```

## Handlebars Helpers

Register these in the doc service:

```typescript
import Handlebars from 'handlebars';

Handlebars.registerHelper('formatDate', (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
});

Handlebars.registerHelper('formatNumber', (num: number) => {
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
});

Handlebars.registerHelper('lowercase', (str: string) => str?.toLowerCase());

Handlebars.registerHelper('phaseColor', (phase: string) => {
  const colors: Record<string, string> = {
    intake: 'hsl(210, 60%, 50%)',
    checklist: 'hsl(45, 85%, 50%)',
    plan: 'hsl(160, 50%, 42%)',
    render: 'hsl(270, 55%, 55%)',
    payment: 'hsl(16, 65%, 45%)',
    complete: 'hsl(142, 71%, 45%)',
    iterate: 'hsl(200, 60%, 50%)',
  };
  return colors[phase?.toLowerCase()] ?? 'hsl(16, 65%, 45%)';
});

Handlebars.registerHelper('materialColor', (material: string) => {
  const colors: Record<string, string> = {
    oak: 'hsl(30, 45%, 55%)',
    walnut: 'hsl(25, 40%, 35%)',
    marble: 'hsl(220, 10%, 90%)',
    copper: 'hsl(20, 70%, 50%)',
    brass: 'hsl(45, 65%, 55%)',
    steel: 'hsl(210, 5%, 65%)',
  };
  return colors[material?.toLowerCase()] ?? 'hsl(30, 15%, 60%)';
});

Handlebars.registerHelper('pluralize', (count: number, singular: string, plural: string) => {
  return count === 1 ? singular : plural;
});

Handlebars.registerHelper('progressPercent', (completed: number, total: number) => {
  if (total === 0) return '0';
  return Math.round((completed / total) * 100).toString();
});
```

## File Organization

```
backend/src/templates/
├── base.hbs                    # Base template (shared by all)
├── checklist.hbs               # Checklist PDF body
├── plan.hbs                    # Renovation plan PDF body
├── estimate.hbs                # Cost estimate PDF body
├── materials-list.hbs          # Shopping list PDF body
├── timeline.hbs                # Timeline visualization PDF body
├── partials/
│   ├── page-break.hbs
│   ├── room-header.hbs
│   ├── cost-summary.hbs
│   └── progress-bar.hbs
└── contracts/
    ├── checklist.contract.ts   # TypeScript interface for checklist data
    ├── plan.contract.ts
    ├── estimate.contract.ts
    └── materials-list.contract.ts
```
