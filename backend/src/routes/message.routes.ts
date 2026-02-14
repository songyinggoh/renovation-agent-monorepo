import { Router } from 'express';
import { getMessages } from '../controllers/message.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { verifySessionOwnership } from '../middleware/ownership.middleware.js';

const router = Router();

// All message routes support optional authentication (Phases 1-7)
router.use(optionalAuthMiddleware);

/**
 * @route GET /api/sessions/:sessionId/messages
 * @desc Get chat messages for a session
 */
router.get('/:sessionId/messages', verifySessionOwnership, getMessages);

export default router;
