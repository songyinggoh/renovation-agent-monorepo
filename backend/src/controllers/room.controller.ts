import { Request, Response } from 'express';
import { RoomService } from '../services/room.service.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'RoomController' });
const roomService = new RoomService();

/**
 * List all rooms for a session
 * GET /api/sessions/:sessionId/rooms
 */
export const listRooms = async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }
  logger.info('Listing rooms for session', { sessionId });

  try {
    const rooms = await roomService.getRoomsBySession(sessionId);
    res.json({ rooms });
  } catch (error) {
    logger.error('Failed to list rooms', error as Error, { sessionId });
    res.status(500).json({ error: 'Failed to retrieve rooms' });
  }
};

/**
 * Create a room in a session
 * POST /api/sessions/:sessionId/rooms
 */
export const createRoom = async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }
  const { name, type, budget, requirements } = req.body;

  logger.info('Creating room', { sessionId, name, type });

  try {
    const room = await roomService.createRoom({
      sessionId,
      name,
      type,
      budget: budget ? String(budget) : null,
      requirements: requirements ?? null,
    });
    res.status(201).json(room);
  } catch (error) {
    logger.error('Failed to create room', error as Error, { sessionId });
    res.status(500).json({ error: 'Failed to create room' });
  }
};

/**
 * Get a single room by ID
 * GET /api/rooms/:roomId
 */
export const getRoom = async (req: Request, res: Response) => {
  const roomId = req.params.roomId;
  if (!roomId) {
    res.status(400).json({ error: 'roomId is required' });
    return;
  }
  logger.info('Getting room', { roomId });

  try {
    const room = await roomService.getRoomById(roomId);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json(room);
  } catch (error) {
    logger.error('Failed to get room', error as Error, { roomId });
    res.status(500).json({ error: 'Failed to retrieve room' });
  }
};

/**
 * Update a room
 * PATCH /api/rooms/:roomId
 */
export const updateRoom = async (req: Request, res: Response) => {
  const roomId = req.params.roomId;
  if (!roomId) {
    res.status(400).json({ error: 'roomId is required' });
    return;
  }
  const { name, type, budget, requirements } = req.body;

  logger.info('Updating room', { roomId });

  try {
    const updated = await roomService.updateRoom(roomId, {
      name,
      type,
      budget: budget !== undefined ? String(budget) : undefined,
      requirements,
    });
    res.json(updated);
  } catch (error) {
    logger.error('Failed to update room', error as Error, { roomId });
    res.status(500).json({ error: 'Failed to update room' });
  }
};

/**
 * Delete a room
 * DELETE /api/rooms/:roomId
 */
export const deleteRoom = async (req: Request, res: Response) => {
  const roomId = req.params.roomId;
  if (!roomId) {
    res.status(400).json({ error: 'roomId is required' });
    return;
  }
  logger.info('Deleting room', { roomId });

  try {
    await roomService.deleteRoom(roomId);
    res.status(204).send();
  } catch (error) {
    logger.error('Failed to delete room', error as Error, { roomId });
    res.status(500).json({ error: 'Failed to delete room' });
  }
};
