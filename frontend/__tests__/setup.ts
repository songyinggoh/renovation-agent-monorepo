import { afterEach, vi, beforeAll } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Mock crypto.randomUUID if not available
beforeAll(() => {
  if (!global.crypto?.randomUUID) {
    Object.defineProperty(global.crypto, 'randomUUID', {
      value: () => Math.random().toString(36).substring(7),
      writable: true,
    });
  }
});
