/**
 * Script to manually apply Drizzle migrations 0001-0006
 * Use this if drizzle-kit migrate didn't apply them
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../drizzle');

const migrations = [
  { file: '0001_cultured_the_hood.sql', hash: '0001_cultured_the_hood' },
  { file: '0002_mean_tenebrous.sql', hash: '0002_mean_tenebrous' },
  { file: '0003_add_style_preferences.sql', hash: '0003_add_style_preferences' },
  { file: '0004_brief_adam_destine.sql', hash: '0004_brief_adam_destine' },
  { file: '0005_create_style_images.sql', hash: '0005_create_style_images' },
  { file: '0006_add_performance_indexes.sql', hash: '0006_add_performance_indexes' },
];

async function applyMigration(filename: string, hash: string): Promise<void> {
  console.log(`\n📄 Applying ${filename}...`);

  const filePath = join(migrationsDir, filename);
  const migrationSql = readFileSync(filePath, 'utf-8');

  try {
    // Apply the migration SQL
    await db.execute(sql.raw(migrationSql));

    // Record in __drizzle_migrations table
    const now = Date.now();
    await db.execute(sql`
      INSERT INTO __drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${now})
    `);

    console.log(`✅ Successfully applied ${filename}`);
  } catch (error) {
    console.error(`❌ Failed to apply ${filename}:`, error);
    throw error;
  }
}

async function main(): Promise<void> {
  try {
    console.log('🚀 Starting Drizzle migration application...');
    console.log(`📁 Migrations directory: ${migrationsDir}`);

    // Apply migrations sequentially
    for (const migration of migrations) {
      await applyMigration(migration.file, migration.hash);
    }

    console.log('\n✅ All Drizzle migrations applied successfully!');
    console.log('\n📊 Checking final migration count...');

    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM __drizzle_migrations
    `);

    console.log(`Total migrations in database: ${(result.rows[0] as { count: string }).count}`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
