import { Router } from 'express';
import { getMessages } from '../controllers/message.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { verifySessionOwnership } from '../middleware/ownership.middleware.js';

const router = Router();

// All message routes require authentication
router.use(authMiddleware);

/**
 * @route GET /api/sessions/:sessionId/messages
 * @desc Get chat messages for a session
 */
router.get('/:sessionId/messages', verifySessionOwnership, getMessages);

export default router;
