---
plan: "3A.2"
wave: 2
depends_on: ["3A.1"]
title: "DocumentService + Handlebars templates (checklist + plan PDF generation)"
files_modified:
  - backend/src/templates/partials/print-styles.hbs
  - backend/src/templates/checklist.hbs
  - backend/src/templates/renovation-plan.hbs
  - backend/src/services/document.service.ts
autonomous: true
must_haves:
  truths:
    - "DocumentService.generateChecklist() queries room checklists and produces a PDF buffer"
    - "DocumentService.generatePlan() queries sessions.planData and produces a PDF buffer"
    - "DocumentService.getDocuments() returns document_artifacts with signed URLs"
    - "Handlebars templates compile without errors and produce valid HTML"
    - "Browser pool recycles after 50 jobs to prevent memory leaks"
  artifacts:
    - path: "backend/src/services/document.service.ts"
      provides: "DocumentService class with generateChecklist, generatePlan, getDocuments"
      exports: ["DocumentService"]
    - path: "backend/src/templates/partials/print-styles.hbs"
      provides: "Shared print CSS partial for all PDF templates"
      contains: "@page"
    - path: "backend/src/templates/checklist.hbs"
      provides: "Checklist PDF Handlebars template"
      contains: "{{> print-styles}}"
    - path: "backend/src/templates/renovation-plan.hbs"
      provides: "Renovation plan PDF Handlebars template"
      contains: "{{> print-styles}}"
  key_links:
    - from: "backend/src/services/document.service.ts"
      to: "backend/src/db/schema/document-artifacts.schema.ts"
      via: "Drizzle insert into documentArtifacts"
      pattern: "documentArtifacts"
    - from: "backend/src/services/document.service.ts"
      to: "backend/src/db/jsonb-schemas.ts"
      via: "RenovationPlanSchema.parse for runtime validation"
      pattern: "RenovationPlanSchema"
    - from: "backend/src/services/document.service.ts"
      to: "backend/src/config/supabase.ts"
      via: "supabaseAdmin.storage upload"
      pattern: "supabaseAdmin"
---

<objective>
Build the DocumentService that generates PDF documents via Puppeteer + Handlebars, uploads them to Supabase Storage, and records them in `document_artifacts`. Also create the three Handlebars templates: shared print-styles partial, checklist template, and renovation-plan template.

Purpose: This is the core PDF generation capability. The worker (Wave 4) delegates to DocumentService, and the REST API (Wave 4) calls `getDocuments` for listing.

Output: `document.service.ts` with full PDF pipeline, 3 Handlebars template files.
</objective>

<context>
@backend/src/services/render.service.ts (pattern: service class, Supabase upload, DB insert)
@backend/src/db/schema/document-artifacts.schema.ts (documentArtifacts table shape)
@backend/src/db/jsonb-schemas.ts (RenovationPlanSchema -- from Wave 1)
@backend/src/db/schema/sessions.schema.ts (planData column -- from Wave 1)
@backend/src/db/schema/rooms.schema.ts (checklist jsonb column)
@backend/src/config/env.ts (SUPABASE_DOCUMENTS_BUCKET, isPdfEnabled, isStorageEnabled)
@backend/src/config/supabase.ts (supabaseAdmin client)
@docs/research/PDF_Generation_Pipeline_Research.md (Topics 1-4: Puppeteer launch, browser pool, Handlebars, Supabase upload)
</context>

<tasks>

