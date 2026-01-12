import { Request, Response } from 'express';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { eq, desc } from 'drizzle-orm';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'SessionController' });

/**
 * List all renovation sessions for the authenticated user
 */
export const listSessions = async (req: Request, res: Response) => {
    logger.info('Listing sessions for user', { userId: req.user?.id });

    try {
        // Query sessions for the current user
        // We filter by userId if it exists. Note: in early phases userId might be null for anonymous sessions.
        const sessions = await db.query.renovationSessions.findMany({
            where: req.user?.id ? eq(renovationSessions.userId, req.user.id) : undefined,
            orderBy: [desc(renovationSessions.createdAt)],
        });

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
        const [newSession] = await db.insert(renovationSessions).values({
            title,
            totalBudget: totalBudget ? String(totalBudget) : '0',
            userId: req.user?.id || null,
            phase: 'INTAKE',
        }).returning();

        res.status(201).json(newSession);
    } catch (error) {
        logger.error('Failed to create session', error as Error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to create renovation session'
        });
    }
};
