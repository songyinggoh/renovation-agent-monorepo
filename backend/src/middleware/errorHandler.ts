import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'ErrorHandler' });

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  const errorId = randomUUID();

  if (err instanceof AppError) {
    logger.warn('Application error', err, {
      errorId,
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
    });

    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      errorId,
    });
  }

  // Surface database connection errors in development for faster debugging
  const isDev = process.env.NODE_ENV === 'development';
  const dbErr = err as Error & { code?: string };
  const isDbConnectionError =
    dbErr.code === '28P01' ||
    dbErr.code === 'ECONNREFUSED' ||
    dbErr.message?.includes('ECONNREFUSED') ||
    dbErr.message?.includes('password authentication failed');

  if (isDev && isDbConnectionError) {
    logger.error('Database connection error', err, {
      errorId,
      errorCode: dbErr.code,
      path: req.path,
      method: req.method,
    });

    return res.status(503).json({
      success: false,
      error: 'Database Connection Failed',
      message: 'Cannot connect to PostgreSQL. Check DATABASE_URL in backend/.env — the password may be incorrect or the database may be unreachable.',
      hint: 'Get the correct connection string from Supabase Dashboard > Settings > Database > Connection String',
      errorId,
    });
  }

  // Log unexpected errors with tracking ID
  logger.error('Unhandled error', err, {
    errorId,
    path: req.path,
    method: req.method,
  });

  return res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    errorId,
  });
};
