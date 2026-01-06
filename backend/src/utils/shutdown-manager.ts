import { Server } from 'http';
import { Logger } from './logger.js';

/**
 * Cleanup resource interface
 *
 * Resources register cleanup callbacks that are executed during shutdown
 */
export interface CleanupResource {
  name: string;
  cleanup: () => Promise<void>;
  timeout: number; // Max time allowed for this resource's cleanup (ms)
}

/**
 * ShutdownManager options
 */
export interface ShutdownManagerOptions {
  timeout: number; // Global timeout for entire shutdown process (ms)
  logger: Logger;
}

/**
 * ShutdownManager - Production-grade graceful shutdown handler
 *
 * Features:
 * - Idempotent: Safe to call multiple times (race condition protection)
 * - Resource registration: Services register cleanup callbacks
 * - Per-resource timeouts: Each resource gets its own timeout
 * - Error isolation: One resource failure doesn't cascade
 * - Signal handling: Handles SIGTERM, SIGINT, SIGQUIT
 * - Forced shutdown: Global timeout for unresponsive resources
 *
 * Usage:
 * ```typescript
 * const shutdownManager = new ShutdownManager(httpServer, {
 *   timeout: 10000,
 *   logger,
 * });
 *
 * shutdownManager.registerResource({
 *   name: 'Database',
 *   cleanup: async () => await closeConnection(),
 *   timeout: 5000,
 * });
 *
 * shutdownManager.registerSignalHandlers();
 * ```
 */
export class ShutdownManager {
  private isShuttingDown = false; // Idempotent flag
  private resources: CleanupResource[] = [];
  private server: Server;
  private globalTimeout: number;
  private logger: Logger;

  constructor(server: Server, options: ShutdownManagerOptions) {
    this.server = server;
    this.globalTimeout = options.timeout;
    this.logger = options.logger;
  }

  /**
   * Register a resource for cleanup during shutdown
   *
   * Resources are cleaned up in registration order
   *
   * @param resource - Resource with cleanup callback and timeout
   */
  registerResource(resource: CleanupResource): void {
    this.resources.push(resource);
    this.logger.info('Resource registered for shutdown', {
      resourceName: resource.name,
      timeout: resource.timeout,
    });
  }

  /**
   * Register signal handlers for graceful shutdown
   *
   * Handles SIGTERM (container orchestrator), SIGINT (Ctrl+C), SIGQUIT
   */
  registerSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGQUIT'];

    signals.forEach((signal) => {
      process.on(signal, () => {
        this.logger.info(`${signal} received, initiating graceful shutdown...`);
        this.shutdown(signal);
      });
    });

    this.logger.info('Shutdown signal handlers registered', {
      signals: signals.join(', '),
    });
  }

  /**
   * Perform graceful shutdown
   *
   * @param signal - Signal that triggered shutdown
   */
  private async shutdown(signal: string): Promise<void> {
    // Idempotent: prevent duplicate shutdowns (race condition protection)
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress, ignoring duplicate signal', undefined, {
        signal,
      });
      return;
    }
    this.isShuttingDown = true;

    this.logger.info('Graceful shutdown initiated', {
      signal,
      registeredResources: this.resources.length,
    });

    // Set global timeout for forced shutdown
    const forceShutdownTimer = setTimeout(() => {
      this.logger.error(
        'Graceful shutdown timeout exceeded, forcing exit',
        new Error(`Shutdown timeout after ${this.globalTimeout}ms`)
      );
      process.exit(1);
    }, this.globalTimeout);

    try {
      // Step 1: Stop accepting new connections
      await this.closeServer();

      // Step 2: Cleanup registered resources
      await this.cleanupResources();

      // Step 3: Exit cleanly
      clearTimeout(forceShutdownTimer);
      this.logger.info('Graceful shutdown complete', { signal });
      process.exit(0);
    } catch (error) {
      clearTimeout(forceShutdownTimer);
      this.logger.error('Graceful shutdown failed', error as Error);
      process.exit(1);
    }
  }

  /**
   * Close HTTP server
   *
   * Stops accepting new connections and waits for existing connections to finish
   */
  private async closeServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.info('Closing HTTP server...');

      this.server.close((err) => {
        if (err) {
          this.logger.error('Error closing server', err);
          reject(err);
        } else {
          this.logger.info('✅ HTTP server closed');
          resolve();
        }
      });
    });
  }

  /**
   * Cleanup all registered resources
   *
   * Resources are cleaned up in registration order
   * Each resource has its own timeout to prevent blocking
   * Errors are isolated - one failure doesn't cascade
   */
  private async cleanupResources(): Promise<void> {
    if (this.resources.length === 0) {
      this.logger.info('No resources registered for cleanup');
      return;
    }

    this.logger.info('Starting resource cleanup...', {
      totalResources: this.resources.length,
    });

    for (const resource of this.resources) {
      try {
        this.logger.info(`Cleaning up ${resource.name}...`, {
          timeout: resource.timeout,
        });

        // Race cleanup against per-resource timeout
        await Promise.race([
          resource.cleanup(),
          this.timeoutPromise(resource.timeout, resource.name),
        ]);

        this.logger.info(`✅ ${resource.name} cleaned up successfully`);
      } catch (error) {
        // Log error but continue (error isolation)
        this.logger.error(
          `❌ Failed to cleanup ${resource.name}`,
          error as Error,
          {
            resourceName: resource.name,
            continueWithOtherResources: true,
          }
        );
      }
    }

    this.logger.info('Resource cleanup complete');
  }

  /**
   * Create a timeout promise that rejects after specified milliseconds
   *
   * @param ms - Timeout in milliseconds
   * @param resourceName - Name of resource (for error message)
   * @returns Promise that rejects on timeout
   */
  private timeoutPromise(ms: number, resourceName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`${resourceName} cleanup timeout after ${ms}ms`)
        );
      }, ms);
    });
  }
}
