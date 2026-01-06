import { Request, Response, NextFunction } from 'express';
import { Logger } from './logger.js';

const logger = new Logger({ serviceName: 'AsyncUtils' });

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export const asyncHandler = (fn: AsyncRequestHandler) => (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};


export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  initialDelay: number,
  maxDelay: number,
  operationName = 'operation'
): Promise<T> {
  let attempt = 0;
  const delay = initialDelay;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        logger.error(`[${operationName}] Failed after ${maxRetries} attempts.`, error as Error);
        throw error;
      }
      
      const backoffDelay = Math.min(delay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = backoffDelay * 0.2 * Math.random(); // Add jitter to prevent thundering herd
      const waitTime = Math.round(backoffDelay + jitter);

      logger.warn(`[${operationName}] Attempt ${attempt} failed. Retrying in ${waitTime}ms...`, error as Error);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  // This line should theoretically be unreachable, but typescript needs it.
  throw new Error(`[${operationName}] Operation failed after all retries.`);
}