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
  const job = await queue.add('doc:generate-plan', {
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
      details: typeParsed.error.issues.map(() => ({
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
