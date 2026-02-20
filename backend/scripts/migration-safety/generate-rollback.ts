#!/usr/bin/env tsx
/**
 * generate-rollback.ts
 *
 * Parses a Drizzle UP migration and produces the inverse DOWN SQL.
 *
 * Usage:
 *   tsx generate-rollback.ts <file.sql>
 *
 * Output:
 *   backend/drizzle/rollbacks/NNNN_rollback.sql
 *
 * Non-reversible operations emit a -- MANUAL ROLLBACK REQUIRED comment.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { MANUAL_ROLLBACK_MARKER } from './patterns.js';
import type { RollbackEntry, RollbackReport } from './types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract a potentially double-quoted identifier from a string.
 * e.g. `"my table"` → `"my table"`, `mytable` → `mytable`
 */
function extractIdentifier(s: string): string {
  const m = s.match(/^("(?:[^"]|"")*"|[^\s(,;]+)/);
  return m ? m[1] : s.split(/[\s(,;]/)[0];
}

// ─── Statement Parser ─────────────────────────────────────────────────────────

/**
 * Split SQL into individual statements (same logic as analyze-migration).
 */
function splitStatements(content: string): string[] {
  const results: string[] = [];
  let buffer = '';
  let inString = false;
  let inDollarQuote = false;
  let dollarTag = '';
  let i = 0;

  const flush = (): void => {
    const trimmed = buffer.trim();
    if (trimmed && trimmed !== ';') results.push(trimmed);
    buffer = '';
  };

  while (i < content.length) {
    const ch = content[i];

    if (inDollarQuote) {
      if (content[i] === '$' && content.startsWith(dollarTag, i)) {
        buffer += dollarTag;
        i += dollarTag.length;
        inDollarQuote = false;
        dollarTag = '';
      } else {
        buffer += ch;
        i++;
      }
      continue;
    }

    if (inString) {
      buffer += ch;
      if (ch === "'") {
        if (content[i + 1] === "'") {
          buffer += "'";
          i += 2;
        } else {
          inString = false;
          i++;
        }
      } else {
        i++;
      }
      continue;
    }

    if (ch === '$') {
      const match = content.slice(i).match(/^\$([^$\s]*)\$/);
      if (match) {
        inDollarQuote = true;
        dollarTag = match[0];
        buffer += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (ch === "'") {
      inString = true;
      buffer += ch;
      i++;
      continue;
    }

    if (ch === '-' && content[i + 1] === '-') {
      let j = i;
      while (j < content.length && content[j] !== '\n') j++;
      buffer += content.slice(i, j);
      i = j;
      continue;
    }

    if (ch === '/' && content[i + 1] === '*') {
      const closeIdx = content.indexOf('*/', i + 2);
      const end = closeIdx === -1 ? content.length : closeIdx + 2;
      buffer += content.slice(i, end);
      i = end;
      continue;
    }

    if (ch === ';') {
      buffer += ';';
      i++;
      flush();
      continue;
    }

    buffer += ch;
    i++;
  }

  const trimmed = buffer.trim();
  if (trimmed && trimmed !== ';') results.push(trimmed);
  return results;
}

// ─── Rollback Generators ──────────────────────────────────────────────────────

function rollbackForStatement(sql: string): RollbackEntry {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  const upper = normalized.toUpperCase();

  // CREATE TABLE [IF NOT EXISTS] <name> (...)
  const createTable = normalized.match(
    /^CREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)/i,
  );
  if (createTable) {
    const tableName = createTable[1];
    return {
      originalSql: sql,
      rollbackSql: `DROP TABLE IF EXISTS ${tableName};`,
      requiresManual: false,
    };
  }

  // ALTER TABLE <table> ADD COLUMN [IF NOT EXISTS] <col> ...
  const addColumn = normalized.match(
    /^ALTER\s+TABLE\s+(?:ONLY\s+)?(\S+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)/i,
  );
  if (addColumn) {
    const [, table, column] = addColumn;
    return {
      originalSql: sql,
      rollbackSql: `ALTER TABLE ${table} DROP COLUMN IF EXISTS ${column};`,
      requiresManual: false,
    };
  }

  // CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] <name> ON ...
  const createIndex = normalized.match(
    /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(\S+)\s+ON/i,
  );
  if (createIndex) {
    const indexName = createIndex[1];
    return {
      originalSql: sql,
      rollbackSql: `DROP INDEX IF EXISTS ${indexName};`,
      requiresManual: false,
    };
  }

  // ALTER TABLE <table> ADD CONSTRAINT <name> ...
  const addConstraint = normalized.match(
    /^ALTER\s+TABLE\s+(?:ONLY\s+)?(\S+)\s+ADD\s+CONSTRAINT\s+(\S+)/i,
  );
  if (addConstraint) {
    const [, table, constraint] = addConstraint;
    return {
      originalSql: sql,
      rollbackSql: `ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint};`,
      requiresManual: false,
    };
  }

  // CREATE EXTENSION [IF NOT EXISTS] <name> ...
  const createExt = normalized.match(
    /^CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)/i,
  );
  if (createExt) {
    const extName = extractIdentifier(createExt[1]);
    return {
      originalSql: sql,
      rollbackSql: `DROP EXTENSION IF EXISTS ${extName};`,
      requiresManual: false,
    };
  }

  // CREATE SEQUENCE [IF NOT EXISTS] <name>
  const createSeq = normalized.match(
    /^CREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+)/i,
  );
  if (createSeq) {
    return {
      originalSql: sql,
      rollbackSql: `DROP SEQUENCE IF EXISTS ${createSeq[1]};`,
      requiresManual: false,
    };
  }

  // CREATE [OR REPLACE] FUNCTION / TRIGGER / VIEW / PROCEDURE
  if (/^CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE|VIEW)\b/i.test(normalized)) {
    const kind = normalized.match(/^CREATE\s+(?:OR\s+REPLACE\s+)?(\w+)/i)?.[1] ?? 'OBJECT';
    const name = normalized.match(
      /^CREATE\s+(?:OR\s+REPLACE\s+)?\w+\s+(\S+)/i,
    )?.[1];
    return {
      originalSql: sql,
      rollbackSql: name ? `DROP ${kind.toUpperCase()} IF EXISTS ${name};` : null,
      requiresManual: !name,
      manualReason: !name ? `Could not extract name from CREATE ${kind}` : undefined,
    };
  }

  // CREATE TRIGGER <name> ...
  const createTrigger = normalized.match(
    /^CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+(\S+)\s+\w+\s+\w+\s+ON\s+(\S+)/i,
  );
  if (createTrigger) {
    const [, trigger, table] = createTrigger;
    return {
      originalSql: sql,
      rollbackSql: `DROP TRIGGER IF EXISTS ${trigger} ON ${table};`,
      requiresManual: false,
    };
  }

  // COMMENT ON — no rollback needed
  if (/^COMMENT\s+ON\b/i.test(upper)) {
    return {
      originalSql: sql,
      rollbackSql: null,
      requiresManual: false,
    };
  }

  // DROP TABLE — cannot auto-reverse (data is gone)
  if (/^DROP\s+TABLE\b/i.test(upper)) {
    return {
      originalSql: sql,
      rollbackSql: null,
      requiresManual: true,
      manualReason: 'Cannot auto-reverse DROP TABLE — data is permanently lost',
    };
  }

  // DROP COLUMN, TRUNCATE, ALTER COLUMN TYPE, DROP EXTENSION
  if (
    /^(?:ALTER\s+TABLE\s+\S+\s+)?DROP\s+COLUMN\b/i.test(upper) ||
    /^TRUNCATE\b/i.test(upper) ||
    /^ALTER\s+(?:TABLE\s+\S+\s+)?ALTER\s+COLUMN\s+\S+\s+TYPE\b/i.test(upper) ||
    /^DROP\s+EXTENSION\b/i.test(upper)
  ) {
    return {
      originalSql: sql,
      rollbackSql: null,
      requiresManual: true,
      manualReason: `Cannot auto-reverse: ${normalized.slice(0, 60)}`,
    };
  }

  // Fallback — we don't know how to reverse this
  return {
    originalSql: sql,
    rollbackSql: null,
    requiresManual: true,
    manualReason: `Unrecognized DDL — manual rollback required: ${normalized.slice(0, 80)}`,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function generateRollbackFile(upFilePath: string): RollbackReport {
  const content = readFileSync(upFilePath, 'utf-8');
  const stmts = splitStatements(content);
  const entries: RollbackEntry[] = [];

  for (const stmt of stmts) {
    const stripped = stmt.replace(/--[^\n]*/g, '').trim();
    if (!stripped || stripped === ';') continue;
    entries.push(rollbackForStatement(stmt));
  }

  // Build rollback filename from the migration number prefix
  const num = basename(upFilePath).match(/^(\d+)/)?.[1];
  if (!num) throw new Error(`Cannot extract migration number from: ${upFilePath}`);

  const rollbacksDir = join(dirname(resolve(upFilePath)), 'rollbacks');
  mkdirSync(rollbacksDir, { recursive: true });
  const outputFile = join(rollbacksDir, `${num}_rollback.sql`);

  // Build rollback SQL (reverse order so it unwinds correctly)
  const lines: string[] = [
    `-- Rollback for: ${basename(upFilePath)}`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- NOTE: Statements are in reverse order to correctly unwind the UP migration.`,
    '',
  ];

  const reversedEntries = [...entries].reverse();

  for (const entry of reversedEntries) {
    if (entry.requiresManual) {
      lines.push(
        `${MANUAL_ROLLBACK_MARKER}: Cannot auto-reverse the following statement`,
        `-- Original: ${entry.originalSql.replace(/\s+/g, ' ').slice(0, 100)}`,
        `-- Action needed: ${entry.manualReason ?? 'Review and implement manually'}`,
        '',
      );
    } else if (entry.rollbackSql) {
      lines.push(entry.rollbackSql, '');
    }
    // null rollbackSql with !requiresManual = no-op (e.g., COMMENT ON) — skip
  }

  writeFileSync(outputFile, lines.join('\n'), 'utf-8');

  const requiresManualReview = entries.some((e) => e.requiresManual);

  return {
    sourceFile: upFilePath,
    outputFile,
    entries,
    requiresManualReview,
  };
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

const [, , upFile] = process.argv;

if (!upFile) {
  console.error('Usage: generate-rollback.ts <migration.sql>');
  process.exit(1);
}

try {
  const report = generateRollbackFile(upFile);
  const status = report.requiresManualReview ? 'NEEDS REVIEW' : 'OK';
  console.log(`[${status}] Rollback written to: ${report.outputFile}`);

  if (report.requiresManualReview) {
    const manual = report.entries.filter((e) => e.requiresManual);
    console.log(`  ${manual.length} statement(s) require manual rollback:`);
    for (const e of manual) {
      console.log(`  - ${e.manualReason}`);
    }
  }

  // Output JSON for CI consumption
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
} catch (err) {
  console.error(`Error generating rollback: ${(err as Error).message}`);
  process.exit(1);
}
