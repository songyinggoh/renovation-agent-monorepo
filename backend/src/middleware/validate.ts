import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Generic Express middleware factory for Zod request body validation.
 * Returns 400 with structured error messages on failure.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = (result.error as ZodError).issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      res.status(400).json({
        error: 'Validation Error',
        details: errors,
      });
      return;
    }

    // Replace body with parsed (and transformed) data
    req.body = result.data;
    next();
  };
}

/**
 * Generic Express middleware factory for Zod query parameter validation.
 * Returns 400 with structured error messages on failure.
 * Replaces req.query with parsed (coerced/transformed) data.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = (result.error as ZodError).issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      res.status(400).json({
        error: 'Validation Error',
        details: errors,
      });
      return;
    }

    req.query = result.data;
    next();
  };
}
