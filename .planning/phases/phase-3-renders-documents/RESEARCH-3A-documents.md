# Phase 3A: PDF Document Generation - Research

**Researched:** 2026-03-16
**Domain:** Puppeteer-core, @sparticuz/chromium, Handlebars, Supabase Storage, LangGraph tools
**Confidence:** HIGH (codebase direct inspection) / MEDIUM (external APIs)

---

## Summary

Phase 3A adds PDF document generation as a background job pipeline. The infrastructure is
already 70% wired: a `doc:generate-plan` BullMQ queue exists, a no-op `doc.worker.ts` stub
exists, the `document_artifacts` table is fully defined, and Socket.io event types
(`DocStartedPayload`, `DocProgressPayload`, `DocGeneratedPayload`, `DocFailedPayload`) are
already defined in `shared-types`. The env already validates `PUPPETEER_EXECUTABLE_PATH` and
`PDF_GENERATION_ENABLED` via `env.ts`. The `isPdfEnabled()` guard is ready to use.

What needs to be built: `DocumentService`, real `doc.worker.ts`, `generate_document` LangGraph
tool, `document.routes.ts`, Handlebars `.hbs` templates, and frontend components.

The RenderService + render.worker.ts are the direct reference pattern. Follow them exactly.

**Primary recommendation:** Follow the render pipeline pattern 1:1. Use
`@sparticuz/chromium` with `puppeteer-core` for PDF generation; do NOT use system Chromium
in the Docker image as the Dockerfile currently uses `node:20-alpine` which has known
Alpine 3.20 / Chromium timeout issues. The `@sparticuz/chromium` package handles its own
binary extraction to `/tmp/chromium` at runtime and sidesteps the Alpine problem.

---

## Standard Stack

### Core
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| puppeteer-core | ^24.37.4 | Headless Chrome PDF rendering | Already installed; avoids bundling full browser |
| @sparticuz/chromium | ^143.0.4 | Chromium binary for serverless/container | Already installed; works in Docker without system deps |
| handlebars | ^4.7.8 | HTML template engine | Already installed; logic-less, well-known for reports |
| @supabase/supabase-js | ^2.90.1 | Storage upload + signed URLs | Already used in RenderService |

### Supporting (already in codebase, no install needed)
| Library | Purpose | Pattern already established |
|---------|---------|----------------------------|
| bullmq | Background job queue | `createWorker`, `getDocQueue` in queue.ts |
| zod | Job data validation | `docGeneratePlanJobSchema` in job.validators.ts |
| drizzle-orm | DB operations | `documentArtifacts` table already defined |
| @opentelemetry/api | Tracing | `tracer.startActiveSpan` pattern in render.worker.ts |

### Alternatives Considered
| Instead of | Could Use | Decision |
|------------|-----------|----------|
| @sparticuz/chromium | System chromium on Alpine | Do NOT. Alpine 3.20 has timeout issues per Puppeteer troubleshooting docs |
| @sparticuz/chromium | wkhtmltopdf | Do NOT. Already have Puppeteer installed; no need for a second PDF engine |
| Handlebars | EJS / nunjucks | Do NOT. Handlebars is already installed; do not add alternatives |
| page.pdf() buffer | page.pdf({path}) | Use buffer return (no disk I/O); upload directly to Supabase |

**Installation:** Nothing new to install — all dependencies already in `backend/package.json`.

---

## Architecture Patterns

### Recommended Project Structure (additions only)
```
backend/src/
├── services/
│   └── document.service.ts       # mirrors render.service.ts
├── workers/
│   └── doc.worker.ts             # replace no-op stub (already exists)
├── tools/
│   └── generate-document.tool.ts # mirrors generate-render.tool.ts
├── routes/
│   └── document.routes.ts        # mirrors render.routes.ts
├── controllers/
│   └── document.controller.ts    # mirrors render.controller.ts
└── templates/
    ├── checklist.hbs             # renovation checklist PDF template
    ├── plan.hbs                  # renovation plan PDF template
    └── shopping-list.hbs         # product shopping list PDF template
```

### Pattern 1: DocumentService (mirrors RenderService)

The DocumentService should have the same three-method shape as RenderService:
`requestDocument` (enqueue + DB insert) → `completeDocument` (upload + DB update) →
`failDocument` (DB mark failed). The doc.worker.ts calls `completeDocument` /
`failDocument` exactly as render.worker.ts calls `completeRender` / `failRender`.

