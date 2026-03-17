---
plan: "3A.4"
wave: 3
depends_on: ["3A.1", "3A.2"]
title: "Doc worker (Puppeteer implementation) + REST API routes + app wiring + graceful shutdown"
files_modified:
  - backend/src/workers/doc.worker.ts
  - backend/src/controllers/document.controller.ts
  - backend/src/routes/document.routes.ts
  - backend/src/app.ts
  - backend/src/server.ts
autonomous: true
must_haves:
  truths:
    - "Doc worker processes doc:generate-plan jobs by calling DocumentService"
    - "Worker emits doc:generation_started and doc:generation_complete Socket.io events with sessionId"
    - "Worker uses proactive lock extension every 20s for long-running Puppeteer jobs"
    - "Worker classifies Puppeteer errors into retryable vs permanent (UnrecoverableError)"
    - "POST /api/sessions/:sessionId/documents/generate triggers document generation"
    - "GET /api/sessions/:sessionId/documents lists documents with signed URLs"
    - "GET /api/sessions/:sessionId/documents/:docId/download returns a signed URL"
    - "DocumentService Puppeteer browser pool is closed during graceful shutdown"
    - "GET /api/sessions/:sessionId/documents?type=invalid returns 400, not empty results"
  artifacts:
    - path: "backend/src/workers/doc.worker.ts"
      provides: "Real Puppeteer-based document generation worker"
      contains: "DocumentService"
      exports: ["documentService", "startDocWorker"]
    - path: "backend/src/controllers/document.controller.ts"
      provides: "generateDocument, listDocuments, getDownloadUrl handlers"
      exports: ["generateDocument", "listDocuments", "getDownloadUrl"]
    - path: "backend/src/routes/document.routes.ts"
      provides: "Document REST API routes"
      contains: "router"
    - path: "backend/src/app.ts"
      provides: "Document routes mounted"
      contains: "documentRoutes"
    - path: "backend/src/server.ts"
      provides: "documentService.close() registered in shutdown manager"
      contains: "documentService.close"
  key_links:
    - from: "backend/src/workers/doc.worker.ts"
      to: "backend/src/services/document.service.ts"
      via: "DocumentService.generateChecklist/generatePlan"
      pattern: "documentService"
    - from: "backend/src/workers/doc.worker.ts"
      to: "backend/src/utils/socket-emitter.ts"
      via: "emitToSession for doc:generation_started/complete"
      pattern: "emitToSession"
    - from: "backend/src/controllers/document.controller.ts"
      to: "backend/src/services/document.service.ts"
      via: "DocumentService method calls"
      pattern: "documentService"
    - from: "backend/src/app.ts"
      to: "backend/src/routes/document.routes.ts"
      via: "app.use('/api', documentRoutes)"
      pattern: "documentRoutes"
    - from: "backend/src/server.ts"
      to: "backend/src/workers/doc.worker.ts"
      via: "import documentService, call documentService.close() in shutdown"
      pattern: "documentService\\.close"
---

<objective>
Rewrite the doc worker skeleton with real Puppeteer-based PDF generation (delegating to DocumentService), add proactive lock extension and error classification. Create the REST API (controller + routes) for document generation, listing, and download. Mount routes in app.ts. Register DocumentService browser pool cleanup in server.ts graceful shutdown.

Purpose: This is the final wiring layer. The worker connects BullMQ jobs to DocumentService, and the REST API gives the frontend direct access to document operations. Graceful shutdown prevents Chromium subprocess leaks.

Output: Rewritten worker, new controller and routes, updated app.ts, updated server.ts shutdown.
</objective>

