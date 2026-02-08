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
        const err = error as Error;
        logger.error('Failed to list sessions', err, {
            userId: req.user?.id,
            errorCode: (err as Error & { code?: string }).code,
        });

        // Surface database connection errors in development for faster debugging
        const isDev = process.env.NODE_ENV === 'development';
        const isAuthError = (err as Error & { code?: string }).code === '28P01';
        const isConnectionError = (err as Error & { code?: string }).code === 'ECONNREFUSED'
            || err.message?.includes('ECONNREFUSED')
            || err.message?.includes('password authentication failed');

        if (isDev && (isAuthError || isConnectionError)) {
            res.status(503).json({
                error: 'Database Connection Failed',
                message: 'Cannot connect to PostgreSQL. Check DATABASE_URL in backend/.env — the password may be incorrect or the database may be unreachable.',
                hint: 'Get the correct connection string from Supabase Dashboard > Settings > Database > Connection String',
            });
        } else {
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Failed to retrieve renovation sessions'
            });
        }
    }
};

/**
 * Create a new renovation session
 */
export const createSession = async (req: Request, res: Response) => {
    const { title, totalBudget } = req.body;

    logger.info('Creating session for user', { userId: req.user?.id, title });

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
        const err = error as Error;
        logger.error('Failed to create session', err, {
            userId: req.user?.id,
            title,
            errorCode: (err as Error & { code?: string }).code,
        });

        // Surface database connection errors in development for faster debugging
        const isDev = process.env.NODE_ENV === 'development';
        const isAuthError = (err as Error & { code?: string }).code === '28P01';
        const isConnectionError = (err as Error & { code?: string }).code === 'ECONNREFUSED'
            || err.message?.includes('ECONNREFUSED')
            || err.message?.includes('password authentication failed');

        if (isDev && (isAuthError || isConnectionError)) {
            res.status(503).json({
                error: 'Database Connection Failed',
                message: 'Cannot connect to PostgreSQL. Check DATABASE_URL in backend/.env — the password may be incorrect or the database may be unreachable.',
                hint: 'Get the correct connection string from Supabase Dashboard > Settings > Database > Connection String',
            });
        } else {
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'Failed to create renovation session'
            });
        }
    }
};
