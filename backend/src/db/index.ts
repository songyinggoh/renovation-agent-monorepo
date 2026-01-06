import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import { Logger } from '../utils/logger.js';
import * as schema from './schema/index.js';

const { Pool } = pg;

const logger = new Logger({ serviceName: 'Database' });

/**
 * PostgreSQL connection pool configuration
 *
 * Uses connection pooling for optimal performance and resource management
 * Pool size and idle timeout are configured for production workloads
 */
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Connection timeout: 10 seconds
});

// Log pool errors
pool.on('error', (error: Error) => {
  logger.error('Unexpected database pool error', error, {
    errorName: error.name,
    errorMessage: error.message,
  });
});

// Log successful pool connections (info level, not debug)
pool.on('connect', () => {
  logger.info('New database connection established in pool');
});

/**
 * Drizzle ORM instance
 *
 * Provides type-safe database operations with the full schema
 */
export const db = drizzle(pool, {
  schema,
  logger: false, // Disable Drizzle's built-in logging (we use our own)
});

/**
 * Test database connection
 *
 * Verifies that the database is reachable and credentials are valid
 * Should be called during application startup
 *
 * @throws Error if connection fails
 */
export async function testConnection(): Promise<void> {
  try {
    logger.info('Testing database connection...');

    // Simple query to verify connection
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');

    logger.info('Database connection successful', {
      currentTime: result.rows[0]?.current_time,
      poolSize: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    });

    client.release();
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Database connection failed', err, {
      databaseUrl: env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'), // Mask password
    });
    throw new Error(`Database connection failed: ${err.message}`);
  }
}

/**
 * Close all database connections
 *
 * Should be called during graceful shutdown
 */
export async function closeConnection(): Promise<void> {
  try {
    logger.info('Closing database connection pool...');
    await pool.end();
    logger.info('Database connection pool closed successfully');
  } catch (error: unknown) {
    const err = error as Error;
    logger.error('Error closing database connection pool', err);
    throw err;
  }
}

/**
 * Get pool statistics
 *
 * Useful for monitoring and debugging connection pool health
 */
export function getPoolStats(): {
  total: number;
  idle: number;
  waiting: number;
} {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

/**
 * Export schema for use in services
 */
export { schema };

/**
 * Export types for use throughout the application
 */
export type {
  Profile,
  NewProfile,
  RenovationSession,
  NewRenovationSession,
  RenovationRoom,
  NewRenovationRoom,
  ProductRecommendation,
  NewProductRecommendation,
  ContractorRecommendation,
  NewContractorRecommendation,
  ChatMessage,
  NewChatMessage,
} from './schema/index.js';
