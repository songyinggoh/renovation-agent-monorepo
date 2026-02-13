/**
 * Script to check which migrations have been applied
 */

import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';

async function main(): Promise<void> {
  try {
    console.log('🔍 Checking applied migrations...\n');

    const result = await db.execute(sql`
      SELECT id, hash, created_at
      FROM __drizzle_migrations
      ORDER BY created_at
    `);

    console.log('📊 Applied migrations:');
    console.log('─'.repeat(80));

    if (result.rows.length === 0) {
      console.log('❌ No migrations found!');
    } else {
      (result.rows as { id: number; hash: string; created_at: string | number }[]).forEach((row) => {
        console.log(`${row.id} | ${row.hash} | ${row.created_at}`);
      });
    }

    console.log('─'.repeat(80));
    console.log(`\nTotal: ${result.rows.length} migrations applied\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
