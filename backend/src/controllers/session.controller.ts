import { Request, Response } from 'express';
import { pool } from '../db/index.js';
import { Logger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/async.js';

const logger = new Logger({ serviceName: 'SessionController' });

/**
 * Health check endpoint
 */
export const healthCheck = (req: Request, res: Response) => {
    logger.info('Health check requested');
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
    });
};

/**
 * List all renovation sessions for the authenticated user
 */
export const listSessions = asyncHandler(async (req: Request, res: Response) => {
    logger.info('Listing sessions for user', { userId: req.user?.id });

    const queryText = req.user?.id
        ? 'SELECT * FROM renovation_sessions WHERE user_id = $1 ORDER BY created_at DESC'
        : 'SELECT * FROM renovation_sessions ORDER BY created_at DESC';
    const params = req.user?.id ? [req.user.id] : [];
    const result = await pool.query(queryText, params);

    res.json({
        sessions: result.rows,
        user: {
            id: req.user?.id,
            email: req.user?.email,
        }
    });
});

/**
 * Get a single renovation session by ID
 */
export const getSession = asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    logger.info('Getting session', { sessionId, userId: req.user?.id });

    const result = await pool.query(
        'SELECT * FROM renovation_sessions WHERE id = $1 LIMIT 1',
        [sessionId]
    );

    const session = result.rows[0];
    if (!session) {
        throw new NotFoundError('Session not found');
    }

    res.json(session);
});

/**
 * Create a new renovation session
 */
export const createSession = asyncHandler(async (req: Request, res: Response) => {
    const { title, totalBudget } = req.body;

    logger.info('Creating session for user', { userId: req.user?.id, title });

    // Check if user has a profile row before setting userId
    // userId FK references profiles.id, but profiles may not exist yet (Phases 1-7)
    let userId: string | null = null;
    if (req.user?.id) {
        const profileResult = await pool.query(
            'SELECT id FROM profiles WHERE id = $1 LIMIT 1',
            [req.user.id]
        );
        userId = profileResult.rows.length > 0 ? req.user.id : null;
    }

    const insertResult = await pool.query(
        'INSERT INTO renovation_sessions (title, total_budget, user_id, phase) VALUES ($1, $2, $3, $4) RETURNING *',
        [title, totalBudget ? String(totalBudget) : '0', userId, 'INTAKE']
    );

    res.status(201).json(insertResult.rows[0]);
});
