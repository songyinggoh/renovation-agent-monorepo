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
  if (err instanceof AppError) {
    const appError = err as AppError;
    logger.warn('Application error', appError, {
      statusCode: appError.statusCode,
      path: req.path,
      method: req.method,
    });

    return res.status(appError.statusCode).json({
      success: false,
      error: appError.message,
    });
  }

  // Log unexpected errors
  logger.error('Unhandled error', err, {
    path: req.path,
    method: req.method,
    body: req.body,
  });

  return res.status(500).json({
    success: false,
    error: 'Internal Server Error',
  });
};
