# PDF Generation Pipeline Research
**Date**: 2026-03-16

## Problem Statement

Design a production-grade PDF document generation pipeline for the renovation planning assistant. The pipeline takes a structured renovation plan (timeline, tasks, contractors, budget) from the LangGraph agent, renders it via a Handlebars HTML template, converts it to PDF using Puppeteer, uploads it to Supabase Storage, and returns a signed download URL. All steps run in a BullMQ worker on Node.js 20 / TypeScript ESM / Docker Alpine.

---

## Topic 1: Puppeteer-core + @sparticuz/chromium PDF Generation

### Recommended Approach

Use `puppeteer-core` (no bundled browser) paired with `@sparticuz/chromium` (serverless-optimised Chromium binary). In Docker/non-Lambda environments the binary is already on the filesystem, so the startup path is identical.

#### Package setup

```bash
pnpm add puppeteer-core @sparticuz/chromium
```

Check the [compatibility matrix](https://github.com/sparticuz/chromium?tab=readme-ov-file#versioning) before pinning versions — puppeteer-core and @sparticuz/chromium must be matched.

#### Launch configuration (TypeScript ESM)

```typescript
import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

// Configure once at module load
chromium.setHeadlessMode = true;
chromium.setGraphicsMode = false;   // no GPU needed for PDF

const CHROME_ARGS = [
  ...chromium.args,                 // base set from @sparticuz/chromium
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',        // CRITICAL for Docker Alpine (avoids /dev/shm OOM)
  '--disable-gpu',
  '--disable-accelerated-2d-canvas',
  '--font-render-hinting=none',     // prevents kerning artifacts in PDFs
  '--disable-background-timer-throttling',
  '--disable-restore-session-state',
  '--single-process',               // required on Lambda; optional in Docker but reduces overhead
];

async function launchBrowser(): Promise<Browser> {
  const isLocal = process.env.NODE_ENV === 'development';
  return puppeteer.launch(
    isLocal
      ? { channel: 'chrome' }       // use locally installed Chrome in dev
      : {
          args: CHROME_ARGS,
          executablePath: await chromium.executablePath(),
          headless: true,
          ignoreHTTPSErrors: true,
          protocolTimeout: 60_000,  // raise from 30s default for slow containers
        }
  );
}
```

#### PDF generation options

```typescript
async function renderPdf(html: string): Promise<Buffer> {
  const browser = await launchBrowser();
  const page: Page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Wait for fonts to finish loading — critical for custom fonts
    await page.evaluateHandle('document.fonts.ready');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,      // renders CSS background colours and images
      margin: {
        top:    '20mm',
        right:  '15mm',
        bottom: '20mm',
        left:   '15mm',
      },
      // omitBackground: false (default) — keep white page background
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
    // Do NOT close the browser here if reusing it across jobs (see concurrency section)
  }
}
```

#### PDF stream for large documents

For documents exceeding ~10 pages, stream instead of buffering entirely in memory:

```typescript
const stream = await page.createPDFStream({ format: 'A4', printBackground: true });
// Pipe stream to Supabase upload or write to temp file
```

### Font Loading in Docker

Custom fonts (Inter, DM Serif Display) must be available to Chromium inside the container. There are two valid approaches:

**Option A — System font install (Docker layer, recommended for Docker)**

```dockerfile
# Dockerfile
RUN apt-get update && apt-get install -y \
    fonts-open-sans \
    && fc-cache -f -v
```

For non-packaged fonts (Inter, DM Serif) copy the `.ttf`/`.woff2` files into the Docker image:

```dockerfile
COPY fonts/ /usr/local/share/fonts/
RUN fc-cache -f -v
```

Then reference them via `@font-face` in the Handlebars template CSS:

```css
@font-face {
  font-family: 'Inter';
  src: local('Inter'), url('/usr/local/share/fonts/Inter-Regular.ttf') format('truetype');
  font-weight: 400;
}
```

**Option B — Base64 inline (zero Docker config, smaller image)**

```typescript
import { readFileSync } from 'fs';
const fontBase64 = readFileSync('assets/fonts/Inter-Regular.woff2').toString('base64');
// Inject into template:
// src: url(data:font/woff2;base64,${fontBase64}) format('woff2')
```

Inline fonts are embedded before `setContent()` so no network fetch is needed and no `networkidle0` wait is required for fonts.

**Important**: Avoid Google Fonts CDN links inside templates. Puppeteer's user agent may trigger a reduced font subset that omits glyphs needed for the document.

### Memory Management for Concurrent PDF Jobs

Each `page.pdf()` call saturates one CPU core. Rules:

| Rule | Rationale |
|------|-----------|
| Limit concurrency to `(CPU cores - 1)` | Prevents oversubscription; leave one core for the event loop |
| Reuse the `Browser` instance across jobs | `browser.newPage()` is ~20ms; `puppeteer.launch()` is ~1.5s |
| Close and re-create the `Page` (tab) after each job | Tabs accumulate memory over time and do not self-clean |
| Recreate the `Browser` every N jobs (e.g., 50) | Prevents slow memory growth in long-running workers |

Browser pool pattern (single-pod):

```typescript
let browser: Browser | null = null;
let jobCount = 0;
const BROWSER_RECYCLE_AFTER = 50;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.connected || jobCount >= BROWSER_RECYCLE_AFTER) {
    if (browser) {
      browser.process()?.kill(9);   // force-kill stuck chrome processes
    }
    browser = await launchBrowser();
    jobCount = 0;
  }
  jobCount++;
  return browser;
}
```

### Common Pitfalls

- **Missing `--disable-dev-shm-usage`**: Alpine containers have a tiny `/dev/shm` (64 MB default). Without this flag Chromium will crash silently.
- **Not waiting for `document.fonts.ready`**: Fonts appear as fallback serif/sans even when `networkidle0` reports complete.
- **Using `--single-process` in multi-core Docker**: Limits CPU parallelism; omit it unless required.
- **Closing the browser after every job**: 1.5s cold-start penalty on every PDF job.
- **Version mismatch**: `puppeteer-core@21` requires `@sparticuz/chromium@121`. Always check the compatibility table.

---

## Topic 2: Handlebars HTML Templates for PDFs

### Recommended Approach

Keep templates as `.hbs` files read from disk at startup (not embedded in JS). Compile once and cache the template function; invoke it per-job with data.

```typescript
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';

// Compile once at module start
const TEMPLATE_DIR = join(process.cwd(), 'src', 'templates');

const renovationPlanTemplate = Handlebars.compile(
  readFileSync(join(TEMPLATE_DIR, 'renovation-plan.hbs'), 'utf8')
);

// Register style partial once
Handlebars.registerPartial(
  'styles',
  readFileSync(join(TEMPLATE_DIR, 'partials', 'print-styles.hbs'), 'utf8')
);

// Per-job render
function renderTemplate(data: RenovationPlanTemplateData): string {
  return renovationPlanTemplate(data);
}
```

### Inline CSS vs External Stylesheet

**Use inline `<style>` blocks** (not external `.css` file links) unless you are intercepting network requests with Puppeteer's `page.setRequestInterception`. Inline CSS eliminates:
- External HTTP dependency
- `networkidle0` wait latency
- CORS complications

The pattern: put all print CSS in a Handlebars partial (`print-styles.hbs`) and include it with `{{> styles}}`.

### Print-Optimised CSS Patterns

```css
/* ====================================================
   @page — Document margins and size
   ==================================================== */
@page {
  size: A4;                 /* 210mm × 297mm */
  margin: 20mm 15mm;        /* top/bottom, left/right */
}

@page :first {
  margin-top: 30mm;         /* extra space for cover header */
}

/* ====================================================
   Base typography — use pt for print consistency
   ==================================================== */
:root {
  --font-body:    10pt;
  --font-heading: 14pt;
  --font-small:    8pt;
  --ltr-spacing:  0.02em;   /* em tracks better than px in print */
}

body {
  font-family: 'Inter', sans-serif;
  font-size: var(--font-body);
  line-height: 1.5;
  color: #1a1a1a;
  -webkit-print-color-adjust: exact;   /* preserve bg colours in Chrome */
  print-color-adjust: exact;           /* W3C standard */
  color-adjust: exact;                 /* legacy Firefox */
}

/* ====================================================
   Page break control
   ==================================================== */

/* Modern (Chrome 90+, use these) */
.section          { break-before: page; }
.no-break         { break-inside: avoid; }
.keep-together    { break-inside: avoid; page-break-inside: avoid; }  /* belt+braces */

/* Legacy fallback (still respected by Puppeteer's print engine) */
.section          { page-break-before: always; }
.card, .task-row  { page-break-inside: avoid; }

/* Orphans/widows — prevent stray single lines */
p, li {
  orphans: 3;   /* min lines before page break */
  widows:  3;   /* min lines after page break */
}

/* ====================================================
   Tables (task lists, budget breakdown)
   ==================================================== */
thead { display: table-header-group; }   /* repeat header on each page */
tr    { break-inside: avoid; }

/* ====================================================
   Fixed-height pages (alternative pattern for precise layout)
   Useful when you must guarantee page boundaries.
   ==================================================== */
.page {
  width:  210mm;
  height: 297mm;
  padding: 20mm 15mm;
  page-break-after: always;
  overflow: hidden;
}
```

### Handlebars Template Structure (renovation-plan.hbs)

```handlebars
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Renovation Plan — {{session.address}}</title>
  {{> styles}}
</head>
<body>

  {{! ── Cover page ── }}
  <div class="page cover-page">
    <h1>{{session.address}}</h1>
    <p class="subtitle">Renovation Plan</p>
    <p class="date">Generated {{formatDate generatedAt}}</p>
  </div>

  {{! ── Executive Summary ── }}
  <div class="section keep-together">
    <h2>Summary</h2>
    <p>{{plan.summary}}</p>
    <div class="budget-callout no-break">
      <span>Total Budget:</span>
      <strong>{{formatCurrency plan.totalBudget}}</strong>
    </div>
  </div>

  {{! ── Rooms ── }}
  {{#each plan.rooms}}
  <div class="section">
    <h2>{{name}}</h2>
    {{#each tasks}}
    <div class="task-row no-break">
      <span class="task-name">{{description}}</span>
      <span class="task-cost">{{formatCurrency estimatedCost}}</span>
      <span class="task-duration">{{duration}} days</span>
    </div>
    {{/each}}
  </div>
  {{/each}}

  {{! ── Contractors ── }}
  {{#if plan.contractors.length}}
  <div class="section">
    <h2>Recommended Contractors</h2>
    {{#each plan.contractors}}
    <div class="contractor-card no-break">
      <strong>{{name}}</strong>
      <span>{{specialty}}</span>
      <span>{{formatCurrency estimatedCost}}</span>
    </div>
    {{/each}}
  </div>
  {{/if}}

</body>
</html>
```

Register Handlebars helpers for formatting:

```typescript
Handlebars.registerHelper('formatCurrency', (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
);

Handlebars.registerHelper('formatDate', (date: Date) =>
  new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(date)
);
```

### Common Pitfalls

- **Using `px` units for body text**: Pixels vary by screen DPI. Use `pt` for text, `mm` for page geometry.
- **Missing `-webkit-print-color-adjust: exact`**: Background colours and images are stripped by Chrome's default print behaviour.
- **Loading external Google Fonts**: Puppeteer's UA may receive a reduced font subset. Embed fonts locally.
- **Forgetting `thead { display: table-header-group }`**: Table headers disappear on pages 2+ without this.
- **Calling `page.emulateMedia('print')` explicitly**: Puppeteer already uses `print` media for `page.pdf()` — this is the default. Only call `emulateMedia('screen')` if you want screen CSS.

---

## Topic 3: BullMQ Worker for CPU-bound Puppeteer Jobs

### WorkerOptions for Puppeteer

The critical insight: Puppeteer's `page.pdf()` blocks the Node.js event loop. BullMQ's lock renewal runs on the same event loop. If `page.pdf()` takes longer than `lockRenewTime` (default 15s), the job is marked stalled and re-enqueued.

```typescript
import { Worker, type WorkerOptions } from 'bullmq';

const PDF_JOB_TIMEOUT_MS = 90_000;   // 90 seconds max per PDF

const pdfWorkerOptions: WorkerOptions = {
  connection: redisConnection,
  concurrency: 1,                      // Puppeteer is single-threaded + CPU-bound; 1 per process
  lockDuration: 120_000,               // 2x the expected max job time (90s → 120s safety margin)
  stalledInterval: 30_000,             // default; check every 30s
  maxStalledCount: 1,                  // retry once on stall, then fail permanently
  limiter: {
    max: 5,                            // max 5 PDFs per minute globally
    duration: 60_000,
  },
};

const pdfWorker = new Worker(
  'pdf:generate',
  async (job) => {
    await processPdfJob(job);
  },
  pdfWorkerOptions
);
```

### Lock Extension for Long Jobs (>30s)

For jobs that may approach or exceed `lockDuration`, extend the lock proactively inside the job:

```typescript
async function processPdfJob(job: Job<PdfJobData>): Promise<void> {
  const LOCK_EXTEND_INTERVAL_MS = 20_000;  // extend every 20s
  const lockExtender = setInterval(async () => {
    try {
      await job.extendLock(job.token!, LOCK_EXTEND_INTERVAL_MS);
    } catch (err) {
      // log but don't throw — job may already be completing
      log.warn('Failed to extend PDF job lock', err as Error, { jobId: job.id });
    }
  }, LOCK_EXTEND_INTERVAL_MS);

  try {
    await Promise.race([
      doRenderPdf(job),
      rejectAfter(PDF_JOB_TIMEOUT_MS, `PDF job timed out after ${PDF_JOB_TIMEOUT_MS}ms`),
    ]);
  } finally {
    clearInterval(lockExtender);
  }
}

function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}
```

### Retryable vs Permanent Errors

Map Puppeteer error classes to BullMQ's retry semantics:

```typescript
import { UnrecoverableError } from 'bullmq';

function classifyPuppeteerError(err: Error): never {
  const msg = err.message;

  // PERMANENT — do not retry (throw UnrecoverableError)
  if (
    msg.includes('ProtocolError') ||
    msg.includes('Target closed') ||
    msg.includes('Session closed') ||
    msg.includes('Page crashed')
  ) {
    throw new UnrecoverableError(`Permanent Puppeteer error: ${msg}`);
  }

  // RETRYABLE — let BullMQ retry with backoff
  // TimeoutError, net::ERR_*, protocol timeout, SIGKILL from OOM
  throw err;
}
```

Queue configuration with retry backoff:

```typescript
import { Queue } from 'bullmq';

const pdfQueue = new Queue('pdf:generate', { connection: redisConnection });

await pdfQueue.add(
  'render',
  { sessionId, planData },
  {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    timeout: PDF_JOB_TIMEOUT_MS,
  }
);
```

### Graceful Shutdown with In-flight Puppeteer Jobs

Integrate with the existing `shutdown-manager.ts`:

```typescript
class PdfWorkerShutdownHandler {
  private isShuttingDown = false;
  private activeJobs = new Set<string>();

  constructor(private worker: Worker, private browser: Browser | null) {}

  async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    log.info('PDF worker shutting down', { signal });

    // 1. Stop accepting new jobs
    await this.worker.pause();

    // 2. Wait for in-flight jobs (with 60s hard timeout)
    const SHUTDOWN_TIMEOUT_MS = 60_000;
    const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;

    while (this.activeJobs.size > 0 && Date.now() < deadline) {
      log.info('Waiting for in-flight PDF jobs', { count: this.activeJobs.size });
      await new Promise<void>(resolve => setTimeout(resolve, 1_000));
    }

    if (this.activeJobs.size > 0) {
      log.warn('Force-shutting with active jobs', { remaining: this.activeJobs.size });
    }

    // 3. Close worker (stops Redis polling)
    await this.worker.close();

    // 4. Kill browser (Chromium process does not self-terminate on SIGTERM)
    this.browser?.process()?.kill(9);
  }
}

// Wire into process signals
const shutdownHandler = new PdfWorkerShutdownHandler(pdfWorker, browser);
process.on('SIGTERM', () => shutdownHandler.shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdownHandler.shutdown('SIGINT'));
```

### Common Pitfalls

- **Default `lockDuration: 30000`**: Too short for Puppeteer on a loaded container. Set to at least 2× your P95 job duration.
- **`concurrency > 1` for PDF jobs**: On a 2-core container, `concurrency: 2` will starve the event loop, stall lock renewal, and re-queue jobs unnecessarily. Use one worker process per available core instead.
- **Not killing the Chromium process on shutdown**: `worker.close()` does not terminate Chromium. A dangling chrome process will hold memory and file descriptors.
- **Missing `maxStalledCount`**: With default `maxStalledCount: 1`, a legitimately slow job (e.g., font-heavy document on cold start) will fail permanently after one stall event. Set to `2` if P99 jobs are long.

---

## Topic 4: Supabase Storage Upload from Node.js Backend

### Upload PDF Buffer

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // service role bypasses RLS for backend uploads
);