<task id="3A.2.1" title="Create Handlebars templates (print-styles partial, checklist, renovation-plan)">
  <read_first>
    - docs/research/PDF_Generation_Pipeline_Research.md -- Topic 2 (template structure, CSS patterns, helpers)
    - backend/src/db/schema/rooms.schema.ts -- checklist JSONB column shape (array of items)
    - backend/src/db/jsonb-schemas.ts -- RenovationPlanSchema (after Wave 1 adds it): rooms, tasks, contractors, summary, totalBudget, totalDays
  </read_first>
  <action>
    **1. Create directory structure:**
    ```bash
    mkdir -p backend/src/templates/partials
    ```

    **2. Create `backend/src/templates/partials/print-styles.hbs`:**

    This is the shared CSS partial included by all PDF templates. Use inline `<style>` block with print-optimized CSS:

    ```handlebars
    <style>
      @page {
        size: A4;
        margin: 20mm 15mm;
      }
      @page :first {
        margin-top: 25mm;
      }
      :root {
        --color-primary: #b85c38;
        --color-secondary: #5c8a6e;
        --color-text: #1a1a1a;
        --color-muted: #6b7280;
        --color-border: #e5e7eb;
        --color-bg-light: #f9fafb;
        --font-body: 10pt;
        --font-heading: 14pt;
        --font-small: 8pt;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
        font-size: var(--font-body);
        line-height: 1.6;
        color: var(--color-text);
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      h1 { font-family: 'DM Serif Display', Georgia, serif; font-size: 22pt; color: var(--color-primary); margin-bottom: 8pt; }
      h2 { font-family: 'DM Serif Display', Georgia, serif; font-size: var(--font-heading); color: var(--color-primary); margin-top: 16pt; margin-bottom: 8pt; border-bottom: 1.5pt solid var(--color-primary); padding-bottom: 4pt; }
      h3 { font-size: 12pt; color: var(--color-text); margin-top: 12pt; margin-bottom: 6pt; }
      p { margin-bottom: 6pt; }
      .section { break-before: page; }
      .no-break { break-inside: avoid; page-break-inside: avoid; }
      .keep-together { break-inside: avoid; page-break-inside: avoid; }
      p, li { orphans: 3; widows: 3; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
      th { background: var(--color-primary); color: white; text-align: left; padding: 6pt 8pt; font-size: var(--font-small); text-transform: uppercase; letter-spacing: 0.05em; }
      td { padding: 6pt 8pt; border-bottom: 0.5pt solid var(--color-border); font-size: var(--font-body); }
      tr:nth-child(even) td { background: var(--color-bg-light); }
      .badge { display: inline-block; padding: 2pt 6pt; border-radius: 3pt; font-size: var(--font-small); font-weight: 600; }
      .badge-critical { background: #fef2f2; color: #991b1b; }
      .badge-high { background: #fef3c7; color: #92400e; }
      .badge-medium { background: #ecfdf5; color: #065f46; }
      .badge-low { background: #f0f9ff; color: #1e40af; }
      .badge-must-have { background: #fef2f2; color: #991b1b; }
      .badge-nice-to-have { background: #fef3c7; color: #92400e; }
      .badge-optional { background: #f0f9ff; color: #1e40af; }
      .budget-callout { background: var(--color-bg-light); border-left: 3pt solid var(--color-primary); padding: 10pt 12pt; margin: 10pt 0; }
      .budget-callout strong { font-size: 16pt; color: var(--color-primary); }
      .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10pt; margin: 12pt 0; }
      .summary-card { background: var(--color-bg-light); border: 0.5pt solid var(--color-border); border-radius: 4pt; padding: 10pt; text-align: center; }
      .summary-card .value { font-size: 18pt; font-weight: 700; color: var(--color-primary); }
      .summary-card .label { font-size: var(--font-small); color: var(--color-muted); text-transform: uppercase; }
      .footer { margin-top: 20pt; padding-top: 8pt; border-top: 0.5pt solid var(--color-border); font-size: var(--font-small); color: var(--color-muted); text-align: center; }
      .checklist-item { display: flex; align-items: flex-start; gap: 6pt; padding: 4pt 0; }
      .checklist-box { width: 12pt; height: 12pt; border: 1pt solid var(--color-muted); border-radius: 2pt; flex-shrink: 0; margin-top: 2pt; }
      .checklist-box.completed { background: var(--color-secondary); border-color: var(--color-secondary); }
      .contractor-card { border: 0.5pt solid var(--color-border); border-radius: 4pt; padding: 8pt 10pt; margin: 6pt 0; }
      .warning-box { background: #fef3c7; border-left: 3pt solid #f59e0b; padding: 8pt 10pt; margin: 8pt 0; font-size: var(--font-small); }
    </style>
    ```

    **3. Create `backend/src/templates/checklist.hbs`:**

    Template data shape (passed by DocumentService):
    ```typescript
    interface ChecklistTemplateData {
      sessionTitle: string;
      generatedAt: string;  // formatted date
      rooms: Array<{
        name: string;
        type: string;
        budget: string | null;  // formatted currency or null
        checklist: Array<{
          id: string;
          category: string;
          description: string;
          priority: 'must-have' | 'nice-to-have' | 'optional';
          estimatedBudget?: string;  // formatted currency
          completed: boolean;
        }>;
        products: Array<{
          name: string;
          category: string;
          price: string;  // formatted currency
        }>;
      }>;
      totalItems: number;
      completedItems: number;
    }
    ```

    Template structure:
    ```handlebars
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Renovation Checklist - {{sessionTitle}}</title>
      {{> print-styles}}
    </head>
    <body>
      <h1>Renovation Checklist</h1>
      <p>{{sessionTitle}} &mdash; Generated {{generatedAt}}</p>
      <p>{{completedItems}} of {{totalItems}} items completed</p>

      {{#each rooms}}
      <div class="{{#unless @first}}section{{/unless}}">
        <h2>{{name}} ({{type}})</h2>
        {{#if budget}}
        <div class="budget-callout">
          <span>Room Budget:</span> <strong>{{budget}}</strong>
        </div>
        {{/if}}

        {{#if checklist.length}}
        <h3>Checklist Items</h3>
        <table>
          <thead>
            <tr>
              <th style="width:5%"></th>
              <th style="width:30%">Item</th>
              <th style="width:15%">Category</th>
              <th style="width:15%">Priority</th>
              <th style="width:15%">Est. Budget</th>
            </tr>
          </thead>
          <tbody>
            {{#each checklist}}
            <tr class="no-break">
              <td><div class="checklist-box {{#if completed}}completed{{/if}}"></div></td>
              <td>{{description}}</td>
              <td>{{category}}</td>
              <td><span class="badge badge-{{priority}}">{{priority}}</span></td>
              <td>{{#if estimatedBudget}}{{estimatedBudget}}{{else}}&mdash;{{/if}}</td>
            </tr>
            {{/each}}
          </tbody>
        </table>
        {{/if}}

        {{#if products.length}}
        <h3>Recommended Products</h3>
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            {{#each products}}
            <tr class="no-break">
              <td>{{name}}</td>
              <td>{{category}}</td>
              <td>{{price}}</td>
            </tr>
            {{/each}}
          </tbody>
        </table>
        {{/if}}
      </div>
      {{/each}}

      <div class="footer">
        Generated by Renovation Agent &bull; {{generatedAt}}
      </div>
    </body>
    </html>
    ```

    **4. Create `backend/src/templates/renovation-plan.hbs`:**

    Template data shape (passed by DocumentService):
    ```typescript
    interface PlanTemplateData {
      sessionTitle: string;
      generatedAt: string;
      plan: {
        summary: string;
        totalBudget: string;  // formatted currency
        totalDays: number;
        startDate?: string;
        rooms: Array<{
          roomName: string;
          estimatedCost: string;
          estimatedDays: number;
          tasks: Array<{
            description: string;
            estimatedCost: string;
            duration: number;
            tradeCategory: string;
            priority: string;
          }>;
        }>;
        contractors: Array<{
          specialty: string;
          estimatedCost: string;
          notes?: string;
        }>;
        warnings: string[];
      };
    }
    ```

    Template structure:
    ```handlebars
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Renovation Plan - {{sessionTitle}}</title>
      {{> print-styles}}
    </head>
    <body>
      <h1>Renovation Plan</h1>
      <p>{{sessionTitle}}</p>
      <p class="footer">Generated {{generatedAt}}</p>

      <div class="summary-grid">
        <div class="summary-card no-break">
          <div class="value">{{plan.totalBudget}}</div>
          <div class="label">Total Budget</div>
        </div>
        <div class="summary-card no-break">
          <div class="value">{{plan.totalDays}}</div>
          <div class="label">Total Days</div>
        </div>
        <div class="summary-card no-break">
          <div class="value">{{plan.rooms.length}}</div>
          <div class="label">Rooms</div>
        </div>
      </div>

      <div class="budget-callout">
        <h3>Summary</h3>
        <p>{{plan.summary}}</p>
      </div>

      {{#if plan.warnings.length}}
      <div class="keep-together">
        <h2>Warnings &amp; Notices</h2>
        {{#each plan.warnings}}
        <div class="warning-box no-break">{{this}}</div>
        {{/each}}
      </div>
      {{/if}}

      {{#each plan.rooms}}
      <div class="section">
        <h2>{{roomName}}</h2>
        <p><strong>Estimated:</strong> {{estimatedCost}} &bull; {{estimatedDays}} days</p>

        <table>
          <thead>
            <tr>
              <th style="width:35%">Task</th>
              <th style="width:15%">Trade</th>
              <th style="width:15%">Priority</th>
              <th style="width:15%">Cost</th>
              <th style="width:10%">Days</th>
            </tr>
          </thead>
          <tbody>
            {{#each tasks}}
            <tr class="no-break">
              <td>{{description}}</td>
              <td>{{tradeCategory}}</td>
              <td><span class="badge badge-{{priority}}">{{priority}}</span></td>
              <td>{{estimatedCost}}</td>
              <td>{{duration}}</td>
            </tr>
            {{/each}}
          </tbody>
        </table>
      </div>
      {{/each}}

      {{#if plan.contractors.length}}
      <div class="section">
        <h2>Recommended Contractors</h2>
        {{#each plan.contractors}}
        <div class="contractor-card no-break">
          <strong>{{specialty}}</strong>
          <span> &mdash; {{estimatedCost}}</span>
          {{#if notes}}<p style="margin-top:4pt;font-size:var(--font-small);color:var(--color-muted);">{{notes}}</p>{{/if}}
        </div>
        {{/each}}
      </div>
      {{/if}}

      <div class="footer">
        Generated by Renovation Agent &bull; {{generatedAt}}
      </div>
    </body>
    </html>
    ```
  </action>
  <acceptance_criteria>
    - `test -f backend/src/templates/partials/print-styles.hbs && echo "exists"` prints "exists"
    - `test -f backend/src/templates/checklist.hbs && echo "exists"` prints "exists"
    - `test -f backend/src/templates/renovation-plan.hbs && echo "exists"` prints "exists"
    - `grep "@page" backend/src/templates/partials/print-styles.hbs` finds the print CSS
    - `grep "print-styles" backend/src/templates/checklist.hbs` confirms partial inclusion
    - `grep "print-styles" backend/src/templates/renovation-plan.hbs` confirms partial inclusion
    - `grep "{{#each rooms}}" backend/src/templates/checklist.hbs` confirms room iteration
    - `grep "{{#each plan.rooms}}" backend/src/templates/renovation-plan.hbs` confirms plan room iteration
  </acceptance_criteria>
