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
