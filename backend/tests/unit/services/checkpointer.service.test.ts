import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';

// Mock env config before importing checkpointer service
const mockEnv = {
  LANGGRAPH_CHECKPOINTER: 'memory' as 'memory' | 'postgres',
};

vi.mock('../../../src/config/env.js', () => ({
  env: {
    get LANGGRAPH_CHECKPOINTER() {
      return mockEnv.LANGGRAPH_CHECKPOINTER;
    },
  },
  isPostgresCheckpointerEnabled: () => mockEnv.LANGGRAPH_CHECKPOINTER === 'postgres',
}));

// Mock database pool
vi.mock('../../../src/db/index.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

// Mock PostgresSaver - use inline mock to avoid hoisting issues
vi.mock('@langchain/langgraph-checkpoint-postgres', () => {
  const mockSetup = vi.fn().mockResolvedValue(undefined);
  return {
    PostgresSaver: vi.fn().mockImplementation(() => ({
      setup: mockSetup,
    })),
  };
});

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('CheckpointerService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset to default state
    mockEnv.LANGGRAPH_CHECKPOINTER = 'memory';
    // Reset module to clear singleton
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('getCheckpointer', () => {
    it('should return MemorySaver when env is "memory"', async () => {
      mockEnv.LANGGRAPH_CHECKPOINTER = 'memory';

      // Dynamic import to get fresh module with reset singleton
      const { getCheckpointer, cleanupCheckpointer } = await import(
        '../../../src/services/checkpointer.service.js'
      );
      await cleanupCheckpointer();

      const checkpointer = getCheckpointer();

      expect(checkpointer).toBeInstanceOf(MemorySaver);
    });

    it('should return same instance on subsequent calls (singleton)', async () => {
      mockEnv.LANGGRAPH_CHECKPOINTER = 'memory';

      const { getCheckpointer, cleanupCheckpointer } = await import(
        '../../../src/services/checkpointer.service.js'
      );
      await cleanupCheckpointer();

      const first = getCheckpointer();
      const second = getCheckpointer();

      expect(first).toBe(second);
    });
  });

  describe('initializeCheckpointer', () => {
    it('should initialize without errors for MemorySaver', async () => {
      mockEnv.LANGGRAPH_CHECKPOINTER = 'memory';

      const { getCheckpointer, initializeCheckpointer, cleanupCheckpointer } = await import(
        '../../../src/services/checkpointer.service.js'
      );
      await cleanupCheckpointer();

      // Get checkpointer first
      getCheckpointer();

      // Should not throw
      await expect(initializeCheckpointer()).resolves.toBeUndefined();
    });

    it('should be ready after initialization with MemorySaver', async () => {
      mockEnv.LANGGRAPH_CHECKPOINTER = 'memory';

      const { getCheckpointer, initializeCheckpointer, isCheckpointerReady, cleanupCheckpointer } =
        await import('../../../src/services/checkpointer.service.js');
      await cleanupCheckpointer();

      // Get checkpointer to create instance
      getCheckpointer();
      await initializeCheckpointer();

      expect(isCheckpointerReady()).toBe(true);
    });
  });

  describe('cleanupCheckpointer', () => {
    it('should reset singleton after cleanup', async () => {
      mockEnv.LANGGRAPH_CHECKPOINTER = 'memory';

      const { getCheckpointer, cleanupCheckpointer } = await import(
        '../../../src/services/checkpointer.service.js'
      );
      await cleanupCheckpointer();

      const first = getCheckpointer();
      await cleanupCheckpointer();
      const second = getCheckpointer();

      // After cleanup, a new instance should be created
      expect(first).not.toBe(second);
    });

    it('should report not ready after cleanup', async () => {
      mockEnv.LANGGRAPH_CHECKPOINTER = 'memory';

      const { getCheckpointer, initializeCheckpointer, isCheckpointerReady, cleanupCheckpointer } =
        await import('../../../src/services/checkpointer.service.js');
      await cleanupCheckpointer();

      getCheckpointer();
      await initializeCheckpointer();
      expect(isCheckpointerReady()).toBe(true);

      await cleanupCheckpointer();
      expect(isCheckpointerReady()).toBe(false);
    });
  });

  describe('isCheckpointerReady', () => {
    it('should return false before getCheckpointer is called', async () => {
      mockEnv.LANGGRAPH_CHECKPOINTER = 'memory';

      const { isCheckpointerReady, cleanupCheckpointer } = await import(
        '../../../src/services/checkpointer.service.js'
      );
      await cleanupCheckpointer();

      expect(isCheckpointerReady()).toBe(false);
    });

    it('should return true after MemorySaver is created', async () => {
      mockEnv.LANGGRAPH_CHECKPOINTER = 'memory';

      const { getCheckpointer, isCheckpointerReady, cleanupCheckpointer } = await import(
        '../../../src/services/checkpointer.service.js'
      );
      await cleanupCheckpointer();

      getCheckpointer();

      expect(isCheckpointerReady()).toBe(true);
    });
  });

  describe('getCheckpointerStatus', () => {
    it('should return correct status for MemorySaver', async () => {
      mockEnv.LANGGRAPH_CHECKPOINTER = 'memory';

      const { getCheckpointer, initializeCheckpointer, getCheckpointerStatus, cleanupCheckpointer } =
        await import('../../../src/services/checkpointer.service.js');
      await cleanupCheckpointer();

      const statusBefore = getCheckpointerStatus();
      expect(statusBefore).toEqual({
        type: 'memory',
        ready: false,
        setupComplete: false,
      });

      getCheckpointer();
      await initializeCheckpointer();

      const statusAfter = getCheckpointerStatus();
      expect(statusAfter).toEqual({
        type: 'memory',
        ready: true,
        setupComplete: false,
      });
    });
  });
});
