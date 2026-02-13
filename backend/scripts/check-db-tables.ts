/**
 * Script to check what tables exist in the database
 */

import { sql } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';

async function main(): Promise<void> {
  try {
    console.log('🔍 Checking database tables...\n');

    const result = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('📊 Tables in database:');
    console.log('─'.repeat(50));

    if (result.rows.length === 0) {
      console.log('❌ No tables found!');
    } else {
      (result.rows as { table_name: string }[]).forEach((row, index) => {
        console.log(`${index + 1}. ${row.table_name}`);
      });
    }

    console.log('─'.repeat(50));
    console.log(`\nTotal: ${result.rows.length} tables\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
