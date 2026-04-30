import 'dotenv/config';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL not set');

const client = new pg.Client({ connectionString: url });

const templateTables = ['users', 'items', 'categories', 'orders', 'order_items'];

async function main() {
  await client.connect();

  console.log('=== TEMPLATE TABLE ROW COUNTS ===');
  for (const t of templateTables) {
    try {
      const res = await client.query(`SELECT count(*)::text AS count FROM public."${t}"`);
      console.log(`public.${t.padEnd(15)} ${res.rows[0].count}`);
    } catch (e) {
      console.log(`public.${t.padEnd(15)} ERROR: ${(e as Error).message}`);
    }
  }

  console.log('\n=== EXISTING RLS POLICIES (renovation_sessions, chat_messages) ===');
  const policies = await client.query(`
    SELECT
      c.relname AS tablename,
      p.polname,
      CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                    WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
                    WHEN '*' THEN 'ALL' END AS cmd,
      ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)) AS roles,
      pg_get_expr(p.polqual,      p.polrelid) AS using_clause,
      pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname IN ('renovation_sessions', 'chat_messages')
    ORDER BY c.relname, p.polname
  `);
  for (const p of policies.rows) {
    console.log(`\n[${p.tablename}] ${p.polname} (${p.cmd}, TO ${p.roles.join(',')})`);
    if (p.using_clause)  console.log(`  USING:      ${p.using_clause}`);
    if (p.with_check)    console.log(`  WITH CHECK: ${p.with_check}`);
  }

  console.log('\n=== ALL RLS POLICIES IN public SCHEMA (silent debt check) ===');
  const allPolicies = await client.query(`
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `);
  for (const p of allPolicies.rows) {
    console.log(`  ${p.tablename.padEnd(25)} ${p.policyname}`);
  }
  console.log(`(${allPolicies.rowCount} total)`);

  console.log('\n=== RLS ENABLED FLAG (all public tables) ===');
  const rlsState = await client.query(`
    SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  for (const r of rlsState.rows) {
    console.log(`  ${r.tablename.padEnd(28)} rls=${r.rowsecurity}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