```typescript
// Source: backend/src/services/render.service.ts (structural reference)

export class DocumentService {
  async requestDocument(input: RequestDocumentInput): Promise<RequestDocumentResult>
  async completeDocument(documentId: string, pdfBuffer: Buffer, pageCount: number): Promise<DocumentArtifact>
  async failDocument(documentId: string, error: string): Promise<void>
  async getDocuments(sessionId: string): Promise<DocumentArtifact[]>
  async getSignedDownloadUrl(documentId: string, expiresIn?: number): Promise<string | null>
}
```

Key differences from RenderService:
- Insert into `document_artifacts` (not `room_assets`)
- `roomId` is OPTIONAL (nullable) — checklist PDFs are per-room, plan PDFs may be session-wide
- Use `env.SUPABASE_STORAGE_BUCKET` for now (same bucket as renders); use a `documents/` path prefix
- `storagePath` pattern: `session_{sessionId}/documents/{documentType}_{timestamp}.pdf`
- `version` integer increments — check for existing doc of same type+sessionId+roomId and set `previousVersionId`
- `fileSize` comes from `pdfBuffer.length`
- `pageCount` comes from the `page.pdf()` result — Puppeteer does NOT return page count directly; estimate from content height or use a fallback of `null`

### Pattern 2: Puppeteer Launch (Docker container)

The `@sparticuz/chromium` package decompresses its Brotli-packed binary to `/tmp/chromium`
on first call. This works in Docker containers. The key gotcha: `chromium.executablePath()`
is async — always `await` it.

```typescript
// Source: https://github.com/Sparticuz/chromium (verified 2026-03-16)
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export async function createBrowser() {
  // Respect env override for system Chromium (dev / CI)
  const executablePath = env.PUPPETEER_EXECUTABLE_PATH
    ?? await chromium.executablePath();

  const browser = await puppeteer.launch({
    args: puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: 'shell',
  });

  return browser;
}
```

**Critical:** Always call `browser.close()` in a `finally` block. If the browser leaks in
the worker, the job will stall until `lockDuration` (180s) expires.

**Env note:** `PUPPETEER_EXECUTABLE_PATH` is already in `env.ts` as an optional string.
In local dev on Windows/Mac, set this to your local Chrome path. In Docker, leave unset
and let `@sparticuz/chromium` extract its own binary.

### Pattern 3: HTML Rendering Pipeline in Worker

```typescript
// Source: render.worker.ts structural pattern
async function processDocJob(job: Job<DocJobData>): Promise<void> {
  const { sessionId, roomId, documentType } = parsed.data;

  emitToSession(sessionId, 'doc:started', { sessionId, documentType, jobId: job.id });
  emitToSession(sessionId, 'doc:progress', { sessionId, documentType, progress: 0, stage: 'fetching_data' });

  // 1. Fetch data from DB
  emitToSession(sessionId, 'doc:progress', { sessionId, documentType, progress: 20, stage: 'rendering_html' });

  // 2. Compile Handlebars template + render HTML string
  emitToSession(sessionId, 'doc:progress', { sessionId, documentType, progress: 50, stage: 'generating_pdf' });

  // 3. Launch browser, navigate to data: URL, call page.pdf()
  emitToSession(sessionId, 'doc:progress', { sessionId, documentType, progress: 80, stage: 'uploading' });

  // 4. completeDocument (upload + DB update)
  emitToSession(sessionId, 'doc:generated', { sessionId, documentId, documentType, filename, pageCount, fileSize });
}
```

**Important Socket.io event gap:** The current `ServerToClientEvents` in
`socket-events.ts` is missing `doc:started`, `doc:progress`, and `doc:failed`.
Only `doc:generated` is present. All four events (`doc:started`, `doc:progress`,
`doc:generated`, `doc:failed`) have payload types already defined but the server map
does not register `doc:started` / `doc:progress` / `doc:failed`. These must be added
to `ServerToClientEvents` before the worker can emit them safely.

### Pattern 4: Handlebars Template Compilation in ESM

Handlebars 4.7 works in ESM with a named import. Read `.hbs` files at service startup
(not per-request) and cache compiled functions.

```typescript
// Source: https://handlebarsjs.com/api-reference/compilation.html
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load once at module init (or lazily on first use)
const checklistTemplate = Handlebars.compile(
  readFileSync(join(__dirname, '../templates/checklist.hbs'), 'utf-8'),
  { strict: true } // throw on missing fields — makes bugs obvious
);
```

