import { Request, Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { profiles } from '../db/schema/users.schema.js';
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

    const sessions = await db
        .select()
        .from(renovationSessions)
        .where(req.user?.id ? eq(renovationSessions.userId, req.user.id) : undefined)
        .orderBy(desc(renovationSessions.createdAt));

    res.json({
        sessions,
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

    const [session] = await db
        .select()
        .from(renovationSessions)
        .where(eq(renovationSessions.id, sessionId))
        .limit(1);

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
        const [profile] = await db
            .select({ id: profiles.id })
            .from(profiles)
            .where(eq(profiles.id, req.user.id))
            .limit(1);
        userId = profile ? req.user.id : null;
    }

    const [created] = await db
        .insert(renovationSessions)
        .values({
            title,
            totalBudget: totalBudget ? String(totalBudget) : '0',
            userId,
            phase: 'INTAKE',
        })
        .returning();

    res.status(201).json(created);
});