const BUCKET = 'renovation-documents';

async function uploadPdf(
  sessionId: string,
  pdfBuffer: Buffer
): Promise<string> {
  // Always use a unique path — CDN propagation delay means upsert can serve stale versions
  const timestamp = Date.now();
  const storagePath = `sessions/${sessionId}/plans/renovation-plan-${timestamp}.pdf`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      cacheControl: '3600',   // 1 hour CDN cache for private signed URLs
      upsert: false,          // explicit: never overwrite (use unique timestamped paths)
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  return storagePath;
}
```

### Generate Signed Download URL

```typescript
async function createSignedDownloadUrl(
  storagePath: string,
  expiresInSeconds = 3600    // 1 hour default; use 86400 (24h) for plan documents
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message}`);
  }

  return data.signedUrl;
}
```

### Bucket Configuration Recommendations

| Setting | Value | Rationale |
|---------|-------|-----------|
| Bucket visibility | Private | Plan documents are user-specific; no public access |
| Max file size | 10 MB | Generous cap for multi-room renovation plans |
| Allowed MIME types | `application/pdf` | Restrict to PDFs only |
| Signed URL expiry | 1–24 hours | Short enough to limit exposure; long enough for user download sessions |

### Full Upload + URL Pattern

```typescript
async function storePdfAndGetUrl(
  sessionId: string,
  pdfBuffer: Buffer
): Promise<{ storagePath: string; signedUrl: string }> {
  const storagePath = await uploadPdf(sessionId, pdfBuffer);
  const signedUrl = await createSignedDownloadUrl(storagePath, 86_400);  // 24h for plans
  return { storagePath, signedUrl };
}
```

