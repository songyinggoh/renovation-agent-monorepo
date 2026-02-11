import { Request, Response } from 'express';
import { RoomService } from '../services/room.service.js';
import { Logger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/async.js';

const logger = new Logger({ serviceName: 'RoomController' });
const roomService = new RoomService();

/**
 * List all rooms for a session
 * GET /api/sessions/:sessionId/rooms
 */
export const listRooms = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  logger.info('Listing rooms for session', { sessionId });

  const rooms = await roomService.getRoomsBySession(sessionId);
  res.json({ rooms });
});

/**
 * Create a room in a session
 * POST /api/sessions/:sessionId/rooms
 */
export const createRoom = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { name, type, budget, requirements } = req.body;

  logger.info('Creating room', { sessionId, name, type });

  const room = await roomService.createRoom({
    sessionId,
    name,
    type,
    budget: budget ? String(budget) : null,
    requirements: requirements ?? null,
  });
  res.status(201).json(room);
});

/**
 * Get a single room by ID
 * GET /api/rooms/:roomId
 */
export const getRoom = asyncHandler(async (req: Request, res: Response) => {
  const { roomId } = req.params;
  logger.info('Getting room', { roomId });

  const room = await roomService.getRoomById(roomId);
  if (!room) {
    throw new NotFoundError('Room not found');
  }
  res.json(room);
});

/**
 * Update a room
 * PATCH /api/rooms/:roomId
 */
export const updateRoom = asyncHandler(async (req: Request, res: Response) => {
  const { roomId } = req.params;
  const { name, type, budget, requirements } = req.body;

  logger.info('Updating room', { roomId });

  const updated = await roomService.updateRoom(roomId, {
    name,
    type,
    budget: budget !== undefined ? String(budget) : undefined,
    requirements,
  });
  res.json(updated);
});

/**
 * Delete a room
 * DELETE /api/rooms/:roomId
 */
export const deleteRoom = asyncHandler(async (req: Request, res: Response) => {
  const { roomId } = req.params;
  logger.info('Deleting room', { roomId });

  await roomService.deleteRoom(roomId);
  res.status(204).send();
});