**Template path resolution:** Because the backend compiles TypeScript to `dist/`,
templates at `src/templates/*.hbs` must be copied to `dist/templates/*.hbs` at build
time. The current `tsconfig.json` only emits `.js` files. Options:
1. Add a `cp -r src/templates dist/templates` step to the build script in `package.json`
2. Or inline templates as tagged template literals in the service (simpler for PoC)

**Recommendation:** Add a `postbuild` script: `"postbuild": "cp -r src/templates dist/"`.
Check that `backend/package.json` has a `build` script first.

### Pattern 5: page.pdf() Call (Puppeteer PDF options)

```typescript
// Source: https://pptr.dev/api/puppeteer.pdfoptions (verified 2026-03-16)
const pdfBuffer = await page.pdf({
  format: 'A4',
  printBackground: true,
  margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
  displayHeaderFooter: false, // set to true for project name / page numbers
  tagged: true,  // accessibility tags (default in puppeteer 24.x)
  timeout: 60_000,
});
```

Use `page.setContent(html, { waitUntil: 'networkidle0' })` rather than
`page.goto('data:...')` for documents larger than ~2MB (data: URLs have length limits).
`networkidle0` waits for fonts to load — important for the brand fonts (Inter, DM Serif).

**Font handling:** Fonts loaded via Google Fonts CDN will fail in headless Chromium
because the container has no internet access in most deployments. Two approaches:
1. Embed fonts as base64 data URIs in the template CSS
2. Use system-safe font stacks as fallback: `font-family: 'Georgia', serif`
   (DM Serif Display has no system equivalent; use Georgia as fallback in PDFs)

### Pattern 6: Supabase Storage — Signed Download URL

```typescript
// Source: https://supabase.com/docs/reference/javascript/storage-from-createsignedurl
const { data, error } = await supabaseAdmin.storage
  .from(env.SUPABASE_STORAGE_BUCKET)
  .createSignedUrl(storagePath, expiresIn, {
    download: filename, // triggers Content-Disposition: attachment; filename="..."
  });

if (error || !data) {
  return null;
}
return data.signedUrl;
```

**Existing pattern reference:** `asset.service.ts#getSignedUrl` (line 354) uses
`createSignedUrl(storagePath, expiresIn)` — the same call. Add the `download: filename`
option to force download behavior for PDFs. Default expiry in `asset.service.ts` is
3600s (1 hour); use the same default for document downloads.

### Anti-Patterns to Avoid

- **Keeping the browser alive across jobs:** Puppeteer uses ~300MB RAM per instance.
  Launch fresh per job, close in finally. With `concurrency: 1` the overhead is acceptable.
- **page.goto('data:...'):** Use `page.setContent()` for HTML strings. data: URIs cap
  at ~2MB in Chromium; a checklist with embedded base64 images will exceed this.
- **Fetching Google Fonts in templates:** Will fail silently in containers; use embedded
  fonts or safe fallback stacks.
- **Returning `page.pdf({path})` and reading from disk:** Return Buffer directly. Docker
  containers may have read-only filesystems (this container does not, but /tmp is safer).
- **Using `format: 'letter'` (Puppeteer default):** Renovation documents should use A4
  to match contractor/builder industry standard.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF rendering | Custom HTML→PDF serializer | `page.pdf()` via puppeteer-core | Handles pagination, CSS, fonts |
| HTML templating | String concatenation | Handlebars `compile()` | XSS-safe escaping, partials, helpers |
| Signed URL generation | Custom HMAC signing | `supabaseAdmin.storage.createSignedUrl()` | Already used in asset.service.ts |
| Binary extraction | Custom decompressor | `@sparticuz/chromium` | Handles Brotli decompression + caching |
| Job queueing | Express endpoint polling | BullMQ `getDocQueue()` | Pattern already established |
| Template caching | Re-reading file per request | Module-level `Handlebars.compile()` | Compile once, execute many |

**Key insight:** The entire PDF pipeline (queue → worker → storage → event) is already
plumbed for render jobs. Document generation is the same pipeline with Puppeteer replacing
the Gemini API call.

---

## Common Pitfalls

### Pitfall 1: Browser Not Closed on Error
**What goes wrong:** Puppeteer browser process leaks if `page.pdf()` throws. Worker holds
BullMQ lock until 180s lockDuration expires, causing job queue backup.
**Why it happens:** Async error before `browser.close()` call.
**How to avoid:** Always wrap browser lifecycle in try/finally:
```typescript
const browser = await createBrowser();
try {
  // ...
} finally {
  await browser.close();
}
```
**Warning signs:** BullMQ dashboard shows jobs stuck in "active" for >3 minutes.

