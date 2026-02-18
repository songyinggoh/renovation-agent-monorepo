/**
 * Runtime JSONB validation helper.
 *
 * Used at service-layer insert/update boundaries to catch shape
 * mismatches before they reach the database.
 */

import type { ZodSchema, ZodError } from 'zod';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'JsonbValidator' });

/**
 * Validate a JSONB value against a Zod schema.
 *
 * @param schema  - Zod schema to validate against
 * @param data    - The JSONB data to validate
 * @param context - Human-readable context for error messages (e.g. "room_assets.metadata")
 * @returns The validated (and typed) data
 * @throws Error with structured message on validation failure
 */
export function validateJsonb<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context: string,
): T {
  const result = schema.safeParse(data);

  if (result.success) {
    return result.data;
  }

  const error = result.error as ZodError;
  const issues = error.issues.map(
    (i) => `  ${i.path.join('.')}: ${i.message}`
  ).join('\n');

  logger.error('JSONB validation failed', new Error(`Invalid ${context}`), {
    context,
    issues: error.issues,
  });

  throw new Error(`JSONB validation failed for ${context}:\n${issues}`);
}

/**
 * Optionally validate a JSONB value — returns undefined if data is nullish.
 */
export function validateJsonbOptional<T>(
  schema: ZodSchema<T>,
  data: unknown,
  context: string,
): T | undefined {
  if (data === null || data === undefined) {
    return undefined;
  }
  return validateJsonb(schema, data, context);
}
