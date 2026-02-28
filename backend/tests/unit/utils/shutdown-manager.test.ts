import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Server } from 'http';
import {
  ShutdownManager,
  type CleanupResource,
} from '../../../src/utils/shutdown-manager.js';

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// ── Helpers ──────────────────────────────────────────────────

function makeLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as import('../../../src/utils/logger.js').Logger;
}

function createMockServer(closeErr?: Error) {
  return {
    close: vi.fn((cb: (err?: Error) => void) => {
      if (closeErr) cb(closeErr);
      else cb();
    }),
  } as unknown as Server;
}

/**
 * Trigger a shutdown via the private method using Reflect/prototype access.
 * This gives us an awaitable promise, unlike process signal emission.
 */
async function triggerShutdown(
  manager: ShutdownManager,
  signal = 'SIGTERM',
): Promise<void> {
  // Access private shutdown method via bracket notation
  await (manager as unknown as Record<string, (s: string) => Promise<void>>)[
    'shutdown'
  ](signal);
}

describe('ShutdownManager', () => {
  let server: Server;
  let logger: ReturnType<typeof makeLogger>;
  let manager: ShutdownManager;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    server = createMockServer();
    logger = makeLogger();
    manager = new ShutdownManager(server, { timeout: 10_000, logger });

    // Mock process.exit to NOT actually exit (just record calls)
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(
      (() => {}) as unknown as (code?: number) => never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    exitSpy.mockRestore();
  });

  // ── Resource registration ──────────────────────────────────

  describe('registerResource', () => {
    it('should register a resource and log it', () => {
      const resource: CleanupResource = {
        name: 'Database',
        cleanup: vi.fn().mockResolvedValue(undefined),
        timeout: 5000,
      };

      manager.registerResource(resource);

      expect(logger.info).toHaveBeenCalledWith(
        'Resource registered for shutdown',
        expect.objectContaining({ resourceName: 'Database', timeout: 5000 }),
      );
    });

    it('should register multiple resources', () => {
      manager.registerResource({
        name: 'Database',
        cleanup: vi.fn().mockResolvedValue(undefined),
        timeout: 5000,
      });
      manager.registerResource({
        name: 'Redis',
        cleanup: vi.fn().mockResolvedValue(undefined),
        timeout: 3000,
      });

      expect(logger.info).toHaveBeenCalledTimes(2);
    });
  });

  // ── Signal handlers ────────────────────────────────────────

  describe('registerSignalHandlers', () => {
    it('should register handlers for SIGTERM, SIGINT, SIGQUIT', () => {
      const onSpy = vi.spyOn(process, 'on');

      manager.registerSignalHandlers();

      expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(onSpy).toHaveBeenCalledWith('SIGQUIT', expect.any(Function));

      onSpy.mockRestore();
    });
  });

  // ── Shutdown behavior ──────────────────────────────────────

  describe('shutdown', () => {
    it('should close the HTTP server', async () => {
      await triggerShutdown(manager);

      expect(server.close).toHaveBeenCalledTimes(1);
    });

    it('should call process.exit(0) after successful shutdown', async () => {
      await triggerShutdown(manager);

      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should be idempotent — second call is ignored', async () => {
      await triggerShutdown(manager, 'SIGTERM');

      exitSpy.mockClear();
      (server.close as ReturnType<typeof vi.fn>).mockClear();

      await triggerShutdown(manager, 'SIGINT');

      expect(server.close).not.toHaveBeenCalled();
      expect(exitSpy).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Shutdown already in progress, ignoring duplicate signal',
        undefined,
        expect.objectContaining({ signal: 'SIGINT' }),
      );
    });

    it('should cleanup registered resources in registration order', async () => {
      const order: string[] = [];

      manager.registerResource({
        name: 'First',
        cleanup: vi.fn(async () => { order.push('First'); }),
        timeout: 5000,
      });
      manager.registerResource({
        name: 'Second',
        cleanup: vi.fn(async () => { order.push('Second'); }),
        timeout: 5000,
      });

      await triggerShutdown(manager);

      expect(order).toEqual(['First', 'Second']);
    });

    it('should continue cleaning other resources when one fails', async () => {
      const secondCleanup = vi.fn().mockResolvedValue(undefined);

      manager.registerResource({
        name: 'Failing',
        cleanup: vi.fn().mockRejectedValue(new Error('boom')),
        timeout: 5000,
      });
      manager.registerResource({
        name: 'Healthy',
        cleanup: secondCleanup,
        timeout: 5000,
      });

      await triggerShutdown(manager);

      expect(secondCleanup).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cleanup Failing'),
        expect.any(Error),
        expect.objectContaining({ resourceName: 'Failing' }),
      );
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should timeout a slow resource via per-resource timeout', async () => {
      const slowCleanup = vi.fn(
        () => new Promise<void>((resolve) => setTimeout(resolve, 60_000)),
      );
      const fastCleanup = vi.fn().mockResolvedValue(undefined);

      manager.registerResource({
        name: 'Slow',
        cleanup: slowCleanup,
        timeout: 1000,
      });
      manager.registerResource({
        name: 'Fast',
        cleanup: fastCleanup,
        timeout: 5000,
      });

      const shutdownPromise = triggerShutdown(manager);

      // Advance past the per-resource timeout for Slow
      await vi.advanceTimersByTimeAsync(1100);
      await shutdownPromise;

      expect(fastCleanup).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cleanup Slow'),
        expect.any(Error),
        expect.objectContaining({ resourceName: 'Slow' }),
      );
      // Should still exit(0) since errors are isolated
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should exit(1) if server.close errors', async () => {
      const failServer = createMockServer(new Error('address in use'));
      const failManager = new ShutdownManager(failServer, {
        timeout: 10_000,
        logger,
      });

      await triggerShutdown(failManager);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Graceful shutdown failed',
        expect.any(Error),
      );
    });

    it('should force exit(1) if global timeout exceeded', async () => {
      // Hang server.close so shutdown never completes naturally
      const hangingServer = {
        close: vi.fn(() => { /* never calls callback */ }),
      } as unknown as Server;

      const hangManager = new ShutdownManager(hangingServer, {
        timeout: 5000,
        logger,
      });

      // Fire-and-forget — shutdown will hang waiting for server.close
      void triggerShutdown(hangManager);

      // Advance past global timeout
      await vi.advanceTimersByTimeAsync(5100);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Graceful shutdown timeout exceeded, forcing exit',
        expect.any(Error),
      );
    });

    it('should handle zero registered resources gracefully', async () => {
      await triggerShutdown(manager);

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(logger.info).toHaveBeenCalledWith(
        'No resources registered for cleanup',
      );
    });

    it('should log the signal that triggered shutdown', async () => {
      await triggerShutdown(manager, 'SIGQUIT');

      expect(logger.info).toHaveBeenCalledWith(
        'Graceful shutdown initiated',
        expect.objectContaining({ signal: 'SIGQUIT' }),
      );
    });

    it('should log resource count on shutdown initiation', async () => {
      manager.registerResource({
        name: 'DB',
        cleanup: vi.fn().mockResolvedValue(undefined),
        timeout: 5000,
      });
      manager.registerResource({
        name: 'Redis',
        cleanup: vi.fn().mockResolvedValue(undefined),
        timeout: 3000,
      });

      await triggerShutdown(manager);

      expect(logger.info).toHaveBeenCalledWith(
        'Graceful shutdown initiated',
        expect.objectContaining({ registeredResources: 2 }),
      );
    });
  });
});
