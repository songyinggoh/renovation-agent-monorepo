import { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { renovationRooms } from '../db/schema/rooms.schema.js';
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
    const [session] = await db
      .select({ id: renovationSessions.id, userId: renovationSessions.userId })
      .from(renovationSessions)
      .where(eq(renovationSessions.id, sessionId))
      .limit(1);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // If session is owned by a user, verify the requester matches
    if (session.userId && req.user?.id && session.userId !== req.user.id) {
      logger.warn('Unauthorized session access attempt', undefined, {
        sessionId,
        ownerId: session.userId,
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
    const [row] = await db
      .select({ id: renovationRooms.id, userId: renovationSessions.userId })
      .from(renovationRooms)
      .innerJoin(renovationSessions, eq(renovationRooms.sessionId, renovationSessions.id))
      .where(eq(renovationRooms.id, roomId))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (row.userId && req.user?.id && row.userId !== req.user.id) {
      logger.warn('Unauthorized room access attempt', undefined, {
        roomId,
        ownerId: row.userId,
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
