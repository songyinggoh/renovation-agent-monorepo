/**
 * Database Migration Runner
 *
 * Runs SQL migrations from the database/migrations folder
 * This ensures database schema is in sync with the application models
 */

import * as dotenv from "dotenv";
import { Pool } from "pg";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Logger } from "../utils/logger.js";

const logger = new Logger({ serviceName: 'Migration' });

// Get project root and load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "../..");

dotenv.config({ path: join(projectRoot, ".env") });

// Use DATABASE_URL from environment (supports both direct and pooled connections)
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	logger.error('Missing DATABASE_URL environment variable', new Error('DATABASE_URL not set'), {
		help: 'Get your database connection string from Supabase Dashboard → Project Settings → Database → Connection String',
		connectionTypes: ['Direct connection', 'Transaction pooler'],
	});
	process.exit(1);
}

interface MigrationResult {
	filename: string;
	success: boolean;
	error?: string;
}

async function runMigrations() {
	logger.info('Database Migration Runner - Starting', {
		banner: 'Renovation Agent - Database Migration Runner',
	});

	if (!connectionString) {
		logger.error('DATABASE_URL is undefined', new Error('DATABASE_URL not set'));
		process.exit(1);
	}

	const pool = new Pool({
		connectionString,
		ssl: connectionString.includes("supabase.com")
			? { rejectUnauthorized: false }
			: undefined,
	});

	try {
		// Test connection
		logger.info('Testing database connection');
		await pool.query("SELECT NOW()");
		logger.info('Connected to database successfully');

		// Create migrations tracking table if it doesn't exist
		await pool.query(`
			CREATE TABLE IF NOT EXISTS public._migrations (
				id SERIAL PRIMARY KEY,
				filename TEXT UNIQUE NOT NULL,
				executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
				success BOOLEAN NOT NULL DEFAULT TRUE
			);
		`);

		// Get all migration files from database/migrations
		const migrationsDir = join(projectRoot, "../database/migrations");
		logger.info('Reading migrations', { migrationsDir });

		const files = readdirSync(migrationsDir)
			.filter((f) => f.endsWith(".sql"))
			.filter((f) => !f.startsWith("_")) // Skip meta files
			.sort(); // Run in order

		logger.info('Found migration files', { count: files.length });

		// Get already executed migrations
		const { rows: executedMigrations } = await pool.query(
			"SELECT filename FROM public._migrations WHERE success = TRUE"
		);
		const executedSet = new Set(
			executedMigrations.map((r: { filename: string }) => r.filename)
		);

		const results: MigrationResult[] = [];

		// Run each migration
		for (const file of files) {
			if (executedSet.has(file)) {
				logger.info('Skipping migration (already executed)', { filename: file });
				continue;
			}

			logger.info('Running migration', { filename: file });

			try {
				const sqlPath = join(migrationsDir, file);
				const sql = readFileSync(sqlPath, "utf-8");

				// Execute migration in a transaction
				await pool.query("BEGIN");

				try {
					await pool.query(sql);

					// Record successful migration
					await pool.query(
						"INSERT INTO public._migrations (filename, success) VALUES ($1, TRUE)",
						[file]
					);

					await pool.query("COMMIT");

					logger.info('Migration completed successfully', { filename: file });
					results.push({ filename: file, success: true });
				} catch (error) {
					await pool.query("ROLLBACK");
					throw error;
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				logger.error('Migration failed', error as Error, {
					filename: file,
					errorMessage,
				});
				results.push({
					filename: file,
					success: false,
					error: errorMessage,
				});

				// Record failed migration (optional - helps with debugging)
				try {
					await pool.query(
						"INSERT INTO public._migrations (filename, success) VALUES ($1, FALSE)",
						[file]
					);
				} catch {
					// Ignore if we can't record the failure
					logger.warn('Could not record migration failure in database', undefined, {
						filename: file,
					});
				}

				logger.warn('Migration failed - fix the error and run again', undefined, { filename: file });
				break; // Stop on first error
			}
		}

		// Summary
		const summary = {
			totalMigrations: files.length,
			alreadyExecuted: executedSet.size,
			newlyExecuted: results.filter((r) => r.success).length,
			failed: results.filter((r) => !r.success).length,
		};

		logger.info('Migration Summary', summary);

		const hasFailures = results.some((r) => !r.success);

		if (hasFailures) {
			logger.error('Some migrations failed', new Error('Migration failures detected'), summary);
			process.exit(1);
		} else if (results.length === 0) {
			logger.info('No new migrations to run - database is up to date', summary);
		} else {
			logger.info('All migrations executed successfully', summary);
		}

		logger.info('Next steps', {
			steps: [
				'Run: npm run test:db',
				'Verify all tables are created',
			],
		});
	} catch (error) {
		logger.error('Migration failed', error as Error);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

runMigrations();

