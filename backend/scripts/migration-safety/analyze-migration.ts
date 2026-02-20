#!/usr/bin/env tsx
/**
 * analyze-migration.ts
 *
 * Classifies DDL risk for Drizzle migration SQL files.
 *
 * Usage:
 *   tsx analyze-migration.ts [--warn-only] <file.sql> [<file2.sql> ...]
 *
 * Exit codes:
 *   0 — all files are SAFE or WARNING (or DESTRUCTIVE with override or --warn-only)
 *   1 — one or more files are DESTRUCTIVE without override
 *
 * Designed to be called from lint-staged (--warn-only) and CI (strict mode).
 */

import { readFileSync } from 'fs';
import { basename } from 'path';
import { classifyStatement, maxRisk, OVERRIDE_COMMENT } from './patterns.js';
import type { AnalysisReport, RiskLevel, StatementAnalysis } from './types.js';

// ─── SQL Parser ──────────────────────────────────────────────────────────────

interface SqlStatement {
  sql: string;
  line: number;
}

/**
 * Split SQL content into individual statements, tracking source line numbers.
 * Handles: line comments, block comments, single-quoted strings, dollar-quoted strings.
 */
function splitStatements(content: string): SqlStatement[] {
  const results: SqlStatement[] = [];
  let buffer = '';
  let lineNum = 1;
  let stmtStartLine = 1;
  let inString = false;
  let inDollarQuote = false;
  let dollarTag = '';
  let i = 0;

  const flush = (): void => {
    const trimmed = buffer.trim();
    // Only push if there's real content (not just comments)
    if (trimmed && !/^--/.test(trimmed) && trimmed !== ';') {
      results.push({ sql: trimmed, line: stmtStartLine });
    }
    buffer = '';
    stmtStartLine = lineNum;
  };

  while (i < content.length) {
    const ch = content[i];
    if (ch === '\n') lineNum++;

    // ── Inside dollar-quoted string ──────────────────────────────────────────
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

    // ── Inside single-quoted string ──────────────────────────────────────────
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

    // ── Dollar-quote start ───────────────────────────────────────────────────
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

    // ── Single-quote start ───────────────────────────────────────────────────
    if (ch === "'") {
      inString = true;
      buffer += ch;
      i++;
      continue;
    }

    // ── Line comment ─────────────────────────────────────────────────────────
    if (ch === '-' && content[i + 1] === '-') {
      let j = i;
      while (j < content.length && content[j] !== '\n') j++;
      buffer += content.slice(i, j); // preserve comment in buffer (for override detection)
      i = j;
      continue;
    }

    // ── Block comment ────────────────────────────────────────────────────────
    if (ch === '/' && content[i + 1] === '*') {
      const closeIdx = content.indexOf('*/', i + 2);
      const end = closeIdx === -1 ? content.length : closeIdx + 2;
      for (let k = i; k < end; k++) {
        if (content[k] === '\n') lineNum++;
      }
      buffer += content.slice(i, end);
      i = end;
      continue;
    }

    // ── Statement terminator ─────────────────────────────────────────────────
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
  if (trimmed && trimmed !== ';') {
    results.push({ sql: trimmed, line: stmtStartLine });
  }

  return results;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

function analyzeFile(filePath: string): AnalysisReport {
  const content = readFileSync(filePath, 'utf-8');
  const hasOverride = content.includes(OVERRIDE_COMMENT);
  const stmts = splitStatements(content);
  const statementResults: StatementAnalysis[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  let fileRisk: RiskLevel = 'SAFE';

  for (const { sql, line } of stmts) {
    // Skip pure comment lines
    const stripped = sql.replace(/--[^\n]*/g, '').trim();
    if (!stripped || stripped === ';') continue;

    const { risk, reason } = classifyStatement(sql);
    statementResults.push({ line, sql: sql.slice(0, 120), risk, reason });
    fileRisk = maxRisk(fileRisk, risk);

    if (risk === 'DESTRUCTIVE') {
      blockers.push(`Line ${line}: ${reason}`);
    } else if (risk === 'WARNING') {
      warnings.push(`Line ${line}: ${reason}`);
    }
  }

  return {
    file: basename(filePath),
    riskLevel: fileRisk,
    statements: statementResults,
    warnings,
    blockers,
    hasOverride,
  };
}

// ─── Console Output ───────────────────────────────────────────────────────────

const COLOR = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
};

function colorForRisk(risk: RiskLevel): string {
  if (risk === 'DESTRUCTIVE') return COLOR.red;
  if (risk === 'WARNING') return COLOR.yellow;
  return COLOR.green;
}

function printReport(report: AnalysisReport, warnOnly: boolean): void {
  const col = colorForRisk(report.riskLevel);
  const override =
    report.hasOverride && report.riskLevel === 'DESTRUCTIVE'
      ? ` ${COLOR.dim}[override: allowed-destructive]${COLOR.reset}`
      : '';

  console.error(
    `\n${COLOR.bold}${col}[${report.riskLevel}]${COLOR.reset} ${COLOR.bold}${report.file}${COLOR.reset}${override}`,
  );

  for (const stmt of report.statements) {
    if (stmt.risk === 'SAFE') continue;
    const c = colorForRisk(stmt.risk);
    const preview = stmt.sql.replace(/\s+/g, ' ').slice(0, 80);
    console.error(
      `  ${c}${stmt.risk}${COLOR.reset} line ${stmt.line}: ${COLOR.dim}${preview}${COLOR.reset}`,
    );
    console.error(`    ${COLOR.dim}↳ ${stmt.reason}${COLOR.reset}`);
  }

  if (report.riskLevel === 'DESTRUCTIVE' && !report.hasOverride && !warnOnly) {
    console.error(
      `\n  ${COLOR.red}${COLOR.bold}BLOCKED${COLOR.reset} — add \`${OVERRIDE_COMMENT}\` to the SQL file to allow this migration.\n`,
    );
  }
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const warnOnly = args.includes('--warn-only');
const files = args.filter((a) => !a.startsWith('--'));

if (files.length === 0) {
  console.error('Usage: analyze-migration.ts [--warn-only] <file.sql> ...');
  process.exit(1);
}

let exitCode = 0;
const allReports: AnalysisReport[] = [];

for (const file of files) {
  try {
    const report = analyzeFile(file);
    allReports.push(report);
    printReport(report, warnOnly);

    if (report.riskLevel === 'DESTRUCTIVE' && !report.hasOverride && !warnOnly) {
      exitCode = 1;
    }

    // Emit JSON to stdout for CI to capture
    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    console.error(`Error analyzing ${file}: ${(err as Error).message}`);
    exitCode = 1;
  }
}

// Summary line to stderr (human-readable)
const maxLevel = allReports.reduce<RiskLevel>(
  (acc, r) => maxRisk(acc, r.riskLevel),
  'SAFE',
);
console.error(
  `\n${COLOR.bold}Migration safety: ${colorForRisk(maxLevel)}${maxLevel}${COLOR.reset} across ${allReports.length} file(s)\n`,
);

process.exit(exitCode);
