import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'AuthMiddleware' });

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: any; // Replace with proper user type in production
        }
    }
}

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
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

        if (error || !user) {
            logger.error('Supabase auth error', error as Error);
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or expired token',
            });
        }

        req.user = user;
        next();
    } catch (err) {
        logger.error('Unexpected auth middleware error', err as Error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to authenticate request',
        });
    }
};
