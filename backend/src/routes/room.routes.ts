import { Router } from 'express';
import {
  listRooms,
  createRoom,
  getRoom,
  updateRoom,
  deleteRoom,
} from '../controllers/room.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { verifySessionOwnership, verifyRoomOwnership } from '../middleware/ownership.middleware.js';
import { validate } from '../middleware/validate.js';
import { createRoomSchema, updateRoomSchema } from '../validators/room.validators.js';

const router = Router();

// All room routes support optional authentication (Phases 1-7)
router.use(optionalAuthMiddleware);

/**
 * @route GET /api/sessions/:sessionId/rooms
 * @desc List all rooms for a session
 */
router.get('/sessions/:sessionId/rooms', verifySessionOwnership, listRooms);

/**
 * @route POST /api/sessions/:sessionId/rooms
 * @desc Create a new room in a session
 */
router.post('/sessions/:sessionId/rooms', verifySessionOwnership, validate(createRoomSchema), createRoom);

/**
 * @route GET /api/rooms/:roomId
 * @desc Get a single room by ID
 */
router.get('/rooms/:roomId', verifyRoomOwnership, getRoom);

/**
 * @route PATCH /api/rooms/:roomId
 * @desc Update a room
 */
router.patch('/rooms/:roomId', verifyRoomOwnership, validate(updateRoomSchema), updateRoom);

/**
 * @route DELETE /api/rooms/:roomId
 * @desc Delete a room
 */
router.delete('/rooms/:roomId', verifyRoomOwnership, deleteRoom);

export default router;
