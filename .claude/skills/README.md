# Claude Code Skills

This directory contains custom skills for Claude Code to enhance development workflows.

## Available Skills

### `/plan` - Research-Driven Implementation Planning

Comprehensive planning skill that follows the workflow: Research → Plan → Track → Execute with TDD.

**When to use:**
- Before implementing any new feature
- When solving complex problems
- When fixing non-trivial bugs
- Any task requiring architectural decisions

**What it does:**
1. **Research Phase**
   - Searches codebase for existing patterns
   - Performs web research for best practices
   - Applies first-principles thinking
   - Evaluates 3-5 solution vectors
   - Exports to `docs/research/[TOPIC]_Research.md`

2. **Planning Phase**
   - Creates detailed implementation plan
   - Includes code snippets and file paths
   - Defines success metrics and quality gates
   - Exports to `docs/implementation plan/[TOPIC]_Implementation_Plan.md`

3. **Tracking Phase**
   - Creates progress tracker with task checklist
   - Exports to `docs/implementation plan/[TOPIC]_PROGRESS.md`

4. **Execution Phase** (after approval)
   - Follows TDD workflow (RED → GREEN → REFACTOR)
   - Updates progress tracker in real-time
   - Ensures all quality gates pass

**Usage:**
```bash
/plan [topic or feature description]

# Examples:
/plan add pagination to sessions API
/plan fix authentication middleware bug
/plan implement image upload with compression
```

**Workflow:**
1. Claude researches the problem thoroughly
2. Creates research document with 3-5 solution options
3. Creates implementation plan with detailed steps
4. Creates progress tracker
5. **Waits for your approval** before proceeding
6. After approval, implements using TDD
7. Ensures quality gates pass (lint, type-check, tests, coverage ≥80%)

**Output Files:**
- `docs/research/[TOPIC]_Research.md` - Analysis and solution vectors
- `docs/implementation plan/[TOPIC]_Implementation_Plan.md` - Step-by-step plan
- `docs/implementation plan/[TOPIC]_PROGRESS.md` - Real-time progress tracker

### `/drizzle-migration` - Database Schema Change Lifecycle

Full-lifecycle Drizzle ORM migration skill that walks through every step: schema design, migration generation, safety review, rollback SQL, and CI verification.

**When to use:**
- Adding new tables or columns
- Adding or modifying indexes/constraints
- Modifying column types or nullability
- Any schema change that produces a Drizzle Kit migration

**What it does:**
1. Reads existing schema and identifies target files
2. Modifies schema following project conventions (UUID PKs, timestamps, barrel exports)
3. Runs `npm run db:generate` to produce migration SQL
4. Reviews generated SQL with risk classification (SAFE / WARNING / DESTRUCTIVE)
5. Generates rollback SQL for each statement
6. Applies migration locally, runs verification suite
7. Confirms CI drift check will pass

**Usage:**
```bash
/drizzle-migration add agent_tool_calls table for observability
/drizzle-migration add is_archived boolean column to renovation_sessions
/drizzle-migration add GIN index on products_catalog.tags
```

**Reference docs (in `.claude/skills/drizzle-migration/`):**
- `schema-patterns.md` — Column types, index patterns, const-array pattern
- `safety-review.md` — Risk tiers, lock analysis, PG extension risks
- `rollback-patterns.md` — Reversibility rules, safe column removal pattern
- `journal-troubleshooting.md` — Hybrid history, reconciliation, common errors

### `/bullmq-job` - BullMQ Job Type Scaffolding

End-to-end scaffolding for adding a new BullMQ background job type. Touches 6 files in the correct order using established worker patterns.

**When to use:**
- Adding a new background job type (image processing, PDF generation, API calls, etc.)
- Adding a variant of an existing job type
- Migrating synchronous work to a background queue

**What it does:**
1. Gathers job parameters (name, data fields, concurrency, timeout, rate limits)
2. Adds job to `JobTypes` interface and `WORKER_PROFILES` in `queue.ts`
3. Adds Zod validation schema to `job.validators.ts`
4. Creates worker file with Zod validation, error handling, and Socket.io events
5. Wires worker startup and shutdown in `server.ts`
6. Creates Vitest test file with vi.mock patterns
7. Verifies with `npm run prep` and `npm run test:unit`

**Usage:**
```bash
/bullmq-job add ai:analyze-floorplan job with 60s timeout and concurrency 2
/bullmq-job add doc:generate-checklist as variant of doc:generate-plan
/bullmq-job add payment:process-invoice with Stripe API integration
```

**Reference docs (in `.claude/skills/bullmq-job/`):**
- `queue-patterns.md` — JobTypes, WorkerProfile tuning, queue getters, closeQueues
- `worker-template.md` — Complete worker file templates (minimal, full, with guard)
- `test-template.md` — Complete test file template with vi.mock patterns
- `error-handling.md` — UnrecoverableError vs Error, permanent error detection, retry strategies

### `/otel-trace` - OpenTelemetry Instrumentation

Adds custom OpenTelemetry tracing to backend features: span creation, attribute injection, sampler extension, and test writing across the 4 instrumentation layers (HTTP, Socket.io, AI Pipeline, Logger).

