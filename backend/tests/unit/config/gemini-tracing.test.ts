import { describe, it, expect, vi } from 'vitest';
import { getModelTraceAttributes } from '../../../src/config/gemini.js';

// Mock env to avoid requiring GOOGLE_API_KEY
vi.mock('../../../src/config/env.js', () => ({
  env: { GOOGLE_API_KEY: 'test-key' },
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('getModelTraceAttributes', () => {
  it('should return correct attributes for gemini-2.5-flash', () => {
    const attrs = getModelTraceAttributes('gemini-2.5-flash', 0.7);
    expect(attrs).toEqual({
      'ai.system': 'gemini',
      'ai.model': 'gemini-2.5-flash',
      'ai.temperature': 0.7,
    });
  });

  it('should return correct attributes for gemini-1.5-pro', () => {
    const attrs = getModelTraceAttributes('gemini-1.5-pro', 0.3);
    expect(attrs).toEqual({
      'ai.system': 'gemini',
      'ai.model': 'gemini-1.5-pro',
      'ai.temperature': 0.3,
    });
  });

  it('should handle zero temperature', () => {
    const attrs = getModelTraceAttributes('gemini-2.5-flash', 0);
    expect(attrs['ai.temperature']).toBe(0);
  });
});
