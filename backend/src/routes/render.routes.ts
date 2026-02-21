import { Router } from 'express';
import {
  listRenders,
  requestRender,
  approveRender,
} from '../controllers/render.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { verifyRoomOwnership } from '../middleware/ownership.middleware.js';

const router = Router();

// All render routes support optional authentication (Phases 1-7)
router.use(optionalAuthMiddleware);

/**
 * @route GET /api/rooms/:roomId/renders
 * @desc List all AI renders for a room
 */
router.get('/rooms/:roomId/renders', verifyRoomOwnership, listRenders);

/**
 * @route POST /api/rooms/:roomId/renders
 * @desc Request a new AI render for a room
 */
router.post('/rooms/:roomId/renders', verifyRoomOwnership, requestRender);

/**
 * @route PATCH /api/rooms/:roomId/renders/:assetId
 * @desc Approve or reject a render
 */
router.patch('/rooms/:roomId/renders/:assetId', verifyRoomOwnership, approveRender);

export default router;