**When to use:**
- Adding tracing to a new backend feature (route, Socket.io event, AI tool, worker)
- Adding custom span attributes to an existing operation
- Updating the `RenovationSampler` for a new span category
- Wrapping external API or AI calls with OTel spans
- Writing Vitest tests for custom tracing code

**What it does:**
1. Identifies the correct instrumentation layer (HTTP/Socket.io/AI/Custom)
2. Applies the matching span creation pattern
3. Adds attributes following naming conventions
4. Updates the sampler if the operation needs special sampling
5. Writes matching Vitest tests with OTel API mocks
6. Enforces privacy rules (no content, no PII in attributes)

**Usage:**
```bash
/otel-trace add tracing to the new generate-checklist AI tool call
/otel-trace instrument the file upload endpoint with asset metadata
/otel-trace update the sampler to always sample payment operations
```

**Reference docs (in `.claude/skills/otel-trace/`):**
- `span-patterns.md` — Creating spans in each layer (HTTP requestHook, Socket.io wrapper, AI traceAICall, custom)
- `attribute-catalog.md` — Complete inventory of all custom attributes by domain
- `sampler-patterns.md` — RenovationSampler extension, force-sample header, env vars
- `test-patterns.md` — 6 mock patterns for OTel API in Vitest

### `/puppeteer-template` - HTML-to-PDF Template Creation

Creates self-contained HTML-to-PDF templates for the Phase 3 `doc.worker.ts` Puppeteer pipeline. Templates use the project's design tokens (phase colors, material palette, warm grays), custom fonts (Inter, DM Serif Display/Text, JetBrains Mono), and print-optimized CSS.

**When to use:**
- Creating a new PDF template (checklist, plan, estimate, shopping list, timeline, contract)
- Modifying an existing template's layout or styling
- Adding a new document type to the `DOCUMENT_TYPES` const array
- Fixing Puppeteer rendering issues (fonts, page breaks, layout)
- Creating the data contract (TypeScript interface) for template variables

**What it does:**
1. Defines a TypeScript data contract for template variables
2. Creates a Handlebars template with inline design tokens and Google Fonts
3. Applies print-first CSS (`@page` rules, page breaks, fixed headers/footers)
4. Registers Handlebars helpers (formatDate, formatNumber, phaseColor, etc.)
5. Registers the template in the doc service template registry
6. Provides debugging guidance for layout and font issues

**Usage:**
```bash
/puppeteer-template create checklist PDF template for the CHECKLIST phase
/puppeteer-template create renovation plan PDF with timeline, products, and budget tables
/puppeteer-template create materials shopping list with product images and prices
/puppeteer-template fix page break issues in the estimate PDF template
```

**Reference docs (in `.claude/skills/puppeteer-template/`):**
- `template-structure.md` — Complete HTML boilerplate, Handlebars partials/helpers, file organization
- `design-tokens-css.md` — Inline CSS for all design tokens, phase/material color mappings, print typography scale
- `font-loading.md` — Google Fonts @import strategy, bundled fonts for Docker, font verification
- `print-layout.md` — Page breaks, margins, headers/footers, multi-page patterns, debugging tips

### `/shadcn-component` - Design System Component Scaffolding

Scaffolds new React components following the project's 6-wave design system conventions: phase tokens (7), material tokens (12), surface tokens (3), custom animations, and dark mode (Blueprint Mode). Handles placement in the correct directory, barrel export wiring, and shadcn/ui composition.

**When to use:**
- Creating a new domain component (renovation, chat, brand)
- Adding a new shadcn/ui primitive via the CLI
- Creating a composite component that wraps shadcn primitives with domain logic
- Adding a new skeleton loader or loading/empty state variant
- Creating a phase-aware or material-aware component

**What it does:**
1. Determines the correct directory (ui, renovation, chat, brand) using the decision tree
2. Creates the component file with proper `'use client'` boundary, typed props, and `cn()` usage
3. Applies the matching design system tokens (phase colors, material palette, semantic colors)
4. Wires barrel exports for `components/renovation/index.ts` (other dirs use direct imports)
5. Optionally adds a skeleton loader variant to `skeleton-loader.tsx`
6. Verifies with `npm run type-check` and `npm run lint`

**Usage:**
```bash
/shadcn-component create a contractor-comparison table for the PLAN phase
/shadcn-component create a document-card component for rendered PDFs
/shadcn-component add a cost-breakdown table with phase-colored rows
/shadcn-component create a photo-gallery component for room assets
```

**Reference docs (in `.claude/skills/shadcn-component/`):**
- `component-patterns.md` — Templates for each category (data card, phase-aware, material-aware, composite, empty state, skeleton, SVG)
- `design-system-tokens.md` — Complete token inventory: core palette, phase/material/surface/chart colors, typography, animations, dark mode

---

## Skill Development

To create a new skill:
1. Create `[skill-name]/SKILL.md` in `.claude/skills/`
2. Add companion `.md` files for detailed reference
3. Define clear workflow and templates
4. Document in this README
5. Test with `/[skill-name]` command
