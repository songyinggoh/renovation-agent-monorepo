import { Request, Response, NextFunction } from 'express';
import { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'AuthMiddleware' });

// Extend Express Request type to include user
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            user?: User;
        }
    }
}

export const verifyToken = async (token: string): Promise<User> => {
    if (!supabaseAdmin) {
        throw new Error('Supabase not configured');
    }
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
        throw error || new Error('Invalid or expired token');
    }

    return user;
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Missing or invalid authorization header',
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const user = await verifyToken(token);
        req.user = user;
        next();
    } catch (err) {
        const error = err as Error;
        if (error.message === 'Supabase not configured') {
            logger.error('Authentication attempted but Supabase is not configured', error);
            return res.status(503).json({
                error: 'Service Unavailable',
                message: 'Authentication service is not configured',
            });
        }

        logger.error('Auth error', error);
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired token',
        });
    }
};
