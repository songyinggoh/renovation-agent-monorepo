/**
 * Setup file for AI regression smoke tests.
 *
 * Sets required env vars BEFORE any backend module is imported,
 * so that config/env.ts Zod validation passes at import time.
 * GOOGLE_API_KEY must be provided by CI (secrets.GOOGLE_API_KEY_TEST).
 */

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.OTEL_ENABLED = 'false';

if (!process.env.GOOGLE_API_KEY) {
  // Provide a stub so env.ts Zod validation passes at import time.
  // The test file checks isRealKey and skips when the key is a stub.
  process.env.GOOGLE_API_KEY = 'test-key';
  console.warn(
    'GOOGLE_API_KEY not set — AI regression tests will be skipped.\n' +
      'Set GOOGLE_API_KEY to a valid Gemini key to run these tests.',
  );
}
