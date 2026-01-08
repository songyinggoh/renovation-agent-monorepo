import { Request, Response } from 'express';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'SessionController' });

/**
 * Mock data for initial skeleton
 */
const mockSessions = [
    {
        id: '1',
        title: 'Kitchen Renovation',
        phase: 'INTAKE',
        totalBudget: 50000,
        createdAt: new Date().toISOString(),
    },
    {
        id: '2',
        title: 'Living Room Refresh',
        phase: 'PLAN',
        totalBudget: 15000,
        createdAt: new Date().toISOString(),
    }
];

export const listSessions = async (req: Request, res: Response) => {
    logger.info('Listing sessions for user', { userId: req.user?.id });

    // Initially returning dummy data
    res.json({
        sessions: mockSessions,
        user: {
            id: req.user?.id,
            email: req.user?.email,
        }
    });
};

export const createSession = async (req: Request, res: Response) => {
    const { title, totalBudget } = req.body;

    logger.info('Creating session for user', { userId: req.user?.id, title });

    if (!title) {
        return res.status(400).json({ error: 'Title is required' });
    }

    const newSession = {
        id: Math.random().toString(36).substring(7),
        title,
        totalBudget: totalBudget || 0,
        phase: 'INTAKE',
        createdAt: new Date().toISOString(),
    };

    res.status(201).json(newSession);
};