### Pitfall 2: Template File Not Copied to dist/
**What goes wrong:** `readFileSync` throws `ENOENT: no such file` at runtime in Docker.
TypeScript compilation emits `.js` files only; `.hbs` files are silently dropped.
**Why it happens:** `tsc` does not copy non-TypeScript assets.
**How to avoid:** Add `"postbuild": "cp -r src/templates dist/"` to `backend/package.json`
scripts. Verify in Dockerfile build log.
**Warning signs:** Works locally with `tsx` (reads from `src/`), fails in Docker.

### Pitfall 3: Alpine 3.20 Chromium Timeout
**What goes wrong:** Puppeteer hangs on `browser.launch()` when using system Chromium
from Alpine's package repository.
**Why it happens:** Alpine 3.20 ships Chromium 129+ which has a known startup timeout
regression with headless mode.
**How to avoid:** Use `@sparticuz/chromium` (already installed) which extracts its own
pinned binary. Do NOT add `RUN apk add chromium` to the Dockerfile.
**Warning signs:** Worker job times out at `lockDuration` (180s) without error log.

### Pitfall 4: Google Fonts Loading Fails Silently
**What goes wrong:** PDF renders with system fallback fonts, inconsistent with the design
system. No error thrown — Chromium silently drops failed resource loads.
**Why it happens:** Container has no outbound internet or Google Fonts is blocked.
**How to avoid:** Use CSS `@font-face` with base64-encoded WOFF2 data URIs for the PDF
templates. For the initial implementation, use safe fallback stacks and document the
limitation.
**Warning signs:** PDF uses Times New Roman or Arial instead of brand fonts.

### Pitfall 5: rooms.plan Is NULL for Most Sessions
**What goes wrong:** The plan PDF generator fetches `room.plan` and gets `null`, producing
an empty document.
**Why it happens:** `rooms.plan` is a JSONB column that is never written. The current
toolset has no `save_plan_state` tool. Only `checklist`, `renderUrls`, and `requirements`
are populated by existing tools.
**How to avoid:** See "Open Questions" — this is a data gap that must be resolved before
plan PDFs are meaningful. The checklist PDF and shopping-list PDF do NOT have this problem.
**Warning signs:** Plan PDF is generated with 0 line items / empty body.

### Pitfall 6: Missing Socket.io Event Registrations
**What goes wrong:** Worker calls `emitToSession(sessionId, 'doc:started', ...)` and
`emitToSession(sessionId, 'doc:failed', ...)` — but these events are NOT in
`ServerToClientEvents`. TypeScript will not catch this (emitToSession takes `string`).
**Why it happens:** Only `doc:generated` is registered in the server type map.
**How to avoid:** Before implementing the worker, add `doc:started`, `doc:progress`,
and `doc:failed` to `ServerToClientEvents` in `packages/shared-types/src/socket-events.ts`.

### Pitfall 7: docGeneratePlanJobSchema Has No documentType
**What goes wrong:** The job schema only has `{ sessionId, roomId, format }` — no
`documentType` field. But `DocumentService` needs to know whether to generate a
checklist, plan, or shopping list.
**Why it happens:** Schema was written before the document type taxonomy existed.
**How to avoid:** Extend `docGeneratePlanJobSchema` and the `JobTypes['doc:generate-plan']`
interface to include `documentType: z.enum(['checklist_pdf', 'plan_pdf', 'materials_list'])`.
This is a breaking change to a queue type — do it before any jobs are enqueued.

---

## Code Examples

### Launching Puppeteer in Docker

```typescript
// Source: https://github.com/Sparticuz/chromium (verified 2026-03-16)
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { env } from '../config/env.js';

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const executablePath = env.PUPPETEER_EXECUTABLE_PATH
    ?? await chromium.executablePath();

  const browser = await puppeteer.launch({
    args: puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: 'shell',
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      tagged: true,
      timeout: 60_000,
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
```

### Handlebars Template Compilation (ESM)

```typescript
// Source: https://handlebarsjs.com/api-reference/compilation.html
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templateDir = join(__dirname, '../templates');

// Compile once at module init
const TEMPLATES = {
  checklist_pdf: Handlebars.compile(
    readFileSync(join(templateDir, 'checklist.hbs'), 'utf-8'),
    { strict: true }
  ),
  materials_list: Handlebars.compile(
    readFileSync(join(templateDir, 'shopping-list.hbs'), 'utf-8'),
    { strict: true }
  ),
  plan_pdf: Handlebars.compile(
    readFileSync(join(templateDir, 'plan.hbs'), 'utf-8'),
    { strict: true }
  ),
};

export function renderTemplate(type: DocumentType, data: unknown): string {
  const fn = TEMPLATES[type as keyof typeof TEMPLATES];
  if (!fn) throw new Error(`Unknown template type: ${type}`);
  return fn(data as Record<string, unknown>);
}
```

