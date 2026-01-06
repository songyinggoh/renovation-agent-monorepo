import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Drizzle Kit configuration for database migrations
 *
 * This configuration:
 * - Points to all schema files in src/db/schema/
 * - Uses DATABASE_URL from environment variables
 * - Outputs migrations to ./drizzle directory
 *
 * Usage:
 * - npm run db:generate - Generate migrations from schema changes
 * - npm run db:migrate - Apply migrations to database
 * - npm run db:studio - Open Drizzle Studio UI
 */

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required. Please set it in your .env file.\n' +
      'Get your connection string from Supabase: Settings > Database > Connection String (Direct connection)'
  );
}

export default {
  // Schema location
  schema: './src/db/schema/*',

  // Output directory for migrations
  out: './drizzle',

  // Database dialect
  dialect: 'postgresql',

  // Database connection
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },

  // Optional: Enable verbose logging
  verbose: true,

  // Optional: Enable strict mode (recommended)
  strict: true,
} satisfies Config;