<context>
@backend/src/workers/doc.worker.ts (current skeleton -- will be rewritten)
@backend/src/services/document.service.ts (from Wave 2 -- DocumentService.generateChecklist/generatePlan/getDocuments/close)
@backend/src/utils/socket-emitter.ts (emitToSession pattern)
@backend/src/controllers/render.controller.ts (pattern: Zod validation, asyncHandler, service calls)
@backend/src/routes/render.routes.ts (pattern: Router, optionalAuthMiddleware, verifySessionOwnership)
@backend/src/middleware/ownership.middleware.ts (verifySessionOwnership)
@backend/src/middleware/auth.middleware.ts (optionalAuthMiddleware)
@backend/src/app.ts (route mounting pattern)
@backend/src/server.ts (graceful shutdown pattern -- ShutdownManager, registerResource, existing "Workers & Queues" block)
@backend/src/config/queue.ts (createWorker, withTimeout, WORKER_PROFILES, JobTypes)
@backend/src/validators/job.validators.ts (docGeneratePlanJobSchema -- updated in Wave 1)
@docs/research/PDF_Generation_Pipeline_Research.md (Topic 3: lock extension, error classification, graceful shutdown)
</context>

<tasks>

<task id="3A.4.1" title="Rewrite doc.worker.ts with real Puppeteer implementation">
  <read_first>
    - backend/src/workers/doc.worker.ts -- current skeleton to be replaced
    - backend/src/workers/render.worker.ts -- if it exists, reference its pattern for Socket.io emit + error handling (otherwise use doc.worker.ts skeleton)
    - backend/src/config/queue.ts -- createWorker function signature, withTimeout utility, WORKER_PROFILES['doc:generate-plan']
    - backend/src/utils/socket-emitter.ts -- emitToSession(sessionId, event, data)
    - backend/src/validators/job.validators.ts -- docGeneratePlanJobSchema (updated shape: sessionId, documentType, roomId?)
    - docs/research/PDF_Generation_Pipeline_Research.md -- Topic 3: lock extension pattern, classifyPuppeteerError, graceful shutdown
  </read_first>
  <action>
    Replace the entire contents of `backend/src/workers/doc.worker.ts` with:

    ```typescript
    import { type Job, UnrecoverableError } from 'bullmq';
    import { createWorker, withTimeout, WORKER_PROFILES, type JobTypes } from '../config/queue.js';
    import { emitToSession } from '../utils/socket-emitter.js';
    import { Logger } from '../utils/logger.js';
    import { docGeneratePlanJobSchema } from '../validators/job.validators.js';
    import { DocumentService } from '../services/document.service.js';

    const logger = new Logger({ serviceName: 'DocWorker' });

    type DocJobData = JobTypes['doc:generate-plan'];

    const LOCK_EXTEND_INTERVAL_MS = 20_000;

    /** Singleton DocumentService instance -- reuses browser pool across jobs.
     *  Exported so server.ts can call documentService.close() during graceful shutdown
     *  to kill the Chromium subprocess. */
    export const documentService = new DocumentService();

    /**
     * Classify Puppeteer errors into permanent (UnrecoverableError) vs retryable.
     * Permanent errors will NOT be retried by BullMQ.
     */
    function classifyPuppeteerError(err: Error): never {
      const msg = err.message;

      // Permanent errors -- do not retry
      if (
        msg.includes('ProtocolError') ||
        msg.includes('Target closed') ||
        msg.includes('Session closed') ||
        msg.includes('Page crashed') ||
        msg.includes('No plan data found') ||
        msg.includes('Session not found') ||
        msg.includes('No rooms found') ||
        msg.includes('PDF generation is disabled') ||
        msg.includes('JSONB validation failed')
      ) {
        throw new UnrecoverableError(`Permanent document generation error: ${msg}`);
      }

      // Retryable errors -- let BullMQ retry with exponential backoff
      throw err;
    }

    /**
     * Process a document generation job.
     *
     * 1. Validate job data
     * 2. Emit doc:generation_started
     * 3. Start proactive lock extension (every 20s)
     * 4. Call DocumentService.generateChecklist or generatePlan
     * 5. Emit doc:generation_complete with result
     * 6. Classify errors on failure
     */
    async function processDocJob(job: Job<DocJobData>): Promise<void> {
      // Validate job data
      const parsed = docGeneratePlanJobSchema.safeParse(job.data);
      if (!parsed.success) {
        throw new UnrecoverableError(
          `Invalid job data: ${parsed.error.issues.map(i => i.message).join(', ')}`
        );
      }

      const { sessionId, documentType, roomId } = parsed.data;

      logger.info('Document generation job started', {
        jobId: job.id,
        sessionId,
        documentType,
        roomId,
      });

      // Emit started event
      emitToSession(sessionId, 'doc:generation_started', {
        sessionId,
        documentType,
        roomId,
        jobId: job.id,
      });

      // Proactive lock extension to prevent BullMQ stall detection
      // during long-running Puppeteer page.pdf() calls
      const lockExtender = setInterval(async () => {
        try {
          if (job.token) {
            await job.extendLock(job.token, LOCK_EXTEND_INTERVAL_MS);
          }
        } catch (err) {
          logger.warn('Failed to extend doc job lock', err as Error, { jobId: job.id });
        }
      }, LOCK_EXTEND_INTERVAL_MS);

      try {
        const timeoutMs = WORKER_PROFILES['doc:generate-plan'].timeoutMs;

        let result: { documentId: string; storagePath: string };

        if (documentType === 'checklist_pdf') {
          result = await withTimeout(
            documentService.generateChecklist(sessionId, roomId),
            timeoutMs,
            `checklist PDF for session ${sessionId}`
          );
        } else {
          result = await withTimeout(
            documentService.generatePlan(sessionId),
            timeoutMs,
            `plan PDF for session ${sessionId}`
          );
        }

        // Emit completion event
        emitToSession(sessionId, 'doc:generation_complete', {
          sessionId,
          documentType,
          roomId,
          documentId: result.documentId,
          storagePath: result.storagePath,
        });

        logger.info('Document generation job completed', {
          jobId: job.id,
          sessionId,
          documentType,
          documentId: result.documentId,
        });
      } catch (err) {
        // Emit failure event
        emitToSession(sessionId, 'doc:generation_failed', {
          sessionId,
          documentType,
          roomId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });

        logger.error('Document generation job failed', err as Error, {
          jobId: job.id,
          sessionId,
          documentType,
        });

        classifyPuppeteerError(err as Error);
      } finally {
        clearInterval(lockExtender);
      }
    }

    /**
     * Start the document generation worker.
     * Uses WORKER_PROFILES['doc:generate-plan'] for concurrency, lock duration, rate limiting.
     */
    export function startDocWorker() {
      const worker = createWorker('doc:generate-plan', processDocJob);
      logger.info('Doc worker started');
      return worker;
    }
    ```

    **Key design decisions:**
    - `DocumentService` is instantiated once at module level -- it maintains its own browser pool across jobs.
    - **The `documentService` singleton is `export`ed** so that `server.ts` can import it and call `documentService.close()` during graceful shutdown, killing the Chromium subprocess.
    - Lock extension runs every 20s to prevent BullMQ from marking long-running Puppeteer jobs as stalled.
    - `withTimeout` wraps the PDF generation call using the profile timeout (120s for doc:generate-plan).
    - `classifyPuppeteerError` includes business logic errors ("No plan data found", "Session not found") as permanent -- these won't succeed on retry.
    - Socket.io events include `sessionId` in ALL emits (this fixes a bug from the original skeleton).
    - Three events emitted: `doc:generation_started`, `doc:generation_complete`, `doc:generation_failed`.
  </action>
  <acceptance_criteria>
    - `grep -n "DocumentService" backend/src/workers/doc.worker.ts` finds the import and instantiation
    - `grep -n "export const documentService" backend/src/workers/doc.worker.ts` confirms the singleton is exported
    - `grep -n "classifyPuppeteerError" backend/src/workers/doc.worker.ts` finds the error classifier
    - `grep -n "lockExtender" backend/src/workers/doc.worker.ts` finds the lock extension pattern
    - `grep -n "doc:generation_started" backend/src/workers/doc.worker.ts` finds the started event
    - `grep -n "doc:generation_complete" backend/src/workers/doc.worker.ts` finds the complete event
    - `grep -n "doc:generation_failed" backend/src/workers/doc.worker.ts` finds the failure event
    - `grep -n "withTimeout" backend/src/workers/doc.worker.ts` finds the timeout wrapper
    - `grep -n "UnrecoverableError" backend/src/workers/doc.worker.ts` finds permanent error handling
    - `grep -n "documentType" backend/src/workers/doc.worker.ts` confirms use of new job shape
    - No reference to old `format` field: `grep -c "format" backend/src/workers/doc.worker.ts` returns 0
    - `cd backend && npx tsc --noEmit` passes
  </acceptance_criteria>