### Common Pitfalls

- **Using anon key for backend uploads**: The anon key is subject to RLS. Use `SUPABASE_SERVICE_ROLE_KEY` for server-side uploads and ensure it is never exposed to the frontend.
- **Overwriting files with `upsert: true`**: The CDN can serve the old version for minutes after an overwrite. Use timestamped paths and store the path in the database.
- **Not setting `contentType`**: Supabase infers from extension but `application/pdf` must be explicit to avoid `application/octet-stream` responses that prevent browser inline rendering.
- **Signed URL expiry too short**: 60-second URLs expire before users click the link in slow email clients. Use at least 1 hour for user-facing links.

---

## Topic 5: save-plan-state Pattern (LangGraph Tool Writing Structured JSONB)

### Recommended Approach

Define the tool using `tool()` from `@langchain/core/tools` with a full Zod schema matching your JSONB column shape. The tool writes to the database and returns a `Command` to update graph state, giving the agent confirmation.

### Zod Schema for a Renovation Plan

```typescript
import { z } from 'zod';

// ── Leaf schemas ──────────────────────────────────────────────────
export const RenovationTaskSchema = z.object({
  id:             z.string().uuid().describe('Unique task identifier'),
  description:    z.string().describe('Human-readable task description'),
  estimatedCost:  z.number().positive().describe('Estimated cost in USD'),
  duration:       z.number().int().positive().describe('Duration in calendar days'),
  tradeCategory:  z.enum([
    'electrical', 'plumbing', 'carpentry', 'painting',
    'flooring', 'tiling', 'hvac', 'general'
  ]).describe('Trade category for contractor matching'),
  priority:       z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  dependencies:   z.array(z.string().uuid()).default([])
                   .describe('IDs of tasks that must complete first'),
});

export const RenovationRoomPlanSchema = z.object({
  roomId:         z.string().uuid(),
  roomName:       z.string(),
  tasks:          z.array(RenovationTaskSchema).min(1),
  estimatedCost:  z.number().positive(),
  estimatedDays:  z.number().int().positive(),
});

export const ContractorRecommendationSchema = z.object({
  specialty:      z.string(),
  estimatedCost:  z.number().positive(),
  notes:          z.string().optional(),
});

// ── Top-level plan schema ─────────────────────────────────────────
export const RenovationPlanSchema = z.object({
  summary:        z.string().describe('Executive summary of the renovation plan'),
  totalBudget:    z.number().positive().describe('Total estimated cost in USD'),
  totalDays:      z.number().int().positive().describe('Total estimated calendar days'),
  startDate:      z.string().datetime().optional().describe('Proposed start date (ISO 8601)'),
  rooms:          z.array(RenovationRoomPlanSchema),
  contractors:    z.array(ContractorRecommendationSchema).default([]),
  warnings:       z.array(z.string()).default([])
                   .describe('Flagged risks or permit requirements'),
  generatedAt:    z.string().datetime().describe('Plan generation timestamp'),
});

export type RenovationPlan = z.infer<typeof RenovationPlanSchema>;
```

