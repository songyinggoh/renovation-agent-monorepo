import { Request, Response } from 'express';
import { pool } from '../db/index.js';
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

    const result = await pool.query(
        'SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2',
        [sessionId, limit]
    );

    res.json({ messages: result.rows });
});