### Supabase Storage Upload + Signed URL

```typescript
// Source: asset.service.ts#getSignedUrl (codebase, verified 2026-03-16)
// Source: https://supabase.com/docs/reference/javascript/storage-from-createsignedurl
const { error: uploadError } = await supabaseAdmin.storage
  .from(env.SUPABASE_STORAGE_BUCKET)
  .upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  });

// Download URL (forces Content-Disposition: attachment)
const { data, error } = await supabaseAdmin.storage
  .from(env.SUPABASE_STORAGE_BUCKET)
  .createSignedUrl(storagePath, 3600, { download: filename });
```

### Print CSS for Multi-Page PDFs

```css
/* Source: https://www.customjs.space/blog/print-css-cheatsheet/ */
@media print {
  /* Prevent tables/cards splitting across pages */
  .checklist-item,
  .product-card,
  tr {
    break-inside: avoid;
    page-break-inside: avoid; /* legacy */
  }

  /* Force page break before major sections */
  .section-header {
    break-before: page;
  }

  /* Keep heading with its following content */
  h2, h3 {
    break-after: avoid;
  }

  /* Background colors require this — otherwise Puppeteer strips them */
  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}

/* Avoid data: URL for images — use inline base64 or relative paths */
/* External URLs (Google Fonts, CDN images) will fail in Docker containers */
```

### Versioning Pattern (document_artifacts)

```typescript
// Source: document-artifacts.schema.ts (codebase, verified 2026-03-16)
// Check for existing doc of same type for this session/room
const [existing] = await db
  .select({ id: documentArtifacts.id, version: documentArtifacts.version })
  .from(documentArtifacts)
  .where(
    and(
      eq(documentArtifacts.sessionId, sessionId),
      eq(documentArtifacts.documentType, documentType),
      roomId
        ? eq(documentArtifacts.roomId, roomId)
        : isNull(documentArtifacts.roomId)
    )
  )
  .orderBy(desc(documentArtifacts.version))
  .limit(1);

const version = (existing?.version ?? 0) + 1;
const previousVersionId = existing?.id ?? null;

// Insert new version
await db.insert(documentArtifacts).values({
  sessionId,
  roomId: roomId ?? null,
  documentType,
  version,
  previousVersionId,
  // ...rest of fields
});
```

---

## Resolving the rooms.plan Data Gap

**The problem:** `rooms.plan` is always `null` in the current implementation. No tool
writes to it. The plan PDF has no source data.

**Two options investigated:**

**Option A — require save_plan_state tool first (RECOMMENDED)**
Add a `save_plan_state` LangGraph tool analogous to `save_checklist_state`. The agent
calls it during the PLAN phase with a structured plan object. The `generate_document`
tool for `plan_pdf` then checks that `room.plan` is non-null before enqueueing.

Advantages:
- Clean separation of concerns
- Plan data is structured and queryable
- Consistent with save_checklist_state / save_renders_state pattern

The plan schema for `rooms.plan` JSONB should be defined in a Zod schema mirroring
what the agent outputs. Recommended shape based on industry standard:
```typescript
interface RoomPlan {
  summary: string;
  phases: Array<{
    name: string;
    tasks: Array<{ title: string; description: string; estimatedDays: number }>;
    estimatedCost?: number;
  }>;
  timeline: { startWeek: number; durationWeeks: number };
  totalEstimatedCost?: number;
}
```

**Option B — fallback to chat_messages (NOT RECOMMENDED)**
Scan `chat_messages` for assistant messages containing plan-like content and include
them verbatim. This is fragile: unstructured, inconsistent formatting, no query index.
The resulting PDF would be a raw chat transcript, not a structured document.

