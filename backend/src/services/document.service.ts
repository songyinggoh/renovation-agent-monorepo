import chromium from '@sparticuz/chromium';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { join } from 'path';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { renovationRooms } from '../db/schema/rooms.schema.js';
import {
  documentArtifacts,
  type DocumentType,
  type NewDocumentArtifact,
} from '../db/schema/document-artifacts.schema.js';
import { RenovationPlanSchema } from '../db/jsonb-schemas.js';
import { env, isStorageEnabled, isPdfEnabled } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { Logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

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

// Compile templates once at module load
const checklistTemplate = Handlebars.compile(
  readFileSync(join(TEMPLATE_DIR, 'checklist.hbs'), 'utf8')
);
const planTemplate = Handlebars.compile(
  readFileSync(join(TEMPLATE_DIR, 'renovation-plan.hbs'), 'utf8')
);

// Configure @sparticuz/chromium once at module load
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

// ── Currency / date helpers for template data ─────────────────────────────────

function fmtCurrency(value: number | string | null | undefined): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num == null || isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function fmtDate(date?: Date | string | null): string {
  const d = date ? new Date(date) : new Date();
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(d);
}

// ── DocumentService ───────────────────────────────────────────────────────────

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
  private async uploadPdf(
    sessionId: string,
    documentType: DocumentType,
    pdfBuffer: Buffer
  ): Promise<string> {
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
      logger.warn('Storage not configured - PDF saved to DB record only', undefined, {
        sessionId,
        documentType,
      });
    }

    return storagePath;
  }

  /** Create a signed download URL for a storage path */
  private async createSignedUrl(
    storagePath: string,
    expiresInSeconds = 86_400
  ): Promise<string | null> {
    if (!isStorageEnabled() || !supabaseAdmin) return null;
    const { data, error } = await supabaseAdmin.storage
      .from(env.SUPABASE_DOCUMENTS_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data?.signedUrl) {
      logger.warn('Failed to create signed URL', undefined, {
        storagePath,
        error: error?.message,
      });
      return null;
    }
    return data.signedUrl;
  }

  /** Get the next version number for a document type in a session */
  private async getNextVersion(
    sessionId: string,
    documentType: DocumentType
  ): Promise<{ version: number; previousVersionId: string | null }> {
    const [latest] = await db
      .select({ id: documentArtifacts.id, version: documentArtifacts.version })
      .from(documentArtifacts)
      .where(
        and(
          eq(documentArtifacts.sessionId, sessionId),
          eq(documentArtifacts.documentType, documentType)
        )
      )
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

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Generate a checklist PDF for a session (optionally scoped to a room).
   * Queries renovation_rooms.checklist + product_recommendations, renders template, Puppeteer PDF, uploads, inserts artifact.
   */
  async generateChecklist(
    sessionId: string,
    roomId?: string
  ): Promise<{ documentId: string; storagePath: string }> {
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
      ? db
          .select()
          .from(renovationRooms)
          .where(
            and(eq(renovationRooms.sessionId, sessionId), eq(renovationRooms.id, roomId))
          )
      : db.select().from(renovationRooms).where(eq(renovationRooms.sessionId, sessionId));
    const rooms = await roomQuery;

    if (rooms.length === 0) {
      throw new NotFoundError('No rooms found for this session');
    }

    // Build template data
    const templateRooms = rooms.map((room) => {
      const checklist = Array.isArray(room.checklist)
        ? (room.checklist as Array<Record<string, unknown>>)
        : [];
      return {
        name: room.name,
        type: room.type,
        budget: room.budget ? fmtCurrency(room.budget) : null,
        checklist: checklist.map((item) => ({
          id: String(item['id'] ?? ''),
          category: String(item['category'] ?? 'general'),
          description: String(item['description'] ?? ''),
          priority: String(item['priority'] ?? 'medium') as 'must-have' | 'nice-to-have' | 'optional',
          estimatedBudget: item['estimatedBudget']
            ? fmtCurrency(Number(item['estimatedBudget']))
            : undefined,
          completed: Boolean(item['completed']),
        })),
        products: [] as Array<{ name: string; category: string; price: string }>,
      };
    });

    const allItems = templateRooms.flatMap((r) => r.checklist);

    const html = checklistTemplate({
      sessionTitle: session.title,
      generatedAt: fmtDate(),
      rooms: templateRooms,
      totalItems: allItems.length,
      completedItems: allItems.filter((i) => i.completed).length,
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

    logger.info('Checklist PDF generated', {
      sessionId,
      documentId,
      version,
      sizeBytes: pdfBuffer.length,
    });

    return { documentId, storagePath };
  }

  /**
   * Generate a renovation plan PDF from sessions.planData.
   * Validates planData via RenovationPlanSchema, renders template, Puppeteer PDF, uploads, inserts artifact.
   */
  async generatePlan(
    sessionId: string
  ): Promise<{ documentId: string; storagePath: string }> {
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
    if (!session.planData)
      throw new BadRequestError(
        'No plan data found. The agent must call save_plan_state first.'
      );

    // Runtime validation of planData - let it throw if malformed (worker catches this)
    const plan = RenovationPlanSchema.parse(session.planData);

    const html = planTemplate({
      sessionTitle: session.title,
      generatedAt: fmtDate(),
      plan: {
        summary: plan.summary,
        totalBudget: fmtCurrency(plan.totalBudget),
        totalDays: plan.totalDays,
        startDate: plan.startDate,
        rooms: plan.rooms.map((room) => ({
          roomName: room.roomName,
          estimatedCost: fmtCurrency(room.estimatedCost),
          estimatedDays: room.estimatedDays,
          tasks: room.tasks.map((task) => ({
            description: task.description,
            estimatedCost: fmtCurrency(task.estimatedCost),
            duration: task.duration,
            tradeCategory: task.tradeCategory,
            priority: task.priority,
          })),
        })),
        contractors: plan.contractors.map((c) => ({
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

    logger.info('Plan PDF generated', {
      sessionId,
      documentId,
      version,
      sizeBytes: pdfBuffer.length,
    });

    return { documentId, storagePath };
  }

  /**
   * List documents for a session, optionally filtered by type.
   * Returns document metadata with signed download URLs.
   */
  async getDocuments(
    sessionId: string,
    documentType?: DocumentType
  ): Promise<
    Array<{
      id: string;
      documentType: string;
      filename: string;
      version: number;
      fileSize: number | null;
      createdAt: Date;
      signedUrl: string | null;
    }>
  > {
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
