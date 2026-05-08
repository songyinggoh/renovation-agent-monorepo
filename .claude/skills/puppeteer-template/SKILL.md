---
name: puppeteer-template
description: >
  Creates self-contained HTML-to-PDF templates for the Phase 3 doc.worker.ts Puppeteer pipeline.
  Templates use the project's design tokens (phase colors, material palette, warm grays),
  custom fonts (Inter, DM Serif Display/Text, JetBrains Mono), and print-optimized CSS.
  Handles page breaks, headers/footers, data contracts, and Handlebars templating.
  Use when creating or modifying any PDF template for document generation.
user-invocable: true
---

# /puppeteer-template

HTML-to-PDF template creation skill for the renovation agent monorepo. Creates self-contained templates that render with Puppeteer using the project's design system — phase colors, material palette, custom fonts, and print-optimized layouts.

## When to Use

- Creating a new PDF template (checklist, plan, estimate, shopping list, timeline, contract)
- Modifying an existing template's layout or styling
- Adding a new document type to the `DOCUMENT_TYPES` const array
- Fixing Puppeteer rendering issues (fonts, page breaks, layout)
- Creating the data contract (TypeScript interface) for template variables

## Invocation

```
/puppeteer-template <description of the template>
```

**Examples**:
```
/puppeteer-template create checklist PDF template for the CHECKLIST phase
/puppeteer-template create renovation plan PDF with timeline, products, and budget tables
/puppeteer-template create materials shopping list with product images and prices
/puppeteer-template fix page break issues in the estimate PDF template
/puppeteer-template add a contractor comparison table to the plan PDF
```

## Architecture

### Pipeline Flow

```
LangGraph Tool (generate_document)
        |
        v  enqueue job
BullMQ Queue (doc:generate-plan)
        |
        v  process job
Doc Worker (doc.worker.ts)
        |
        v  load template + data
Template Engine (Handlebars)
        |
        v  render HTML
Puppeteer (headless Chromium)
        |
        v  generate PDF
Supabase Storage
        |
        v  persist record
document_artifacts table
        |
        v  emit event
Socket.io (doc:complete)
```

### Key Files

| File | Role |
|---|---|
| `backend/src/workers/doc.worker.ts` | BullMQ worker (currently skeleton/no-op) |
| `backend/src/templates/*.hbs` | Handlebars HTML templates (to be created) |
| `backend/src/templates/partials/*.hbs` | Shared partials (header, footer, page-break) |
| `backend/src/services/doc.service.ts` | Template rendering + Puppeteer PDF generation (to be created) |
| `backend/src/db/schema/document-artifacts.schema.ts` | DB schema for generated documents |
| `frontend/app/globals.css` | Source of truth for design tokens |
| `frontend/lib/fonts.ts` | Font definitions (Inter, DM Serif Display/Text, JetBrains Mono) |
| `frontend/lib/design-tokens.ts` | Phase config, PHASE_CONFIG, RENOVATION_PHASES |

### Document Types (from schema)

```typescript
const DOCUMENT_TYPES = [
  'checklist_pdf',      // AI-generated checklist PDF (CHECKLIST phase)
  'plan_pdf',           // Renovation plan PDF (PLAN phase)
  'estimate_pdf',       // Cost estimate PDF
  'contract_draft',     // Contract template draft
  'progress_report',    // Progress report PDF
  'materials_list',     // Materials shopping list PDF
  'timeline_pdf',       // Project timeline visualization
] as const;
```

## Workflow

### Step 1: Define the Data Contract

Every template needs a TypeScript interface describing the data it receives:

```typescript
// In backend/src/templates/contracts/{name}.contract.ts
export interface ChecklistTemplateData {
  sessionId: string;
  projectTitle: string;
  phase: string;
  generatedAt: string;
  rooms: Array<{
    name: string;
    items: Array<{
      text: string;
      completed: boolean;
      priority: 'high' | 'medium' | 'low';
    }>;
  }>;
  totalItems: number;
  completedItems: number;
}
```

### Step 2: Create the Template

Create the Handlebars template file. See [template-structure.md](./template-structure.md) for the exact HTML structure.

**Location**: `backend/src/templates/{name}.hbs`

### Step 3: Add Design Tokens

Use the inline CSS from [design-tokens-css.md](./design-tokens-css.md) in the template's `<style>` block. Templates must be **self-contained** — no external CSS file references (Puppeteer renders from a string, not a URL).

### Step 4: Configure Fonts

See [font-loading.md](./font-loading.md) for the `@font-face` declarations and font strategy.

### Step 5: Handle Print Layout

See [print-layout.md](./print-layout.md) for page breaks, margins, headers/footers, and multi-page handling.

### Step 6: Register the Template

Add the template name to the doc service's template registry:

```typescript
const TEMPLATES: Record<DocumentType, string> = {
  'checklist_pdf': 'checklist',
  'plan_pdf': 'plan',
  'estimate_pdf': 'estimate',
  // ...
};
```

### Step 7: Test

1. Create a fixture data file matching the contract
2. Render the template to HTML and visually inspect
3. Generate PDF with Puppeteer and verify layout
4. Check page breaks, fonts, and color accuracy

## Key Rules

1. **Self-contained HTML**: No external `<link>` or `<script>` tags — everything inline (the Google Fonts `@import` inside `<style>` is the only approved external fetch; see rule 3)
2. **HSL color values**: Convert CSS variables to actual `hsl()` values (Puppeteer doesn't have access to globals.css)
3. **Google Fonts via `@import`**: Use `@import url('https://fonts.googleapis.com/...')` as the first line inside the `<style>` block — this is the sole exception to rule 1
4. **Print-first CSS**: Use `@page` rules, `page-break-*` properties, and `@media print`
5. **No Tailwind**: Templates can't use Tailwind classes — use plain CSS with the design token values
6. **Handlebars helpers**: Register custom helpers for currency formatting, date formatting, phase colors
7. **A4 page size**: Default to A4 (210mm x 297mm) with 15mm margins

## Key References

- [template-structure.md](./template-structure.md) — Complete HTML boilerplate with all sections
- [design-tokens-css.md](./design-tokens-css.md) — Inline CSS for all design tokens
- [font-loading.md](./font-loading.md) — Font strategy for Puppeteer rendering
- [print-layout.md](./print-layout.md) — Page breaks, margins, headers/footers
