import { Router } from 'express';
import { listSessions, createSession, healthCheck } from '../controllers/session.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.js';
import { createSessionSchema } from '../validators/session.validators.js';

const router = Router();

/**
 * @route GET /api/sessions/health
 * @desc Health check for the session service
 */
router.get('/health', healthCheck);

// All session routes require authentication
router.use(authMiddleware);

/**
 * @route GET /api/sessions
 * @desc Get all renovation sessions for the authenticated user
 */
router.get('/', listSessions);

/**
 * @route POST /api/sessions
 * @desc Create a new renovation session
 */
router.post('/', validate(createSessionSchema), createSession);

export default router;
