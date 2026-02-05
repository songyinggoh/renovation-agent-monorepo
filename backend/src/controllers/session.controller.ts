import { Request, Response } from 'express';
import { pool } from '../db/index.js';
import { Logger } from '../utils/logger.js';

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
export const listSessions = async (req: Request, res: Response) => {
    logger.info('Listing sessions for user', { userId: req.user?.id });

    try {
        // Use raw SQL via pool to avoid Drizzle prepared statement issues with PgBouncer
        const queryText = req.user?.id
            ? 'SELECT * FROM renovation_sessions WHERE user_id = $1 ORDER BY created_at DESC'
            : 'SELECT * FROM renovation_sessions ORDER BY created_at DESC';
        const params = req.user?.id ? [req.user.id] : [];
        const result = await pool.query(queryText, params);
        const sessions = result.rows;

        res.json({
            sessions,
            user: {
                id: req.user?.id,
                email: req.user?.email,
            }
        });
    } catch (error) {
        logger.error('Failed to list sessions', error as Error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to retrieve renovation sessions'
        });
    }
};

/**
 * Create a new renovation session
 */
export const createSession = async (req: Request, res: Response) => {
    const { title, totalBudget } = req.body;

    logger.info('Creating session for user', { userId: req.user?.id, title });

    if (!title) {
        return res.status(400).json({ error: 'Title is required' });
    }

    try {
        // Check if user has a profile row before setting userId
        // userId FK references profiles.id, but profiles may not exist yet (Phases 1-7)
        // Use raw SQL via pool to avoid Drizzle prepared statement issues with PgBouncer
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
        const newSession = insertResult.rows[0];

        res.status(201).json(newSession);
    } catch (error) {
        logger.error('Failed to create session', error as Error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to create renovation session'
        });
    }
};