</task>

<task id="3A.4.2" title="Create document controller, routes, and mount in app.ts">
  <read_first>
    - backend/src/controllers/render.controller.ts -- pattern: Zod request validation, asyncHandler, service instantiation, response shapes
    - backend/src/routes/render.routes.ts -- pattern: Router(), optionalAuthMiddleware, verifyRoomOwnership/verifySessionOwnership
    - backend/src/middleware/ownership.middleware.ts -- verifySessionOwnership function
    - backend/src/middleware/auth.middleware.ts -- optionalAuthMiddleware
    - backend/src/utils/async.ts -- asyncHandler wrapper
    - backend/src/app.ts -- route mounting pattern (app.use('/api', ...))
  </read_first>
  <action>
    **1. Create `backend/src/controllers/document.controller.ts`:**

    ```typescript
    import { Request, Response } from 'express';
    import { z } from 'zod';
    import { DocumentService } from '../services/document.service.js';
    import { getDocQueue } from '../config/queue.js';
    import { Logger } from '../utils/logger.js';
    import { asyncHandler } from '../utils/async.js';

    const logger = new Logger({ serviceName: 'DocumentController' });
    const documentService = new DocumentService();

    const generateDocumentSchema = z.object({
      documentType: z.enum(['checklist_pdf', 'plan_pdf']),
      roomId: z.string().uuid().optional(),
    });

    /** Zod schema for the optional `type` query parameter on GET /documents.
     *  Returns 400 on invalid values instead of silently returning empty results. */
    const listDocumentsTypeSchema = z.enum(['checklist_pdf', 'plan_pdf']).optional();

    /**
     * Trigger document generation via BullMQ queue.
     * POST /api/sessions/:sessionId/documents/generate
     */
    export const generateDocument = asyncHandler(async (req: Request, res: Response) => {
      const { sessionId } = req.params;

      const parsed = generateDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: 'Validation Error',
          details: parsed.error.issues.map(i => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        });
        return;
      }

      const { documentType, roomId } = parsed.data;

      logger.info('Document generation requested via REST', { sessionId, documentType, roomId });

      const queue = getDocQueue();
      const job = await queue.add('doc:generate', {
        sessionId,
        documentType,
        ...(roomId ? { roomId } : {}),
      });

      res.status(202).json({
        status: 'queued',
        jobId: job.id,
        sessionId,
        documentType,
        message: 'Document generation started. Listen for doc:generation_complete Socket.io event.',
      });
    });

    /**
     * List all documents for a session.
     * GET /api/sessions/:sessionId/documents?type=checklist_pdf|plan_pdf
     *
     * Validates the optional `type` query parameter with Zod.
     * Returns 400 if an invalid type is provided (not silently empty results).
     */
    export const listDocuments = asyncHandler(async (req: Request, res: Response) => {
      const { sessionId } = req.params;

      // Validate optional type query parameter
      const typeParsed = listDocumentsTypeSchema.safeParse(req.query.type || undefined);
      if (!typeParsed.success) {
        res.status(400).json({
          error: 'Validation Error',
          details: typeParsed.error.issues.map(i => ({
            field: 'type',
            message: `Invalid document type. Must be one of: checklist_pdf, plan_pdf`,
          })),
        });
        return;
      }

      const documentType = typeParsed.data;

      logger.info('Listing documents', { sessionId, documentType });

      const documents = await documentService.getDocuments(sessionId, documentType);

      res.json({ documents });
    });

    /**
     * Get a signed download URL for a specific document.
     * GET /api/sessions/:sessionId/documents/:docId/download
     */
    export const getDownloadUrl = asyncHandler(async (req: Request, res: Response) => {
      const { sessionId, docId } = req.params;

      logger.info('Download URL requested', { sessionId, docId });

      // Get all documents and find the one matching docId
      const documents = await documentService.getDocuments(sessionId);
      const doc = documents.find(d => d.id === docId);

      if (!doc) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }

      if (!doc.signedUrl) {
        res.status(503).json({ error: 'Storage not configured. Download URL unavailable.' });
        return;
      }

      res.json({
        documentId: doc.id,
        filename: doc.filename,
        signedUrl: doc.signedUrl,
      });
    });
    ```

    **2. Create `backend/src/routes/document.routes.ts`:**

    ```typescript
    import { Router } from 'express';
    import {
      generateDocument,
      listDocuments,
      getDownloadUrl,
    } from '../controllers/document.controller.js';
    import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
    import { verifySessionOwnership } from '../middleware/ownership.middleware.js';

    const router = Router();

    // All document routes support optional authentication (Phases 1-7)
    router.use(optionalAuthMiddleware);

    /**
     * @route POST /api/sessions/:sessionId/documents/generate
     * @desc Trigger document generation (enqueues BullMQ job)
     */
    router.post(
      '/sessions/:sessionId/documents/generate',
      verifySessionOwnership,
      generateDocument,
    );

    /**
     * @route GET /api/sessions/:sessionId/documents
     * @desc List all documents for a session (with optional type filter)
     */
    router.get(
      '/sessions/:sessionId/documents',
      verifySessionOwnership,
      listDocuments,
    );

    /**
     * @route GET /api/sessions/:sessionId/documents/:docId/download
     * @desc Get a signed download URL for a document
     */
    router.get(
      '/sessions/:sessionId/documents/:docId/download',
      verifySessionOwnership,
      getDownloadUrl,
    );

    export default router;
    ```

    **3. Update `backend/src/app.ts`:**

    Add import (after the existing route imports, e.g., after `renderRoutes`):
    ```typescript
    import documentRoutes from './routes/document.routes.js';
    ```

    Add route mounting (after the `renderRoutes` line `app.use('/api', renderRoutes);`):
    ```typescript
    app.use('/api', documentRoutes);
    ```

    **IMPORTANT:** The route paths in document.routes.ts are `/sessions/:sessionId/documents/...`, and app.ts mounts at `/api`, so the full paths will be `/api/sessions/:sessionId/documents/...`. This follows the same pattern as session and render routes.
  </action>
  <acceptance_criteria>
    - `test -f backend/src/controllers/document.controller.ts && echo "exists"` prints "exists"
    - `test -f backend/src/routes/document.routes.ts && echo "exists"` prints "exists"
    - `grep -n "generateDocument" backend/src/controllers/document.controller.ts` finds the handler
    - `grep -n "listDocuments" backend/src/controllers/document.controller.ts` finds the handler
    - `grep -n "getDownloadUrl" backend/src/controllers/document.controller.ts` finds the handler
    - `grep -n "listDocumentsTypeSchema" backend/src/controllers/document.controller.ts` confirms Zod validation on query type
    - `grep -n "safeParse" backend/src/controllers/document.controller.ts` returns at least 3 matches (generateDocumentSchema, listDocumentsTypeSchema, and the safeParse calls)
    - `grep -n "res.status(400)" backend/src/controllers/document.controller.ts` returns at least 2 matches (body validation + query validation)
    - `grep -n "optionalAuthMiddleware" backend/src/routes/document.routes.ts` confirms auth middleware
    - `grep -n "verifySessionOwnership" backend/src/routes/document.routes.ts` confirms ownership check
    - `grep -n "documentRoutes" backend/src/app.ts` finds the import and mounting
    - `grep -c "app.use('/api'" backend/src/app.ts` returns at least 6 (5 existing + 1 new)
    - `cd backend && npx tsc --noEmit` passes with no errors
    - `cd backend && npm run lint` passes with no errors
  </acceptance_criteria>
