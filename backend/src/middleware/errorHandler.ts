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
    const appError = err as AppError;
    logger.warn('Application error', appError, {
      errorId,
      statusCode: appError.statusCode,
      path: req.path,
      method: req.method,
    });

    return res.status(appError.statusCode).json({
      success: false,
      error: appError.message,
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
