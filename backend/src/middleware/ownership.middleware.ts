import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/index.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'OwnershipMiddleware' });

/**
 * Verify the authenticated user owns the session referenced by :sessionId param.
 *
 * - If the session has a userId, it must match req.user.id
 * - If the session has no userId (anonymous, phases 1-7), access is allowed
 * - Returns 404 if session does not exist (avoids leaking existence)
 */
export const verifySessionOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const sessionId = req.params.sessionId;
  if (!sessionId) {
    next();
    return;
  }

  try {
    const result = await pool.query(
      'SELECT id, user_id FROM renovation_sessions WHERE id = $1 LIMIT 1',
      [sessionId]
    );

    const session = result.rows[0] as { id: string; user_id: string | null } | undefined;

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // If session is owned by a user, verify the requester matches
    if (session.user_id && req.user?.id && session.user_id !== req.user.id) {
      logger.warn('Unauthorized session access attempt', undefined, {
        sessionId,
        ownerId: session.user_id,
        requesterId: req.user.id,
      });
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    next();
  } catch (error) {
    logger.error('Failed to verify session ownership', error as Error, { sessionId });
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Verify the authenticated user owns the room referenced by :roomId param.
 *
 * Looks up the room's parent session and checks ownership.
 * Returns 404 if room does not exist (avoids leaking existence).
 */
export const verifyRoomOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const roomId = req.params.roomId;
  if (!roomId) {
    next();
    return;
  }

  try {
    const result = await pool.query(
      `SELECT r.id, s.user_id
       FROM renovation_rooms r
       JOIN renovation_sessions s ON r.session_id = s.id
       WHERE r.id = $1
       LIMIT 1`,
      [roomId]
    );

    const row = result.rows[0] as { id: string; user_id: string | null } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (row.user_id && req.user?.id && row.user_id !== req.user.id) {
      logger.warn('Unauthorized room access attempt', undefined, {
        roomId,
        ownerId: row.user_id,
        requesterId: req.user.id,
      });
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    next();
  } catch (error) {
    logger.error('Failed to verify room ownership', error as Error, { roomId });
    res.status(500).json({ error: 'Internal server error' });
  }
};
