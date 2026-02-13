/**
 * Script to apply migration 0009 (constraints and indexes)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  try {
    console.log('🚀 Applying migration 0009_add_constraints_and_indexes...\n');

    const migrationSql = readFileSync(
      join(__dirname, '../drizzle/migrations/0009_add_constraints_and_indexes.sql'),
      'utf-8'
    );

    await db.execute(sql.raw(migrationSql));

    console.log('✅ Successfully applied migration 0009!\n');

    // Verify constraints
    const constraintsResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
      AND constraint_type = 'CHECK'
      AND table_name IN ('room_assets', 'style_images')
    `);

    const indexesResult = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('room_assets', 'style_images')
    `);

    console.log(`✅ CHECK constraints added: ${(constraintsResult.rows[0] as { count: string }).count}`);
    console.log(`✅ Indexes created: ${(indexesResult.rows[0] as { count: string }).count}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
