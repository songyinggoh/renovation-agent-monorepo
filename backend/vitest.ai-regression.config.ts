import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/ai-regression/**/*.test.ts'],
    testTimeout: 60_000, // AI calls may take up to 60s
    hookTimeout: 30_000,
    setupFiles: ['./tests/ai-regression/setup.ts'],
    // Run sequentially to avoid Gemini rate limits
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
