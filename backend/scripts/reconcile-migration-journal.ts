/**
 * One-time reconciliation script for existing databases.
 *
 * When drizzle-kit migrate runs migration 0007_reconcile_manual_tables,
 * it will try to CREATE TABLE for tables that already exist (from manual
 * migrations). Since the SQL is now a no-op, we just need to ensure
 * the migration hash is recorded in __drizzle_migrations so drizzle-kit
 * considers it "already applied".
 *
 * Usage: npm run db:reconcile
 *
 * Safe to run multiple times (idempotent).
 */

import 'dotenv/config';
import pg from 'pg';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Logger } from '../src/utils/logger.js';

const logger = new Logger({ serviceName: 'ReconcileMigrationJournal' });

const MIGRATION_TAG = '0007_reconcile_manual_tables';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.error('DATABASE_URL is required', new Error('Missing DATABASE_URL'));
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // Check if __drizzle_migrations table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = '__drizzle_migrations'
      ) AS exists
    `);

    if (!tableCheck.rows[0]?.exists) {
      logger.info('No __drizzle_migrations table found — fresh database, nothing to reconcile');
      return;
    }

    // Check if reconciliation migration is already recorded
    const existing = await client.query(
      `SELECT id FROM __drizzle_migrations WHERE tag = $1`,
      [MIGRATION_TAG]
    );

    if (existing.rows.length > 0) {
      logger.info('Reconciliation migration already recorded, nothing to do', {
        tag: MIGRATION_TAG,
      });
      return;
    }

    // Compute the hash that drizzle-kit would use (SHA-256 of the SQL file contents)
    const sqlPath = path.resolve(
      import.meta.dirname ?? '.',
      '../drizzle',
      `${MIGRATION_TAG}.sql`
    );
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');
    const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');

    // Insert the migration record
    await client.query(
      `INSERT INTO __drizzle_migrations (hash, tag, created_at)
       VALUES ($1, $2, $3)`,
      [hash, MIGRATION_TAG, Date.now()]
    );

    logger.info('Reconciliation migration recorded successfully', {
      tag: MIGRATION_TAG,
      hash: hash.slice(0, 12) + '...',
    });
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  logger.error('Reconciliation failed', err instanceof Error ? err : new Error(String(err)));
  process.exit(1);
});
