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

// Get project root and load .env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "../..");

dotenv.config({ path: join(projectRoot, ".env") });

// Use DATABASE_URL from environment (supports both direct and pooled connections)
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	console.error("❌ Missing DATABASE_URL environment variable");
	console.error("\n💡 Get your database connection string from:");
	console.error("   Supabase Dashboard → Project Settings → Database → Connection String");
	console.error("   You can use either 'Direct connection' or 'Transaction pooler'\n");
	process.exit(1);
}

interface MigrationResult {
	filename: string;
	success: boolean;
	error?: string;
}

async function runMigrations() {
	console.log("\n╔════════════════════════════════════════════════════════════╗");
	console.log("║  AndYou Medical Agent - Database Migration Runner        ║");
	console.log("╚════════════════════════════════════════════════════════════╝\n");

	if (!connectionString) {
		console.error("❌ DATABASE_URL is undefined. Cannot proceed.");
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
		console.log("📡 Testing database connection...\n");
		await pool.query("SELECT NOW()");
		console.log("✅ Connected to database successfully\n");

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
		console.log(`📁 Reading migrations from: ${migrationsDir}\n`);

		const files = readdirSync(migrationsDir)
			.filter((f) => f.endsWith(".sql"))
			.filter((f) => !f.startsWith("_")) // Skip meta files
			.sort(); // Run in order

		console.log(`📋 Found ${files.length} migration files\n`);

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
				console.log(`⏭️  Skipping ${file} (already executed)`);
				continue;
			}

			console.log(`\n🔄 Running migration: ${file}`);

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

					console.log(`   ✅ Success!`);
					results.push({ filename: file, success: true });
				} catch (error) {
					await pool.query("ROLLBACK");
					throw error;
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				console.log(`   ❌ Failed: ${errorMessage}`);
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
					console.log("   (Could not record failure in database)");
				}

				console.log("\n⚠️  Migration failed. Fix the error and run again.\n");
				break; // Stop on first error
			}
		}

		// Summary
		console.log("\n═══════════════════════════════════════════════════════════");
		console.log("📊 Migration Summary:");
		console.log(`   Total migrations: ${files.length}`);
		console.log(`   Already executed: ${executedSet.size}`);
		console.log(`   Newly executed: ${results.filter((r) => r.success).length}`);
		console.log(`   Failed: ${results.filter((r) => !r.success).length}`);

		const hasFailures = results.some((r) => !r.success);

		if (hasFailures) {
			console.log("\n❌ Some migrations failed. See errors above.");
			process.exit(1);
		} else if (results.length === 0) {
			console.log("\n✅ No new migrations to run. Database is up to date!");
		} else {
			console.log("\n✅ All migrations executed successfully!");
		}

		console.log("═══════════════════════════════════════════════════════════\n");

		console.log("🚀 Next steps:");
		console.log("   1. Run: npm run test:db");
		console.log("   2. Verify all tables are created\n");
	} catch (error) {
		console.error("\n❌ Migration failed:", error);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

runMigrations();

