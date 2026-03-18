import { Router } from 'express';
import { requestRender, listRenders, approveRender } from '../controllers/render.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { verifyRoomOwnership } from '../middleware/ownership.middleware.js';

const router = Router({ mergeParams: true });

// All render routes support optional authentication (Phases 1-7)
router.use(optionalAuthMiddleware);

/**
 * @route POST /api/rooms/:roomId/renders
 * @desc Request a new AI render for a room
 */
router.post(
  '/rooms/:roomId/renders',
  verifyRoomOwnership,
  requestRender
);

/**
 * @route GET /api/rooms/:roomId/renders
 * @desc List all renders for a room
 */
router.get(
  '/rooms/:roomId/renders',
  verifyRoomOwnership,
  listRenders
);

/**
 * @route PATCH /api/rooms/:roomId/renders/:assetId
 * @desc Update render metadata (approval, caption)
 */
router.patch(
  '/rooms/:roomId/renders/:assetId',
  verifyRoomOwnership,
  approveRender
);

export default router;
