import { Request, Response } from 'express';
import { eq, asc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chatMessages } from '../db/schema/messages.schema.js';
import { Logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/async.js';

const logger = new Logger({ serviceName: 'MessageController' });

/**
 * Get chat messages for a session
 *
 * @route GET /api/sessions/:sessionId/messages
 */
export const getMessages = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    logger.info('Fetching messages for session', {
        sessionId,
        limit,
        userId: req.user?.id,
    });

    const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(asc(chatMessages.createdAt))
        .limit(limit);

    res.json({ messages });
});
