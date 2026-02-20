/**
 * DDL risk classification patterns.
 * Rules are checked in priority order: DESTRUCTIVE → WARNING → SAFE.
 * First matching rule wins, so more specific patterns must come first.
 */

import type { RiskLevel } from './types.js';

export const OVERRIDE_COMMENT = '-- migration-safety:allow-destructive';
export const MANUAL_ROLLBACK_MARKER = '-- MANUAL ROLLBACK REQUIRED';

export interface PatternRule {
  pattern: RegExp;
  risk: RiskLevel;
  reason: string;
}

// Ordered: most specific / most dangerous first so first-match logic is correct.
export const DDL_PATTERNS: PatternRule[] = [
  // ─── DESTRUCTIVE ───────────────────────────────────────────────────────────

  {
    // ALTER TABLE x ALTER COLUMN y TYPE — table rewrite, long lock
    pattern: /ALTER\s+(?:TABLE\s+\S+\s+)?ALTER\s+COLUMN\s+\S+\s+TYPE\b/i,
    risk: 'DESTRUCTIVE',
    reason:
      'ALTER COLUMN TYPE may require a full table rewrite and acquires AccessExclusiveLock for minutes',
  },
  {
    pattern: /\bDROP\s+TABLE\b/i,
    risk: 'DESTRUCTIVE',
    reason: 'DROP TABLE permanently deletes the table and all its data',
  },
  {
    pattern: /\bDROP\s+COLUMN\b/i,
    risk: 'DESTRUCTIVE',
    reason: 'DROP COLUMN permanently removes column data with no auto-recovery',
  },
  {
    pattern: /\bTRUNCATE\b/i,
    risk: 'DESTRUCTIVE',
    reason: 'TRUNCATE deletes all rows permanently',
  },
  {
    pattern: /\bDROP\s+EXTENSION\b/i,
    risk: 'DESTRUCTIVE',
    reason:
      'DROP EXTENSION cascades to all dependent columns, indexes, and functions',
  },
  {
    pattern: /\bALTER\s+EXTENSION\b/i,
    risk: 'DESTRUCTIVE',
    reason: 'ALTER EXTENSION can break dependent objects',
  },
  {
    // DROP INDEX without IF EXISTS is risky in automated pipelines
    pattern: /\bDROP\s+INDEX\b/i,
    risk: 'DESTRUCTIVE',
    reason:
      'DROP INDEX removes query optimization; may degrade performance or break constraints',
  },

  // ─── WARNING ───────────────────────────────────────────────────────────────

  {
    // CREATE EXTENSION — may need superuser
    pattern: /\bCREATE\s+EXTENSION\b/i,
    risk: 'WARNING',
    reason:
      'CREATE EXTENSION may require superuser privileges; verify host supports this',
  },
  {
    // ADD COLUMN NOT NULL without DEFAULT will fail on non-empty tables (PG < 11 or strict)
    pattern: /\bADD\s+COLUMN\b.*\bNOT\s+NULL\b/i,
    risk: 'WARNING',
    reason:
      'ADD COLUMN NOT NULL may fail if the table has existing rows and no DEFAULT is supplied',
  },
  {
    // CREATE UNIQUE INDEX — full scan + fails on duplicate data
    pattern: /\bCREATE\s+UNIQUE\s+INDEX\b/i,
    risk: 'WARNING',
    reason:
      'CREATE UNIQUE INDEX requires a full table scan and fails if duplicate data exists',
  },
  {
    // ALTER COLUMN (any other change) — may lock table
    pattern: /\bALTER\s+COLUMN\b/i,
    risk: 'WARNING',
    reason:
      'ALTER COLUMN acquires AccessExclusiveLock; assess duration based on table size',
  },
  {
    // CREATE INDEX without CONCURRENTLY — blocks writes
    pattern: /\bCREATE\s+INDEX\b(?!\s+CONCURRENTLY)/i,
    risk: 'WARNING',
    reason:
      'CREATE INDEX without CONCURRENTLY acquires ShareLock and blocks writes during build',
  },
  {
    // pgvector dimension specification — silent truncation risk
    pattern: /\bvector\s*\(\s*\d+\s*\)/i,
    risk: 'WARNING',
    reason:
      'vector(N) dimension change risks silent embedding truncation and requires index rebuild',
  },

  // ─── SAFE ──────────────────────────────────────────────────────────────────

  {
    pattern: /\bCREATE\s+INDEX\s+CONCURRENTLY\b/i,
    risk: 'SAFE',
    reason: 'CREATE INDEX CONCURRENTLY is non-blocking',
  },
  {
    pattern: /\bCREATE\s+(?:UNLOGGED\s+)?TABLE\b/i,
    risk: 'SAFE',
    reason: 'CREATE TABLE is additive and non-destructive',
  },
  {
    // ADD COLUMN (nullable, no NOT NULL) — metadata-only in PG 11+
    pattern: /\bADD\s+COLUMN\b/i,
    risk: 'SAFE',
    reason: 'ADD COLUMN (nullable) is a metadata-only change in PG 11+',
  },
  {
    pattern: /\bCOMMENT\s+ON\b/i,
    risk: 'SAFE',
    reason: 'COMMENT ON is non-destructive',
  },
  {
    pattern: /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE|TRIGGER|VIEW|SEQUENCE)\b/i,
    risk: 'SAFE',
    reason: 'CREATE OR REPLACE is idempotent and non-destructive',
  },
  {
    pattern: /\bALTER\s+TABLE\b.*\bADD\s+CONSTRAINT\b/i,
    risk: 'WARNING',
    reason:
      'ADD CONSTRAINT acquires a lock and scans existing rows for violations',
  },
];

/**
 * Classify a single SQL statement.
 * Checks DESTRUCTIVE patterns first, then WARNING, then SAFE.
 * Returns 'SAFE' for unrecognized statements.
 */
export function classifyStatement(sql: string): {
  risk: RiskLevel;
  reason: string;
} {
  // Normalize whitespace for pattern matching
  const normalized = sql.replace(/\s+/g, ' ').trim().toUpperCase();

  // Build ordered list: DESTRUCTIVE first, WARNING second, SAFE last
  const ordered: PatternRule[] = [
    ...DDL_PATTERNS.filter((p) => p.risk === 'DESTRUCTIVE'),
    ...DDL_PATTERNS.filter((p) => p.risk === 'WARNING'),
    ...DDL_PATTERNS.filter((p) => p.risk === 'SAFE'),
  ];

  for (const rule of ordered) {
    if (rule.pattern.test(normalized)) {
      return { risk: rule.risk, reason: rule.reason };
    }
  }

  return { risk: 'SAFE', reason: 'Unrecognized DDL — assumed safe' };
}

/**
 * Combine two risk levels, returning the more severe.
 */
export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  const rank: Record<RiskLevel, number> = { SAFE: 0, WARNING: 1, DESTRUCTIVE: 2 };
  return rank[a] >= rank[b] ? a : b;
}
