#!/usr/bin/env tsx
/**
 * validate-rollback.ts
 *
 * Validates that a rollback script correctly reverses its UP migration by
 * running a full UP → DOWN roundtrip against a temporary database and
 * diffing the schema before and after.
 *
 * Usage:
 *   tsx validate-rollback.ts <migration.sql>
 *
 * Env:
 *   DATABASE_URL — connection string; the host/user/pass are reused but the
 *                  database name is replaced with a throwaway validation DB.
 *
 * Skips validation if the rollback contains MANUAL ROLLBACK REQUIRED markers.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import pkg from 'pg';
import { MANUAL_ROLLBACK_MARKER } from './patterns.js';
import type { SchemaSnapshot, ValidationResult } from './types.js';

const { Client } = pkg;

// ─── Database Utilities ───────────────────────────────────────────────────────

function buildUrl(base: string, database: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

async function createClient(connectionString: string): Promise<pkg.Client> {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

/**
 * Execute a SQL file against an open client, statement by statement.
 * Uses a simple semicolon split (sufficient for Drizzle-generated SQL).
 */
async function executeSqlFile(client: pkg.Client, filePath: string): Promise<void> {
  const content = readFileSync(filePath, 'utf-8');

  // Split on `;` that are not inside string literals (simplified — works for
  // Drizzle-generated SQL which doesn't use complex PL/pgSQL blocks).
  const statements = content
    .split(/;(?=(?:[^']*'[^']*')*[^']*$)/m)
    .map((s) => s.trim())
    .filter((s) => s && !/^--/.test(s));

  for (const stmt of statements) {
    await client.query(stmt);
  }
}

// ─── Schema Capture ───────────────────────────────────────────────────────────

async function captureSchemaSnapshot(client: pkg.Client): Promise<SchemaSnapshot> {
  const tables = await client.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const columns = await client.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);

  const indexes = await client.query<{
    indexname: string;
    tablename: string;
    indexdef: string;
  }>(`
    SELECT indexname, tablename, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY indexname
  `);

  const constraints = await client.query<{
    constraint_name: string;
    table_name: string;
    constraint_type: string;
  }>(`
    SELECT constraint_name, table_name, constraint_type
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
    ORDER BY constraint_name
  `);

  return {
    tables: tables.rows.map((r) => r.table_name),
    columns: columns.rows.map((r) => ({
      table: r.table_name,
      column: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable,
      default: r.column_default,
    })),
    indexes: indexes.rows.map((r) => ({
      name: r.indexname,
      table: r.tablename,
      definition: r.indexdef,
    })),
    constraints: constraints.rows.map((r) => ({
      name: r.constraint_name,
      table: r.table_name,
      type: r.constraint_type,
    })),
  };
}

// ─── Schema Diff ──────────────────────────────────────────────────────────────

function diffSnapshots(before: SchemaSnapshot, after: SchemaSnapshot): string[] {
  const diffs: string[] = [];

  // Tables
  const beforeTables = new Set(before.tables);
  const afterTables = new Set(after.tables);
  for (const t of afterTables) {
    if (!beforeTables.has(t)) diffs.push(`Table added: ${t}`);
  }
  for (const t of beforeTables) {
    if (!afterTables.has(t)) diffs.push(`Table removed: ${t}`);
  }

  // Columns
  const colKey = (c: SchemaSnapshot['columns'][number]): string =>
    `${c.table}.${c.column}:${c.type}:${c.nullable}:${c.default ?? 'NULL'}`;
  const beforeCols = new Set(before.columns.map(colKey));
  const afterCols = new Set(after.columns.map(colKey));
  for (const c of after.columns) {
    if (!beforeCols.has(colKey(c))) diffs.push(`Column added/changed: ${c.table}.${c.column}`);
  }
  for (const c of before.columns) {
    if (!afterCols.has(colKey(c))) diffs.push(`Column removed/changed: ${c.table}.${c.column}`);
  }

  // Indexes
  const beforeIdx = new Set(before.indexes.map((i) => `${i.name}:${i.definition}`));
  const afterIdx = new Set(after.indexes.map((i) => `${i.name}:${i.definition}`));
  for (const i of after.indexes) {
    const key = `${i.name}:${i.definition}`;
    if (!beforeIdx.has(key)) diffs.push(`Index added: ${i.name}`);
  }
  for (const i of before.indexes) {
    const key = `${i.name}:${i.definition}`;
    if (!afterIdx.has(key)) diffs.push(`Index removed: ${i.name}`);
  }

  return diffs;
}

// ─── Migration Discovery ──────────────────────────────────────────────────────

function findPreviousMigrations(upFilePath: string): string[] {
  const dir = dirname(resolve(upFilePath));
  const targetNum = parseInt(basename(upFilePath).match(/^(\d+)/)?.[1] ?? '-1', 10);

  if (targetNum < 0) throw new Error(`Cannot parse migration number from: ${upFilePath}`);

  return readdirSync(dir)
    .filter((f) => {
      if (!f.endsWith('.sql')) return false;
      if (f.includes('rollback')) return false;
      const num = parseInt(f.match(/^(\d+)/)?.[1] ?? '-1', 10);
      return num >= 0 && num < targetNum;
    })
    .sort()
    .map((f) => join(dir, f));
}

// ─── Validation ───────────────────────────────────────────────────────────────

async function validateRollback(upFilePath: string): Promise<ValidationResult> {
  const resolvedUp = resolve(upFilePath);
  const migDir = dirname(resolvedUp);
  const num = basename(resolvedUp).match(/^(\d+)/)?.[1];

  if (!num) {
    return {
      success: false,
      upFile: resolvedUp,
      downFile: '',
      error: `Cannot extract migration number from: ${upFilePath}`,
    };
  }

  const downFile = join(migDir, 'rollbacks', `${num}_rollback.sql`);

  if (!existsSync(downFile)) {
    return {
      success: false,
      upFile: resolvedUp,
      downFile,
      error: `Rollback file not found: ${downFile} — run generate-rollback.ts first`,
    };
  }

  // Skip if manual rollback required
  const downContent = readFileSync(downFile, 'utf-8');
  if (downContent.includes(MANUAL_ROLLBACK_MARKER)) {
    return {
      success: true,
      upFile: resolvedUp,
      downFile,
      skipped: true,
      skipReason:
        'Rollback contains MANUAL ROLLBACK REQUIRED markers — human review needed',
    };
  }

  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    return {
      success: false,
      upFile: resolvedUp,
      downFile,
      error: 'DATABASE_URL environment variable is required',
    };
  }

  const validationDb = `migration_validation_${Date.now()}`;
  const adminUrl = buildUrl(databaseUrl, 'postgres');
  const validationUrl = buildUrl(databaseUrl, validationDb);

  let adminClient: pkg.Client | null = null;

  try {
    // Create isolated validation database
    adminClient = await createClient(adminUrl);
    await adminClient.query(`CREATE DATABASE ${validationDb}`);

    const testClient = await createClient(validationUrl);

    try {
      // Apply all previous migrations to build the baseline
      const previousMigrations = findPreviousMigrations(resolvedUp);
      for (const migFile of previousMigrations) {
        await executeSqlFile(testClient, migFile);
      }

      // Capture baseline schema (before UP migration)
      const baseline = await captureSchemaSnapshot(testClient);

      // Apply UP migration
      await executeSqlFile(testClient, resolvedUp);

      // Apply DOWN rollback
      await executeSqlFile(testClient, downFile);

      // Capture post-rollback schema
      const postRollback = await captureSchemaSnapshot(testClient);

      // Diff
      const differences = diffSnapshots(baseline, postRollback);

      return {
        success: differences.length === 0,
        upFile: resolvedUp,
        downFile,
        differences,
        baselineSnapshot: baseline,
        postRollbackSnapshot: postRollback,
      };
    } finally {
      await testClient.end();
    }
  } finally {
    if (adminClient) {
      // Drop the validation database
      try {
        await adminClient.query(
          `DROP DATABASE IF EXISTS ${validationDb} WITH (FORCE)`,
        );
      } catch {
        // Non-fatal — CI containers are ephemeral anyway
      }
      await adminClient.end();
    }
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

const [, , upFile] = process.argv;

if (!upFile) {
  console.error('Usage: validate-rollback.ts <migration.sql>');
  process.exit(1);
}

try {
  const result = await validateRollback(upFile);

  if (result.skipped) {
    console.log(`[SKIP] ${result.skipReason}`);
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (!result.success) {
    if (result.error) {
      console.error(`[FAIL] ${result.error}`);
    } else {
      console.error('[FAIL] Rollback did not cleanly reverse the migration:');
      for (const diff of result.differences ?? []) {
        console.error(`  - ${diff}`);
      }
    }
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log('[PASS] Rollback correctly reverses the migration.');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
} catch (err) {
  console.error(`[ERROR] ${(err as Error).message}`);
  process.exit(1);
}
