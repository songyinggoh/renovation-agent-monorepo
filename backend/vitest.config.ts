import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['tests/integration/**', 'tests/ai-regression/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/types/**',
        'src/db/schema/**',
        'src/server.ts', // Exclude main server file from coverage
      ],
      thresholds: {
        lines: 50,
        functions: 70,
        branches: 70,
        statements: 50,
      },
    },
  },
});
