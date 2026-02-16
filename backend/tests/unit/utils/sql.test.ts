import { describe, it, expect } from 'vitest';
import { escapeLikePattern } from '../../../src/utils/sql.js';

describe('escapeLikePattern', () => {
  it('should escape % characters', () => {
    expect(escapeLikePattern('test%pattern')).toBe('test\\%pattern');
  });

  it('should escape _ characters', () => {
    expect(escapeLikePattern('test_pattern')).toBe('test\\_pattern');
  });

  it('should escape \\ characters', () => {
    expect(escapeLikePattern('test\\pattern')).toBe('test\\\\pattern');
  });

  it('should escape multiple special characters', () => {
    expect(escapeLikePattern('te%st_pa\\ttern')).toBe('te\\%st\\_pa\\\\ttern');
  });

  it('should not escape other characters', () => {
    expect(escapeLikePattern('hello-world')).toBe('hello-world');
  });

  it('should handle empty string', () => {
    expect(escapeLikePattern('')).toBe('');
  });

  it('should handle string with only special characters', () => {
    expect(escapeLikePattern('%_\\')).toBe('\\%\\_\\\\');
  });
});