import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock redis BEFORE importing the module under test
vi.mock('../../../src/config/redis.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

// Mock logger to suppress output and allow assertion
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { isAgentEnabled, disableAgent, enableAgent } from '../../../src/utils/agent-killswitch.js';
import { redis } from '../../../src/config/redis.js';

const mockRedis = vi.mocked(redis);

describe('Agent Kill Switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isAgentEnabled', () => {
    it('returns true when key does not exist (default enabled)', async () => {
      mockRedis.get.mockResolvedValue(null);
      expect(await isAgentEnabled('test-agent')).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith('agent:test-agent:enabled');
    });

    it('returns true when key is "true"', async () => {
      mockRedis.get.mockResolvedValue('true');
      expect(await isAgentEnabled('render-agent')).toBe(true);
    });

    it('returns false when key is "false"', async () => {
      mockRedis.get.mockResolvedValue('false');
      expect(await isAgentEnabled('render-agent')).toBe(false);
    });

    it('returns true (graceful degradation) when Redis fails', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection refused'));
      expect(await isAgentEnabled('render-agent')).toBe(true);
    });
  });

  describe('disableAgent', () => {
    it('sets key to "false" with default 24-hour TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await disableAgent('render-agent');
      expect(mockRedis.set).toHaveBeenCalledWith(
        'agent:render-agent:enabled',
        'false',
        'EX',
        86400,
      );
    });

    it('accepts custom TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await disableAgent('render-agent', 3600);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'agent:render-agent:enabled',
        'false',
        'EX',
        3600,
      );
    });

    it('throws when Redis fails', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis write error'));
      await expect(disableAgent('render-agent')).rejects.toThrow('Redis write error');
    });
  });

  describe('enableAgent', () => {
    it('sets key to "true"', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await enableAgent('render-agent');
      expect(mockRedis.set).toHaveBeenCalledWith('agent:render-agent:enabled', 'true');
    });

    it('throws when Redis fails', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis write error'));
      await expect(enableAgent('render-agent')).rejects.toThrow('Redis write error');
    });
  });
});
