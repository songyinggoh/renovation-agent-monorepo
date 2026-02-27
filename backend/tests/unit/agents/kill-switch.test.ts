import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis client
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  eval: vi.fn(),
  status: 'ready',
};

vi.mock('../../../src/config/redis.js', () => ({
  redis: mockRedis,
}));

describe('kill-switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.status = 'ready';
  });

  describe('isPhaseEnabled', () => {
    it('should return true when no kill switch key exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      const { isPhaseEnabled } = await import('../../../src/agents/kill-switch.js');
      expect(await isPhaseEnabled('INTAKE')).toBe(true);
    });

    it('should return false when kill switch key is "disabled"', async () => {
      mockRedis.get.mockResolvedValue('disabled');
      const { isPhaseEnabled } = await import('../../../src/agents/kill-switch.js');
      expect(await isPhaseEnabled('INTAKE')).toBe(false);
    });

    it('should return true (fail open) when Redis is unavailable', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis down'));
      const { isPhaseEnabled } = await import('../../../src/agents/kill-switch.js');
      expect(await isPhaseEnabled('INTAKE')).toBe(true);
    });
  });

  describe('checkCircuitBreaker', () => {
    it('should allow calls under the limit', async () => {
      mockRedis.eval.mockResolvedValue(1);
      const { checkCircuitBreaker } = await import('../../../src/agents/kill-switch.js');
      const allowed = await checkCircuitBreaker('INTAKE', 'save_intake_state', { maxCalls: 5, windowSeconds: 60 });
      expect(allowed).toBe(true);
    });

    it('should block calls at the limit', async () => {
      mockRedis.eval.mockResolvedValue(6);
      const { checkCircuitBreaker } = await import('../../../src/agents/kill-switch.js');
      const allowed = await checkCircuitBreaker('INTAKE', 'save_intake_state', { maxCalls: 5, windowSeconds: 60 });
      expect(allowed).toBe(false);
    });

    it('should use atomic Lua script with correct key and TTL', async () => {
      mockRedis.eval.mockResolvedValue(1);
      const { checkCircuitBreaker } = await import('../../../src/agents/kill-switch.js');
      await checkCircuitBreaker('INTAKE', 'save_intake_state', { maxCalls: 5, windowSeconds: 60 });
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('INCR'),
        1,
        'cb:INTAKE:save_intake_state',
        60,
      );
    });

    it('should allow at exactly the limit', async () => {
      mockRedis.eval.mockResolvedValue(5);
      const { checkCircuitBreaker } = await import('../../../src/agents/kill-switch.js');
      const allowed = await checkCircuitBreaker('INTAKE', 'save_intake_state', { maxCalls: 5, windowSeconds: 60 });
      expect(allowed).toBe(true);
    });

    it('should allow (fail open) when Redis is unavailable', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis down'));
      const { checkCircuitBreaker } = await import('../../../src/agents/kill-switch.js');
      const allowed = await checkCircuitBreaker('INTAKE', 'save_intake_state', { maxCalls: 5, windowSeconds: 60 });
      expect(allowed).toBe(true);
    });
  });
});
