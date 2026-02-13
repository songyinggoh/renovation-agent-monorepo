/**
 * Script to apply manual migrations (0007-0009)
 * These are separate from Drizzle-managed migrations
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../drizzle/migrations');

const migrations = [
  '0007_add_asset_variants.sql',
  '0008_add_document_artifacts.sql',
  '0009_add_constraints_and_indexes.sql'
];

async function checkTableExists(tableName: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = ${tableName}
    ) as exists
  `);

  return (result.rows[0] as { exists: boolean }).exists;
}

async function applyMigration(filename: string): Promise<void> {
  console.log(`\n📄 Applying ${filename}...`);

  const filePath = join(migrationsDir, filename);
  const migrationSql = readFileSync(filePath, 'utf-8');

  try {
    await db.execute(sql.raw(migrationSql));
    console.log(`✅ Successfully applied ${filename}`);
  } catch (error) {
    console.error(`❌ Failed to apply ${filename}:`, error);
    throw error;
  }
}

async function verifyMigrations(): Promise<void> {
  console.log('\n🔍 Verifying migrations...\n');

  // Check for asset_variants table
  const assetVariantsExists = await checkTableExists('asset_variants');
  console.log(`asset_variants table: ${assetVariantsExists ? '✅ EXISTS' : '❌ MISSING'}`);

  // Check for document_artifacts table
  const documentArtifactsExists = await checkTableExists('document_artifacts');
  console.log(`document_artifacts table: ${documentArtifactsExists ? '✅ EXISTS' : '❌ MISSING'}`);

  // Count constraints and indexes
  const constraintsResult = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
    AND constraint_type = 'CHECK'
  `);

  const indexesResult = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM pg_indexes
    WHERE schemaname = 'public'
  `);

  console.log(`\nTotal CHECK constraints: ${(constraintsResult.rows[0] as { count: string }).count}`);
  console.log(`Total indexes: ${(indexesResult.rows[0] as { count: string }).count}`);
}

async function main(): Promise<void> {
  try {
    console.log('🚀 Starting manual migration application...');
    console.log(`📁 Migrations directory: ${migrationsDir}`);

    // Check current state
    console.log('\n📊 Checking current database state...');
    const assetVariantsExists = await checkTableExists('asset_variants');
    const documentArtifactsExists = await checkTableExists('document_artifacts');

    if (assetVariantsExists && documentArtifactsExists) {
      console.log('\n⚠️  Tables already exist. Migrations may have been applied previously.');
      console.log('Do you want to continue? (This script will attempt to re-run migrations)');
      console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Apply migrations sequentially
    for (const migration of migrations) {
      await applyMigration(migration);
    }

    // Verify
    await verifyMigrations();

    console.log('\n✅ All migrations applied successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
