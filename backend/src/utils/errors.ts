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

/**
 * EscalationError
 *
 * Thrown by intent classification middleware when high-risk situations detected.
 * Not a real error - used to interrupt agent flow for escalation.
 * Status code 200 because this is an expected control flow, not an error state.
 */
export class EscalationError extends AppError {
  public readonly intent: string;
  public readonly riskLevel: string;
  public readonly explanation: string;

  constructor(data: {
    intent: string;
    riskLevel: string;
    explanation: string;
  }) {
    super(`Escalation required: ${data.intent}`, 200);
    this.intent = data.intent;
    this.riskLevel = data.riskLevel;
    this.explanation = data.explanation;
    this.name = "EscalationError";
  }
}

/**
 * Type guard to check if value is an Error
 * Follows TypeScript type safety best practices
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Safely get error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}