</task>

<task id="3A.4.3" title="Register documentService.close() in server.ts graceful shutdown">
  <read_first>
    - backend/src/server.ts -- the existing graceful shutdown setup in `setupGracefulShutdown()` function, specifically the "Workers & Queues" registerResource block (lines ~698-707) and the import for `startDocWorker` (line ~25)
    - backend/src/workers/doc.worker.ts -- the newly-exported `documentService` singleton (from task 3A.4.1)
  </read_first>
  <action>
    **1. Update the import from `doc.worker.ts` in `backend/src/server.ts`:**

    Find the existing import (around line 25):
    ```typescript
    import { startDocWorker } from './workers/doc.worker.js';
    ```

    Change it to also import `documentService`:
    ```typescript
    import { startDocWorker, documentService } from './workers/doc.worker.js';
    ```

    **2. Add a new shutdown resource registration in `setupGracefulShutdown()`:**

    In `backend/src/server.ts`, inside the `setupGracefulShutdown()` function, add a NEW `shutdownManager.registerResource` block for the DocumentService Puppeteer browser pool. Place it BEFORE the "Workers & Queues" block (which closes BullMQ workers) and AFTER the "Render Worker" block. This ensures the Puppeteer browser is killed before the BullMQ worker close attempt, preventing orphaned Chromium processes.

    Add this block after the "Render Worker" registerResource (after line ~696) and before "Other workers + all queues" (line ~698):

    ```typescript
    // DocumentService Puppeteer browser pool cleanup
    // Must close BEFORE BullMQ workers to prevent orphaned Chromium subprocesses
    shutdownManager.registerResource({
      name: 'DocumentService Browser Pool',
      cleanup: async () => {
        await documentService.close();
      },
      timeout: 10_000, // 10s for Puppeteer browser.close() + process kill
    });
    ```

    **Why this placement matters:** The existing "Workers & Queues" block calls `docWorker.close()` which only closes the BullMQ worker connection. The `documentService.close()` call kills the actual Chromium subprocess that Puppeteer launched. Without this, `docWorker.close()` finishes but Chromium keeps running as an orphaned process.

    **Why 10s timeout:** Puppeteer's `browser.close()` is usually fast (~1s), but DocumentService.close() also calls `browser.process()?.kill(9)` as a fallback, which needs a brief window.
  </action>
  <acceptance_criteria>
    - `grep -n "documentService" backend/src/server.ts` finds the import and the shutdown registration
    - `grep -n "import.*documentService.*from.*doc.worker" backend/src/server.ts` confirms the named import
    - `grep -n "documentService.close" backend/src/server.ts` confirms close() is called in shutdown
    - `grep -n "DocumentService Browser Pool" backend/src/server.ts` confirms the resource name
    - `cd backend && npx tsc --noEmit` passes with no errors
  </acceptance_criteria>
