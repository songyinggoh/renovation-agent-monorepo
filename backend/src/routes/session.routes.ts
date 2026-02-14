import { Router } from 'express';
import { listSessions, getSession, createSession, healthCheck } from '../controllers/session.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { verifySessionOwnership } from '../middleware/ownership.middleware.js';
import { validate } from '../middleware/validate.js';
import { createSessionSchema } from '../validators/session.validators.js';

const router = Router();

/**
 * @route GET /api/sessions/health
 * @desc Health check for the session service
 */
router.get('/health', healthCheck);

// All session routes support optional authentication (Phases 1-7)
// When Supabase is not configured, sessions can be created anonymously
router.use(optionalAuthMiddleware);

/**
 * @route GET /api/sessions
 * @desc Get all renovation sessions for the authenticated user
 */
router.get('/', listSessions);

/**
 * @route GET /api/sessions/:sessionId
 * @desc Get a single renovation session by ID
 */
router.get('/:sessionId', verifySessionOwnership, getSession);

/**
 * @route POST /api/sessions
 * @desc Create a new renovation session
 */
router.post('/', validate(createSessionSchema), createSession);

export default router;
