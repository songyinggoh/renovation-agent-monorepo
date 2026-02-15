/**
 * Script to apply the products_catalog table migration (0010)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';
import { Logger } from '../src/utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = new Logger({ serviceName: 'MigrateProductsCatalog' });

async function main(): Promise<void> {
  try {
    logger.info('Creating products_catalog table');

    const migrationSql = readFileSync(
      join(__dirname, '../drizzle/migrations/0010_add_products_catalog.sql'),
      'utf-8'
    );

    await db.execute(sql.raw(migrationSql));
    logger.info('Migration applied successfully');

    // Verify
    const result = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'products_catalog'
    `);

    if (result.rows.length > 0) {
      logger.info('Verification passed: products_catalog table exists');
    } else {
      logger.error('Verification failed: products_catalog table not found');
      process.exit(1);
    }

  } catch (error) {
    if ((error as { code?: string }).code === '42P07') {
      logger.info('products_catalog table already exists (idempotent)');
    } else {
      logger.error('Migration failed', error as Error);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

main();