### LangGraph Tool Definition

```typescript
import { tool } from '@langchain/core/tools';
import { Command }  from '@langchain/langgraph';
import { ToolMessage } from '@langchain/core/messages';
import { type ToolRuntime } from '@langchain/core/tools';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.js';
import { eq } from 'drizzle-orm';
import { Logger } from '../utils/logger.js';

const log = new Logger({ serviceName: 'save-plan-tool' });

// The tool input schema — what the LLM must produce
const SavePlanInputSchema = z.object({
  sessionId: z.string().uuid().describe('Active session ID'),
  plan:      RenovationPlanSchema,
});

export const savePlanStateTool = tool(
  async (
    { sessionId, plan }: z.infer<typeof SavePlanInputSchema>,
    config: ToolRuntime
  ) => {
    // 1. Validate (Zod already validated input; add business rules here)
    const validated = RenovationPlanSchema.safeParse(plan);
    if (!validated.success) {
      throw new Error(`Invalid plan: ${validated.error.message}`);
    }

    // 2. Persist to JSONB column via Drizzle
    await db
      .update(renovationSessions)
      .set({
        planData:  validated.data,          // typed as jsonb in Drizzle schema
        phase:     'PLAN',
        updatedAt: new Date(),
      })
      .where(eq(renovationSessions.id, sessionId));

    log.info('Plan state saved', { sessionId, totalBudget: plan.totalBudget });

    // 3. Return Command to update graph state
    return new Command({
      update: {
        planSaved: true,
        planData:  validated.data,
        messages: [
          new ToolMessage({
            content: `Renovation plan saved. Total: $${plan.totalBudget.toLocaleString()}, ${plan.totalDays} days.`,
            tool_call_id: config.toolCallId,
          }),
        ],
      },
    });
  },
  {
    name:        'save_plan_state',
    description: 'Saves the complete structured renovation plan to the database. Call this once the plan is fully elaborated and ready for the user to review.',
    schema:      SavePlanInputSchema,
  }
);
```