</task>

</tasks>

<verification>
```bash
cd backend
npx tsc --noEmit           # Type-check passes
npm run lint               # No linter errors
npm run prep               # lint + build passes (full compilation)

# Verify route mounting
grep "documentRoutes" src/app.ts

# Verify worker has real implementation (not no-op)
grep "DocumentService" src/workers/doc.worker.ts
grep -v "no-op" src/workers/doc.worker.ts | grep "processDocJob" | head -1

# Verify all Socket.io emits include sessionId
grep "emitToSession" src/workers/doc.worker.ts

# Verify documentService is exported for shutdown
grep "export const documentService" src/workers/doc.worker.ts

# Verify graceful shutdown includes browser pool cleanup
grep "documentService.close" src/server.ts

# Verify Zod validation on listDocuments query type
grep "listDocumentsTypeSchema" src/controllers/document.controller.ts
```
</verification>

<success_criteria>
- Doc worker delegates to DocumentService.generateChecklist/generatePlan based on documentType
- Worker emits doc:generation_started, doc:generation_complete, doc:generation_failed with sessionId
- Worker uses proactive lock extension every 20s
- Worker classifies permanent vs retryable errors (UnrecoverableError for business errors + Puppeteer crashes)
- Worker exports `documentService` singleton so server.ts can close the browser pool
- REST API: POST /api/sessions/:sessionId/documents/generate enqueues job (202 response)
- REST API: GET /api/sessions/:sessionId/documents lists docs with signed URLs
- REST API: GET /api/sessions/:sessionId/documents?type=invalid returns 400 (not empty results)
- REST API: GET /api/sessions/:sessionId/documents/:docId/download returns signed URL
- All routes use optionalAuthMiddleware + verifySessionOwnership
- Document routes mounted in app.ts
- DocumentService.close() registered in server.ts graceful shutdown (kills Chromium subprocess)
- `npm run prep` passes (lint + build)
</success_criteria>

<output>
After completion, create `.planning/phases/phase-3-renders-documents/3A-04-SUMMARY.md`
</output>
