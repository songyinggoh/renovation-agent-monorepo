import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Request, Response, NextFunction } from 'express';

/**
 * Request context stored in AsyncLocalStorage
 *
 * Propagated automatically through async operations within a request.
 * Accessible via getRequestId() from anywhere in the request lifecycle.
 */
interface RequestContext {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request ID from AsyncLocalStorage
 *
 * Returns undefined if called outside a request context (e.g. startup, background tasks)
 */
export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

/**
 * Request ID middleware
 *
 * Generates a unique ID per request (or uses existing X-Request-ID header).
 * Sets X-Request-ID response header for client correlation.
 * Stores in AsyncLocalStorage for automatic propagation to Logger.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  res.setHeader('x-request-id', requestId);

  requestContext.run({ requestId }, () => {
    next();
  });
}
