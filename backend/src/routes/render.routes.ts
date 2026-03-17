import { Router } from 'express';
import { listRenders, requestRender, approveRender } from '../controllers/render.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { verifySessionOwnership, verifyRoomOwnership } from '../middleware/ownership.middleware.js';

const router = Router({ mergeParams: true });

// All render routes support optional authentication (Phases 1-7)
router.use(optionalAuthMiddleware);

/**
 * @route GET /api/sessions/:sessionId/rooms/:roomId/renders
 * @desc List all renders for a room
 */
router.get(
  '/:sessionId/rooms/:roomId/renders',
  verifySessionOwnership,
  verifyRoomOwnership,
  listRenders
);

/**
 * @route POST /api/sessions/:sessionId/rooms/:roomId/renders
 * @desc Request a new AI render for a room
 */
router.post(
  '/:sessionId/rooms/:roomId/renders',
  verifySessionOwnership,
  verifyRoomOwnership,
  requestRender
);

/**
 * @route PATCH /api/sessions/:sessionId/rooms/:roomId/renders/:assetId
 * @desc Approve or reject a render
 */
router.patch(
  '/:sessionId/rooms/:roomId/renders/:assetId',
  verifySessionOwnership,
  verifyRoomOwnership,
  approveRender
);

export default router;