### Drizzle JSONB Column Definition

```typescript
// backend/src/db/schema/sessions.ts
import { pgTable, uuid, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import { type RenovationPlan } from '../jsonb-schemas.js';

export const renovationSessions = pgTable('renovation_sessions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  planData:  jsonb('plan_data').$type<RenovationPlan>(),   // typed JSONB
  phase:     text('phase').notNull().default('INTAKE'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

### Runtime Validation on Read

Always re-validate when reading JSONB back from the database (schema may drift between deploys):

```typescript
import { RenovationPlanSchema } from '../db/jsonb-schemas.js';

async function getPlan(sessionId: string): Promise<RenovationPlan> {
  const [session] = await db
    .select({ planData: renovationSessions.planData })
    .from(renovationSessions)
    .where(eq(renovationSessions.id, sessionId));

  if (!session?.planData) throw new Error('No plan found');

  // Re-validate at runtime — DB may have been written by older schema version
  return RenovationPlanSchema.parse(session.planData);
}
```

### Common Pitfalls

- **No `.describe()` on Zod fields**: The LLM uses field descriptions to populate the schema correctly. Missing descriptions cause hallucinated or omitted values.
- **Using `z.any()` for nested structures**: Defeats type safety. Always define nested schemas explicitly.
- **Not re-validating on read**: Zod type-casting JSONB without `.parse()` is a false guarantee — old records may not conform to the current schema.
- **Returning raw data from the tool without a `ToolMessage`**: The agent graph needs a `ToolMessage` in the `messages` array for the LLM to see the result. Without it, the agent will re-call the tool or hallucinate confirmation.
- **Mutable `default([])` in Zod**: `z.array(...).default([])` is safe in Zod (it creates a new array each time), unlike JavaScript's mutable default argument pitfall.

---

## Strategic Evaluation

### Goals Alignment
All five patterns directly enable Phase 3.1 (Render & Documents) and Phase 3.2 (Plan Document generation) in the roadmap.

### Economic Value
Automated PDF generation eliminates a manual download/share step and unlocks the payment flow gating in Phase 5 (no plan document = no payment trigger).

### Implementation Feasibility
- **Puppeteer + @sparticuz/chromium**: 2–3 days to integrate. Main risk is Docker image size (~200MB for Chromium). Mitigate with multi-stage build and `chromium-min`.
- **Handlebars templates**: 1 day. Low risk.
- **BullMQ PDF worker**: 1 day. Configuration-only work on existing queue infrastructure.
- **Supabase upload**: 0.5 days. SDK is already a dependency.
- **save-plan-state tool**: 1 day. Zod schema design is the main effort; Drizzle integration is already established.

---

## Sources

- [Optimizing Puppeteer PDF generation (CodePasta, Apr 2024)](https://www.codepasta.com/2024/04/19/optimizing-puppeteer-pdf-generation)
- [How to generate PDFs with Puppeteer on Vercel in 2024 (DEV Community)](https://dev.to/travisbeck/how-to-generate-pdfs-with-puppeteer-on-vercel-in-2024-1dm2)
- [Puppeteer PDF Generator (Browserless)](https://www.browserless.io/blog/puppeteer-pdf-generator)
- [How to automate PDF generation with Puppeteer (Browserless)](https://www.browserless.io/blog/puppeteer-pdf-generator)
- [Custom Fonts in Puppeteer PDFs on Lambda (Medium)](https://medium.com/@matthew.bajorek/how-to-get-custom-fonts-to-work-for-aws-lambda-puppeteer-pdfs-6b3ff7555d7a)
- [Puppeteer font loading issues (GitHub)](https://github.com/puppeteer/puppeteer/issues/3183)
- [Node.js Create PDF with Puppeteer and Handlebars (FutureStud)](https://futurestud.io/tutorials/node-js-create-a-pdf-from-html-with-puppeteer-and-handlebars)
- [Server-Side PDF Reports with Puppeteer, D3, Handlebars (SingleStone)](https://www.singlestoneconsulting.com/blog/how-to-generate-server-side-pdf-reports-puppeteer-d3-handlebars)
- [Avoiding Awkward Element Breaks in Print HTML (DEV Community)](https://dev.to/amruthpillai/avoiding-awkward-element-breaks-in-print-html-5goe)
- [BullMQ Concurrency Docs](https://docs.bullmq.io/guide/workers/concurrency)
- [BullMQ Graceful Shutdown Docs](https://docs.bullmq.io/guide/workers/graceful-shutdown)
- [BullMQ WorkerOptions API Reference](https://api.docs.bullmq.io/interfaces/v5.WorkerOptions.html)
- [How to Handle Long-Running Jobs in BullMQ (OneUptime, Jan 2026)](https://oneuptime.com/blog/post/2026-01-21-bullmq-long-running-jobs/view)
- [How to Implement Graceful Shutdown for BullMQ Workers (OneUptime, Jan 2026)](https://oneuptime.com/blog/post/2026-01-21-bullmq-graceful-shutdown/view)
- [Supabase Storage Standard Uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [Supabase Storage Serving Downloads](https://supabase.com/docs/guides/storage/serving/downloads)
- [Supabase createSignedUrl Reference](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl)
- [LangChain JS Tools Documentation](https://docs.langchain.com/oss/javascript/langchain/tools)
- [Get Structured Output from LangGraph (Agentuity)](https://agentuity.com/blog/langgraph-structured-output)
- [LangChain Structured Output (Robin Wieruch)](https://www.robinwieruch.de/langchain-javascript-structured/)
- [Puppeteer Error Handling Guide (WebScraping.AI)](https://webscraping.ai/faq/puppeteer/how-to-handle-errors-in-puppeteer)
- [BullMQ Stalled Jobs Documentation](https://docs.bullmq.io/guide/workers/stalled-jobs)