</task>

<task id="3A.2.2" title="Create DocumentService with Puppeteer PDF generation and Supabase upload">
  <read_first>
    - backend/src/services/render.service.ts -- pattern: service class, constructor, Supabase upload via supabaseAdmin, error types (NotFoundError, BadRequestError)
    - backend/src/db/schema/document-artifacts.schema.ts -- documentArtifacts table shape and types (NewDocumentArtifact, DocumentArtifact, DocumentType)
    - backend/src/config/env.ts -- env.SUPABASE_DOCUMENTS_BUCKET (added in Wave 1), isStorageEnabled(), isPdfEnabled()
    - backend/src/config/supabase.ts -- supabaseAdmin client (null if auth not configured)
    - backend/src/db/jsonb-schemas.ts -- RenovationPlanSchema for runtime validation
    - docs/research/PDF_Generation_Pipeline_Research.md -- Topics 1 + 4 (Puppeteer launch, browser pool, Supabase upload, signed URLs)
    - backend/src/db/schema/rooms.schema.ts -- renovationRooms table (checklist jsonb column)
    - backend/src/db/schema/sessions.schema.ts -- renovationSessions (planData column from Wave 1)
  </read_first>
  <action>
    Create `backend/src/services/document.service.ts`:

    **Imports:**
    ```typescript
    import chromium from '@sparticuz/chromium';
    import puppeteer, { type Browser, type Page } from 'puppeteer-core';
    import Handlebars from 'handlebars';
    import { readFileSync } from 'fs';
    import { join } from 'path';
    import { eq, and, desc } from 'drizzle-orm';
    import { db } from '../db/index.js';
    import { renovationSessions } from '../db/schema/sessions.schema.js';
    import { renovationRooms } from '../db/schema/rooms.schema.js';
    import { documentArtifacts, type DocumentType, type NewDocumentArtifact } from '../db/schema/document-artifacts.schema.js';
    import { RenovationPlanSchema } from '../db/jsonb-schemas.js';
    import { env, isStorageEnabled, isPdfEnabled } from '../config/env.js';
    import { supabaseAdmin } from '../config/supabase.js';
    import { Logger } from '../utils/logger.js';
    import { NotFoundError, BadRequestError } from '../utils/errors.js';
    ```

    **Constants and Handlebars setup:**
    ```typescript
    const logger = new Logger({ serviceName: 'DocumentService' });

    const TEMPLATE_DIR = join(process.cwd(), 'src', 'templates');
    const BROWSER_RECYCLE_AFTER = 50;
    const PDF_TIMEOUT_MS = 60_000;

    // Register Handlebars helpers
    Handlebars.registerHelper('formatCurrency', (value: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
    );
    Handlebars.registerHelper('formatDate', (date: string | Date) =>
      new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(
        typeof date === 'string' ? new Date(date) : date
      )
    );

    // Register partials
    Handlebars.registerPartial(
      'print-styles',
      readFileSync(join(TEMPLATE_DIR, 'partials', 'print-styles.hbs'), 'utf8')
    );

    // Compile templates once
    const checklistTemplate = Handlebars.compile(
      readFileSync(join(TEMPLATE_DIR, 'checklist.hbs'), 'utf8')
    );
    const planTemplate = Handlebars.compile(
      readFileSync(join(TEMPLATE_DIR, 'renovation-plan.hbs'), 'utf8')
    );
    ```

    **Chromium launch config:**
    ```typescript
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;

    const CHROME_ARGS = [
      ...chromium.args,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-accelerated-2d-canvas',
      '--font-render-hinting=none',
    ];

    async function launchBrowser(): Promise<Browser> {
      const isLocal = env.NODE_ENV === 'development';
      if (isLocal) {
        // In dev, try local Chrome or the env override
        return puppeteer.launch(
          env.PUPPETEER_EXECUTABLE_PATH
            ? { executablePath: env.PUPPETEER_EXECUTABLE_PATH, headless: true }
            : { channel: 'chrome' }
        );
      }
      return puppeteer.launch({
        args: CHROME_ARGS,
        executablePath: await chromium.executablePath(),
        headless: true,
        protocolTimeout: PDF_TIMEOUT_MS,
      });
    }
    ```

    **Currency formatter helper (for template data):**
    ```typescript
    function fmtCurrency(value: number | string | null | undefined): string {
      const num = typeof value === 'string' ? parseFloat(value) : value;
      if (num == null || isNaN(num)) return '$0.00';
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
    }

    function fmtDate(date?: Date | string | null): string {
      const d = date ? new Date(date) : new Date();
      return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(d);
    }
    ```

    **DocumentService class:**

    ```typescript
    export class DocumentService {
      private browser: Browser | null = null;
      private jobCount = 0;

      /** Get or create a browser instance, recycling after BROWSER_RECYCLE_AFTER jobs */
      private async getBrowser(): Promise<Browser> {
        if (!this.browser || !this.browser.connected || this.jobCount >= BROWSER_RECYCLE_AFTER) {
          if (this.browser) {
            try {
              this.browser.process()?.kill(9);
            } catch {
              // Process may already be dead
            }
          }
          this.browser = await launchBrowser();
          this.jobCount = 0;
        }
        this.jobCount++;
        return this.browser;
      }

      /** Render HTML to PDF buffer */
      private async renderPdf(html: string): Promise<Buffer> {
        const browser = await this.getBrowser();
        const page: Page = await browser.newPage();
        try {
          await page.setContent(html, { waitUntil: 'networkidle0' });
          await page.evaluateHandle('document.fonts.ready');
          const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
          });
          return Buffer.from(pdfBuffer);
        } finally {
          await page.close();
        }
      }

      /** Upload PDF to Supabase Storage, return storage path */
      private async uploadPdf(sessionId: string, documentType: DocumentType, pdfBuffer: Buffer): Promise<string> {
        const timestamp = Date.now();
        const storagePath = `sessions/${sessionId}/documents/${documentType}_${timestamp}.pdf`;

        if (isStorageEnabled() && supabaseAdmin) {
          const { error } = await supabaseAdmin.storage
            .from(env.SUPABASE_DOCUMENTS_BUCKET)
            .upload(storagePath, pdfBuffer, {
              contentType: 'application/pdf',
              cacheControl: '3600',
              upsert: false,
            });
          if (error) {
            throw new Error(`Supabase Storage upload failed: ${error.message}`);
          }
        } else {
          logger.warn('Storage not configured - PDF saved to DB record only', undefined, { sessionId, documentType });
        }

        return storagePath;
      }

      /** Create a signed download URL for a storage path */
      private async createSignedUrl(storagePath: string, expiresInSeconds = 86_400): Promise<string | null> {
        if (!isStorageEnabled() || !supabaseAdmin) return null;
        const { data, error } = await supabaseAdmin.storage
          .from(env.SUPABASE_DOCUMENTS_BUCKET)
          .createSignedUrl(storagePath, expiresInSeconds);
        if (error || !data?.signedUrl) {
          logger.warn('Failed to create signed URL', undefined, { storagePath, error: error?.message });
          return null;
        }
        return data.signedUrl;
      }

      /** Get the next version number for a document type in a session */
      private async getNextVersion(sessionId: string, documentType: DocumentType): Promise<{ version: number; previousVersionId: string | null }> {
        const [latest] = await db
          .select({ id: documentArtifacts.id, version: documentArtifacts.version })
          .from(documentArtifacts)
          .where(and(
            eq(documentArtifacts.sessionId, sessionId),
            eq(documentArtifacts.documentType, documentType),
          ))
          .orderBy(desc(documentArtifacts.version))
          .limit(1);
        return {
          version: latest ? latest.version + 1 : 1,
          previousVersionId: latest?.id ?? null,
        };
      }

      /** Insert a document_artifacts record */
      private async insertArtifact(data: NewDocumentArtifact): Promise<string> {
        const [row] = await db.insert(documentArtifacts).values(data).returning();
        if (!row) throw new Error('Failed to insert document artifact');
        return row.id;
      }

      // ── Public API ─────────────────────────────────────────────

      /**
       * Generate a checklist PDF for a session (optionally scoped to a room).
       * Queries renovation_rooms.checklist + product_recommendations, renders template, Puppeteer PDF, uploads, inserts artifact.
       */
      async generateChecklist(sessionId: string, roomId?: string): Promise<{ documentId: string; storagePath: string }> {
        logger.info('Generating checklist PDF', { sessionId, roomId });

        if (!isPdfEnabled()) {
          throw new BadRequestError('PDF generation is disabled');
        }

        // Query session
        const [session] = await db
          .select({ id: renovationSessions.id, title: renovationSessions.title })
          .from(renovationSessions)
          .where(eq(renovationSessions.id, sessionId));
        if (!session) throw new NotFoundError(`Session not found: ${sessionId}`);

        // Query rooms (filtered by roomId if provided)
        const roomQuery = roomId
          ? db.select().from(renovationRooms).where(and(eq(renovationRooms.sessionId, sessionId), eq(renovationRooms.id, roomId)))
          : db.select().from(renovationRooms).where(eq(renovationRooms.sessionId, sessionId));
        const rooms = await roomQuery;

        if (rooms.length === 0) {
          throw new NotFoundError('No rooms found for this session');
        }

        // Build template data
        const templateRooms = rooms.map(room => {
          const checklist = Array.isArray(room.checklist) ? (room.checklist as Array<Record<string, unknown>>) : [];
          return {
            name: room.name,
            type: room.type,
            budget: room.budget ? fmtCurrency(room.budget) : null,
            checklist: checklist.map(item => ({
              id: String(item.id ?? ''),
              category: String(item.category ?? 'general'),
              description: String(item.description ?? ''),
              priority: String(item.priority ?? 'medium') as 'must-have' | 'nice-to-have' | 'optional',
              estimatedBudget: item.estimatedBudget ? fmtCurrency(Number(item.estimatedBudget)) : undefined,
              completed: Boolean(item.completed),
            })),
            products: [],  // Product recommendations can be joined later
          };
        });

        const allItems = templateRooms.flatMap(r => r.checklist);

        const html = checklistTemplate({
          sessionTitle: session.title,
          generatedAt: fmtDate(),
          rooms: templateRooms,
          totalItems: allItems.length,
          completedItems: allItems.filter(i => i.completed).length,
        });

        const pdfBuffer = await this.renderPdf(html);
        const storagePath = await this.uploadPdf(sessionId, 'checklist_pdf', pdfBuffer);
        const { version, previousVersionId } = await this.getNextVersion(sessionId, 'checklist_pdf');

        const documentId = await this.insertArtifact({
          sessionId,
          roomId: roomId ?? null,
          documentType: 'checklist_pdf',
          phase: 'CHECKLIST',
          storagePath,
          filename: `checklist_v${version}.pdf`,
          contentType: 'application/pdf',
          fileSize: pdfBuffer.length,
          generatedBy: 'ai',
          version,
          previousVersionId,
        });

        logger.info('Checklist PDF generated', { sessionId, documentId, version, sizeBytes: pdfBuffer.length });

        return { documentId, storagePath };
      }

      /**
       * Generate a renovation plan PDF from sessions.planData.
       * Validates planData via RenovationPlanSchema, renders template, Puppeteer PDF, uploads, inserts artifact.
       */
      async generatePlan(sessionId: string): Promise<{ documentId: string; storagePath: string }> {
        logger.info('Generating plan PDF', { sessionId });

        if (!isPdfEnabled()) {
          throw new BadRequestError('PDF generation is disabled');
        }

        // Query session with planData
        const [session] = await db
          .select({
            id: renovationSessions.id,
            title: renovationSessions.title,
            planData: renovationSessions.planData,
          })
          .from(renovationSessions)
          .where(eq(renovationSessions.id, sessionId));

        if (!session) throw new NotFoundError(`Session not found: ${sessionId}`);
        if (!session.planData) throw new BadRequestError('No plan data found. The agent must call save_plan_state first.');

        // Runtime validation of planData
        const plan = RenovationPlanSchema.parse(session.planData);

        const html = planTemplate({
          sessionTitle: session.title,
          generatedAt: fmtDate(),
          plan: {
            summary: plan.summary,
            totalBudget: fmtCurrency(plan.totalBudget),
            totalDays: plan.totalDays,
            startDate: plan.startDate,
            rooms: plan.rooms.map(room => ({
              roomName: room.roomName,
              estimatedCost: fmtCurrency(room.estimatedCost),
              estimatedDays: room.estimatedDays,
              tasks: room.tasks.map(task => ({
                description: task.description,
                estimatedCost: fmtCurrency(task.estimatedCost),
                duration: task.duration,
                tradeCategory: task.tradeCategory,
                priority: task.priority,
              })),
            })),
            contractors: plan.contractors.map(c => ({
              specialty: c.specialty,
              estimatedCost: fmtCurrency(c.estimatedCost),
              notes: c.notes,
            })),
            warnings: plan.warnings,
          },
        });

        const pdfBuffer = await this.renderPdf(html);
        const storagePath = await this.uploadPdf(sessionId, 'plan_pdf', pdfBuffer);
        const { version, previousVersionId } = await this.getNextVersion(sessionId, 'plan_pdf');

        const documentId = await this.insertArtifact({
          sessionId,
          documentType: 'plan_pdf',
          phase: 'PLAN',
          storagePath,
          filename: `renovation_plan_v${version}.pdf`,
          contentType: 'application/pdf',
          fileSize: pdfBuffer.length,
          generatedBy: 'ai',
          version,
          previousVersionId,
        });

        logger.info('Plan PDF generated', { sessionId, documentId, version, sizeBytes: pdfBuffer.length });

        return { documentId, storagePath };
      }

      /**
       * List documents for a session, optionally filtered by type.
       * Returns document metadata with signed download URLs.
       */
      async getDocuments(sessionId: string, documentType?: DocumentType): Promise<Array<{
        id: string;
        documentType: string;
        filename: string;
        version: number;
        fileSize: number | null;
        createdAt: Date;
        signedUrl: string | null;
      }>> {
        const conditions = [eq(documentArtifacts.sessionId, sessionId)];
        if (documentType) {
          conditions.push(eq(documentArtifacts.documentType, documentType));
        }

        const docs = await db
          .select()
          .from(documentArtifacts)
          .where(and(...conditions))
          .orderBy(desc(documentArtifacts.createdAt));

        // Generate signed URLs in parallel
        const results = await Promise.all(
          docs.map(async (doc) => ({
            id: doc.id,
            documentType: doc.documentType,
            filename: doc.filename,
            version: doc.version,
            fileSize: doc.fileSize,
            createdAt: doc.createdAt,
            signedUrl: await this.createSignedUrl(doc.storagePath),
          }))
        );

        return results;
      }

      /**
       * Close the browser instance. Call during shutdown.
       */
      async close(): Promise<void> {
        if (this.browser) {
          try {
            this.browser.process()?.kill(9);
          } catch {
            // ignore
          }
          this.browser = null;
        }
      }
    }
    ```

    **IMPORTANT implementation notes:**
    - Use `@sparticuz/chromium` as a **dev dependency** import -- it's already in devDependencies in package.json. In dev mode (`NODE_ENV=development`), fall back to local Chrome via `channel: 'chrome'`.
    - The `roomId` on `insertArtifact` for plan PDFs is `undefined` (not passed), which is correct since plan PDFs are session-wide.
    - Use `RenovationPlanSchema.parse()` (not `.safeParse()`) for planData -- let it throw if the data is malformed. The worker catches this.
    - The `products` array on checklist rooms is currently empty. Product recommendations can be joined in a future enhancement.
    - `Handlebars.registerPartial` uses `'print-styles'` (with hyphen) to match the `{{> print-styles}}` syntax in templates.
  </action>
  <acceptance_criteria>
    - `test -f backend/src/services/document.service.ts && echo "exists"` prints "exists"
    - `grep -n "export class DocumentService" backend/src/services/document.service.ts` finds the class
    - `grep -n "generateChecklist" backend/src/services/document.service.ts` finds the method
    - `grep -n "generatePlan" backend/src/services/document.service.ts` finds the method
    - `grep -n "getDocuments" backend/src/services/document.service.ts` finds the method
    - `grep -n "getBrowser" backend/src/services/document.service.ts` finds the browser pool
    - `grep -n "BROWSER_RECYCLE_AFTER" backend/src/services/document.service.ts` finds the recycle constant
    - `grep -n "RenovationPlanSchema.parse" backend/src/services/document.service.ts` finds the runtime validation
    - `grep -n "supabaseAdmin" backend/src/services/document.service.ts` finds the storage upload
    - `cd backend && npx tsc --noEmit` passes with no errors
  </acceptance_criteria>
</task>

</tasks>

<verification>
```bash
cd backend
npx tsc --noEmit                     # Type-check passes
npm run lint                         # No linter errors
test -d src/templates/partials       # Templates directory exists
ls src/templates/*.hbs               # Both templates present
ls src/templates/partials/*.hbs      # print-styles partial present
grep "DocumentService" src/services/document.service.ts  # Class exported
```
</verification>

<success_criteria>
- DocumentService class exported with `generateChecklist`, `generatePlan`, `getDocuments`, `close` methods
- Browser pool pattern with recycle-after-50 implemented
- Handlebars templates compile and produce valid HTML with print CSS
- Supabase Storage upload with graceful fallback when storage not configured
- document_artifacts records created with version tracking
- Runtime validation of planData via RenovationPlanSchema.parse()
- `npx tsc --noEmit` passes in backend
</success_criteria>

<output>
After completion, create `.planning/phases/phase-3-renders-documents/3A-02-SUMMARY.md`
</output>
