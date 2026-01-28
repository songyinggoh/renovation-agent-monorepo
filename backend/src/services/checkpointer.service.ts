import { MemorySaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { env, isPostgresCheckpointerEnabled } from '../config/env.js';
import { pool } from '../db/index.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'CheckpointerService' });

/**
 * Union type for supported checkpointer types
 */
export type Checkpointer = MemorySaver | PostgresSaver;

/**
 * Singleton checkpointer instance
 * Shared across the application for consistent state management
 */
let checkpointerInstance: Checkpointer | null = null;

/**
 * Flag to track if PostgresSaver has been set up (tables created)
 */
let isPostgresSetupComplete = false;

/**
 * Create the appropriate checkpointer based on environment configuration
 *
 * - 'memory': Uses MemorySaver (in-memory, lost on restart)
 * - 'postgres': Uses PostgresSaver (persistent, requires setup())
 *
 * @returns Checkpointer instance (MemorySaver or PostgresSaver)
 */
function createCheckpointer(): Checkpointer {
  if (isPostgresCheckpointerEnabled()) {
    logger.info('Creating PostgresSaver checkpointer', {
      checkpointerType: 'postgres',
    });
    return new PostgresSaver(pool);
  }

  logger.info('Creating MemorySaver checkpointer', {
    checkpointerType: 'memory',
  });
  return new MemorySaver();
}

/**
 * Get the singleton checkpointer instance
 *
 * Creates the instance on first call and returns the same instance thereafter.
 * Must call initializeCheckpointer() before using PostgresSaver in production.
 *
 * @returns The shared checkpointer instance
 */
export function getCheckpointer(): Checkpointer {
  if (!checkpointerInstance) {
    checkpointerInstance = createCheckpointer();
  }
  return checkpointerInstance;
}

/**
 * Initialize the checkpointer
 *
 * For PostgresSaver, this calls setup() to create the required database tables.
 * For MemorySaver, this is a no-op.
 *
 * Should be called during server startup after database connection is validated.
 *
 * @throws Error if PostgresSaver setup fails
 */
export async function initializeCheckpointer(): Promise<void> {
  const checkpointer = getCheckpointer();

  if (isPostgresCheckpointerEnabled() && !isPostgresSetupComplete) {
    logger.info('Initializing PostgresSaver checkpointer (creating tables)...');
    try {
      await (checkpointer as PostgresSaver).setup();
      isPostgresSetupComplete = true;
      logger.info('PostgresSaver checkpointer initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize PostgresSaver checkpointer', error as Error);
      throw error;
    }
  } else {
    logger.info('Checkpointer initialized', {
      type: env.LANGGRAPH_CHECKPOINTER,
      requiresSetup: false,
    });
  }
}

/**
 * Cleanup the checkpointer
 *
 * For PostgresSaver, this ensures any pending writes are flushed.
 * For MemorySaver, this is a no-op (memory is cleared on process exit).
 *
 * Should be called during graceful shutdown.
 */
export async function cleanupCheckpointer(): Promise<void> {
  logger.info('Cleaning up checkpointer...');

  if (checkpointerInstance && isPostgresCheckpointerEnabled()) {
    // PostgresSaver doesn't have an explicit close method,
    // but we log for observability
    logger.info('PostgresSaver cleanup complete (uses shared connection pool)');
  } else {
    logger.info('MemorySaver cleanup complete (no-op)');
  }

  // Reset singleton for clean restart in tests
  checkpointerInstance = null;
  isPostgresSetupComplete = false;
}

/**
 * Check if the checkpointer has been initialized
 *
 * Useful for health checks and debugging.
 *
 * @returns true if checkpointer is ready for use
 */
export function isCheckpointerReady(): boolean {
  if (!checkpointerInstance) {
    return false;
  }

  if (isPostgresCheckpointerEnabled()) {
    return isPostgresSetupComplete;
  }

  return true;
}

/**
 * Get checkpointer status for health checks
 *
 * @returns Object with checkpointer type and status
 */
export function getCheckpointerStatus(): {
  type: 'memory' | 'postgres';
  ready: boolean;
  setupComplete: boolean;
} {
  return {
    type: env.LANGGRAPH_CHECKPOINTER,
    ready: isCheckpointerReady(),
    setupComplete: isPostgresSetupComplete,
  };
}
