/**
 * Script to apply only the style_images table creation
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  try {
    console.log('🚀 Creating style_images table...\n');

    const migrationSql = readFileSync(
      join(__dirname, '../drizzle/0005_create_style_images.sql'),
      'utf-8'
    );

    await db.execute(sql.raw(migrationSql));

    console.log('✅ Successfully created style_images table!\n');

    // Verify
    const result = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'style_images'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Verification: style_images table exists');
    } else {
      console.log('❌ Verification failed: style_images table not found');
    }

  } catch (error) {
    if ((error as { code?: string }).code === '42P07') {
      console.log('⚠️  style_images table already exists');
    } else {
      console.error('❌ Error:', error);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main();
