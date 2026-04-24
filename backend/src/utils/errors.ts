export class AppError extends Error {
  public readonly statusCode: number;
  public readonly cause?: unknown;

  constructor(message: string, statusCode: number, options?: { cause?: unknown }) {
    super(message);
    this.statusCode = statusCode;
    this.cause = options?.cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request') {
    super(message, 400);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Conflict') {
    super(message, 409);
  }
}