**Decision:** Use Option A. Build `save_plan_state` tool as part of Phase 3A scope.
The checklist PDF and shopping list PDF can be implemented immediately (their data
exists). The plan PDF should be gated behind `room.plan !== null`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `page.launch({ args: ['--no-sandbox'] })` | `puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' })` | @sparticuz/chromium recent versions | Removes need for manual --no-sandbox flag |
| `page.pdf()` returns Uint8Array | `page.pdf()` returns Buffer (Node.js) | Puppeteer 21+ | Direct `.length` access for fileSize |
| `chromium.executablePath` (sync) | `await chromium.executablePath()` (async) | @sparticuz/chromium v110+ | Must await — sync form is deprecated |
| `headless: true` | `headless: 'shell'` | Puppeteer 22+ | Old boolean deprecated; use 'shell' string |

**Deprecated/outdated:**
- `page.emulateMediaType('print')` before `page.pdf()`: Not needed in modern Puppeteer —
  `page.pdf()` already uses the print media type.
- `chromium.font()` helper from older @sparticuz/chromium: Removed; embed fonts in CSS.

---

## Open Questions

1. **rooms.plan data shape**
   - What we know: Column exists as raw JSONB, always null, no write path
   - What's unclear: What exact schema the AI agent should output for a renovation plan
   - Recommendation: Define the Zod schema and build `save_plan_state` tool before
     implementing the plan PDF template. Block plan PDF generation until `room.plan !== null`.

2. **Template file copy at build time**
   - What we know: TypeScript compiler ignores `.hbs` files
   - What's unclear: Whether the current `pnpm run build` script has a postbuild hook
   - Recommendation: Check `backend/package.json` `scripts.build` before implementing
     templates; add `postbuild` step if missing.

3. **Font embedding approach**
   - What we know: Google Fonts will fail in Docker containers; brand fonts are loaded
     via `next/font` on the frontend
   - What's unclear: Whether the team wants pixel-perfect brand fonts in PDFs or
     acceptable fallbacks
   - Recommendation: For Phase 3A, use web-safe font stacks (Georgia for serif, Arial
     for sans-serif). Embed fonts as base64 in a later polish pass.

4. **SUPABASE_STORAGE_BUCKET vs separate PDF bucket**
   - What we know: Renders use `SUPABASE_STORAGE_BUCKET` (default: `room-assets`)
   - What's unclear: Whether PDFs should share the same bucket or use `SUPABASE_STYLE_BUCKET`
     or a dedicated `documents` bucket
   - Recommendation: Reuse `SUPABASE_STORAGE_BUCKET` with path prefix
     `session_{id}/documents/`. Separate buckets can be added later with an env var.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `backend/src/services/render.service.ts` — RenderService pattern to mirror
- `backend/src/workers/render.worker.ts` — Worker implementation pattern
- `backend/src/workers/doc.worker.ts` — Existing stub (what to replace)
- `backend/src/config/queue.ts` — Queue/worker infrastructure
- `backend/src/db/schema/document-artifacts.schema.ts` — DB schema already defined
- `backend/src/validators/job.validators.ts` — Existing Zod schemas
- `backend/src/utils/agent-guards.ts` — ALLOWED_TOOLS whitelist, formatAsyncToolResponse
- `packages/shared-types/src/socket-events.ts` — All Socket.io event types
- `backend/src/services/asset.service.ts` — Supabase Storage pattern (createSignedUrl)
- `backend/src/config/env.ts` — PUPPETEER_EXECUTABLE_PATH, PDF_GENERATION_ENABLED already defined

### Secondary (MEDIUM confidence — official docs via WebFetch)
- https://pptr.dev/api/puppeteer.pdfoptions — PDFOptions properties verified
- https://github.com/Sparticuz/chromium — executablePath + launch args pattern
- https://handlebarsjs.com/api-reference/compilation.html — Handlebars.compile() API
- https://supabase.com/docs/reference/javascript/storage-from-createsignedurl — download option

### Tertiary (LOW confidence — WebSearch only)
- Alpine 3.20 Chromium timeout issue — mentioned in multiple sources, not independently verified
  with official Alpine/Puppeteer changelog. Treat as credible but validate before assuming.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, versions confirmed from package.json
- Architecture (DocumentService/worker pattern): HIGH — mirrors existing render pipeline 1:1
- Puppeteer launch options: MEDIUM — verified via GitHub README but @sparticuz/chromium API
  evolves fast; validate against installed version 143.0.4
- Print CSS: MEDIUM — pattern well-documented, specific page-break behavior needs testing
- Supabase signed URL: HIGH — existing pattern in asset.service.ts, official docs verified
- rooms.plan data gap: HIGH — confirmed null by schema inspection, no write path exists

**Research date:** 2026-03-16
**Valid until:** 2026-04-15 (stable dependencies; @sparticuz/chromium minor updates may affect launch args)
