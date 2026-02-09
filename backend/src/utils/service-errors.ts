/**
 * Custom error types for service layer
 * Controllers can branch on error type rather than parsing error messages
 */

export class NotFoundError extends Error {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} not found: ${id}` : `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ResourceLimitError extends Error {
  constructor(resource: string, limit: number) {
    super(`Maximum ${resource} limit reached (${limit})`);
    this.name = 'ResourceLimitError';
  }
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Type guard to check if error is a service error
 */
export function isServiceError(error: unknown): error is NotFoundError | ValidationError | ResourceLimitError | StorageError {
  return (
    error instanceof NotFoundError ||
    error instanceof ValidationError ||
    error instanceof ResourceLimitError ||
    error instanceof StorageError
  );
}
