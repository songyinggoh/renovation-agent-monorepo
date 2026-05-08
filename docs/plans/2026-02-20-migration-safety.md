# Migration Safety Agent — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent destructive database migrations from reaching production without review, auto-generate validated rollbacks, and provide intelligent semantic migration analysis via a Claude agent.

**Architecture:** Three TypeScript scripts handle deterministic checks (DDL risk classification, rollback generation, rollback validation). CI pipeline gains a migration-safety job on PRs and a production environment gate on deploy. A Claude agent provides semantic review for issues scripts can't catch.

**Tech Stack:** TypeScript (tsx), Vitest, GitHub Actions, PostgreSQL service containers, Husky/lint-staged, drizzle-kit

---

## Task 1: Shared Types and DDL Pattern Definitions

**Files:**
- Create: `backend/scripts/migration-safety/types.ts`
- Create: `backend/scripts/migration-safety/patterns.ts`
- Test: `backend/tests/unit/scripts/migration-safety/patterns.test.ts`

### Step 1: Write the failing test for DDL pattern classification

```typescript
// backend/tests/unit/scripts/migration-safety/patterns.test.ts
import { describe, it, expect } from 'vitest';
import { classifyStatement } from '../../../scripts/migration-safety/patterns.js';

describe('classifyStatement', () => {
  describe('SAFE operations', () => {
    it('classifies CREATE TABLE as SAFE', () => {
      expect(classifyStatement('CREATE TABLE IF NOT EXISTS foo (id UUID PRIMARY KEY)')).toBe('SAFE');
    });

    it('classifies CREATE INDEX as SAFE', () => {
      expect(classifyStatement('CREATE INDEX IF NOT EXISTS idx_foo ON bar(col)')).toBe('SAFE');
    });

    it('classifies ADD COLUMN (nullable) as SAFE', () => {
      expect(classifyStatement('ALTER TABLE foo ADD COLUMN bar TEXT')).toBe('SAFE');
    });

    it('classifies COMMENT ON as SAFE', () => {
      expect(classifyStatement("COMMENT ON TABLE foo IS 'description'")).toBe('SAFE');
    });

    it('classifies CREATE INDEX CONCURRENTLY as SAFE', () => {
      expect(classifyStatement('CREATE INDEX CONCURRENTLY idx_foo ON bar(col)')).toBe('SAFE');
    });
  });

  describe('WARNING operations', () => {
    it('classifies ADD COLUMN NOT NULL as WARNING', () => {
      expect(classifyStatement('ALTER TABLE foo ADD COLUMN bar TEXT NOT NULL')).toBe('WARNING');
    });

    it('classifies ADD COLUMN NOT NULL with DEFAULT as SAFE', () => {
      expect(classifyStatement("ALTER TABLE foo ADD COLUMN bar TEXT NOT NULL DEFAULT 'baz'")).toBe('SAFE');
    });

    it('classifies ALTER COLUMN as WARNING', () => {
      expect(classifyStatement('ALTER TABLE foo ALTER COLUMN bar SET NOT NULL')).toBe('WARNING');
    });

    it('classifies CREATE UNIQUE INDEX as WARNING', () => {
      expect(classifyStatement('CREATE UNIQUE INDEX idx_foo ON bar(col)')).toBe('WARNING');
    });

    it('classifies CREATE EXTENSION as WARNING', () => {
      expect(classifyStatement('CREATE EXTENSION IF NOT EXISTS vector')).toBe('WARNING');
    });
  });

  describe('DESTRUCTIVE operations', () => {
    it('classifies DROP TABLE as DESTRUCTIVE', () => {
      expect(classifyStatement('DROP TABLE IF EXISTS foo')).toBe('DESTRUCTIVE');
    });

    it('classifies DROP COLUMN as DESTRUCTIVE', () => {
      expect(classifyStatement('ALTER TABLE foo DROP COLUMN bar')).toBe('DESTRUCTIVE');
    });

    it('classifies ALTER TYPE as DESTRUCTIVE', () => {
      expect(classifyStatement('ALTER TABLE foo ALTER COLUMN bar TYPE INTEGER USING bar::integer')).toBe('DESTRUCTIVE');
    });

    it('classifies DROP INDEX as DESTRUCTIVE', () => {
      expect(classifyStatement('DROP INDEX IF EXISTS idx_foo')).toBe('DESTRUCTIVE');
    });

    it('classifies TRUNCATE as DESTRUCTIVE', () => {
      expect(classifyStatement('TRUNCATE TABLE foo')).toBe('DESTRUCTIVE');
    });

    it('classifies DROP EXTENSION as DESTRUCTIVE', () => {
      expect(classifyStatement('DROP EXTENSION IF EXISTS vector')).toBe('DESTRUCTIVE');
    });

    it('classifies ALTER EXTENSION as DESTRUCTIVE', () => {
      expect(classifyStatement('ALTER EXTENSION vector UPDATE TO "0.8.0"')).toBe('DESTRUCTIVE');
    });
  });

  describe('pgvector-specific', () => {
    it('classifies vector dimension change as DESTRUCTIVE', () => {
      expect(classifyStatement('ALTER TABLE foo ALTER COLUMN embedding TYPE vector(768)')).toBe('DESTRUCTIVE');
    });
  });

  describe('override comment', () => {
    it('classifies overridden DESTRUCTIVE as WARNING', () => {
      const sql = '-- migration-safety:allow-destructive\nDROP TABLE IF EXISTS foo';
      expect(classifyStatement(sql)).toBe('WARNING');
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd backend && npx vitest run tests/unit/scripts/migration-safety/patterns.test.ts`
Expected: FAIL — module not found

### Step 3: Create shared types

```typescript
// backend/scripts/migration-safety/types.ts

export type RiskLevel = 'SAFE' | 'WARNING' | 'DESTRUCTIVE';

export interface StatementAnalysis {
  line: number;
  sql: string;
  risk: RiskLevel;
  reason: string;
}

export interface MigrationReport {
  file: string;
  riskLevel: RiskLevel;
  statements: StatementAnalysis[];
  warnings: string[];
  blockers: string[];
}

export interface RollbackResult {
  inputFile: string;
  outputFile: string;
  statements: string[];
  manualRequired: string[];
}
```

### Step 4: Implement DDL patterns and classifier

```typescript
// backend/scripts/migration-safety/patterns.ts

import type { RiskLevel } from './types.js';

const OVERRIDE_COMMENT = '-- migration-safety:allow-destructive';

interface PatternRule {
  pattern: RegExp;
  risk: RiskLevel;
  reason: string;
}

// Order matters — first match wins. More specific rules come first.
const RULES: PatternRule[] = [
  // DESTRUCTIVE — must be before less-specific matches
  { pattern: /DROP\s+TABLE/i, risk: 'DESTRUCTIVE', reason: 'Drops an entire table and all its data' },
  { pattern: /DROP\s+COLUMN/i, risk: 'DESTRUCTIVE', reason: 'Drops a column and all its data' },
  { pattern: /ALTER\s+COLUMN\s+\w+\s+TYPE\b/i, risk: 'DESTRUCTIVE', reason: 'ALTER TYPE may rewrite the table and break dependent indexes' },
  { pattern: /ALTER\s+TABLE\s+\w+\s+ALTER\s+COLUMN\s+\w+\s+TYPE\b/i, risk: 'DESTRUCTIVE', reason: 'ALTER TYPE may rewrite the table and break dependent indexes' },
  { pattern: /DROP\s+INDEX/i, risk: 'DESTRUCTIVE', reason: 'Drops an index — queries relying on it will degrade' },
  { pattern: /TRUNCATE/i, risk: 'DESTRUCTIVE', reason: 'Deletes all rows from the table' },
  { pattern: /DROP\s+EXTENSION/i, risk: 'DESTRUCTIVE', reason: 'Drops extension — cascades to dependent columns and indexes' },
  { pattern: /ALTER\s+EXTENSION/i, risk: 'DESTRUCTIVE', reason: 'Alters extension — may break dependent objects' },

  // pgvector-specific: vector dimension changes look like ALTER COLUMN TYPE
  { pattern: /TYPE\s+vector\s*\(\d+\)/i, risk: 'DESTRUCTIVE', reason: 'Vector dimension change may silently truncate embeddings and requires index rebuild' },

  // WARNING
  { pattern: /ADD\s+COLUMN\s+\w+\s+\w+.*NOT\s+NULL(?!.*DEFAULT)/i, risk: 'WARNING', reason: 'NOT NULL column without DEFAULT will fail on populated tables' },
  { pattern: /ALTER\s+COLUMN.*SET\s+NOT\s+NULL/i, risk: 'WARNING', reason: 'Setting NOT NULL may fail if existing rows have NULL values' },
  { pattern: /ALTER\s+COLUMN/i, risk: 'WARNING', reason: 'Column alteration — verify impact on existing data' },
  { pattern: /CREATE\s+UNIQUE\s+INDEX/i, risk: 'WARNING', reason: 'Unique index creation will fail if duplicates exist' },
  { pattern: /CREATE\s+EXTENSION/i, risk: 'WARNING', reason: 'Extension creation may require superuser privileges' },

  // SAFE
  { pattern: /CREATE\s+TABLE/i, risk: 'SAFE', reason: 'Creates a new table' },
  { pattern: /CREATE\s+INDEX\s+CONCURRENTLY/i, risk: 'SAFE', reason: 'Non-blocking index creation' },
  { pattern: /CREATE\s+INDEX/i, risk: 'SAFE', reason: 'Creates an index' },
  { pattern: /ADD\s+COLUMN/i, risk: 'SAFE', reason: 'Adds a nullable column' },
  { pattern: /ADD\s+CONSTRAINT/i, risk: 'SAFE', reason: 'Adds a constraint' },
  { pattern: /COMMENT\s+ON/i, risk: 'SAFE', reason: 'Adds a comment' },
];

export function classifyStatement(sql: string): RiskLevel {
  const hasOverride = sql.includes(OVERRIDE_COMMENT);
  // Strip comments for analysis
  const stripped = sql.replace(/--.*$/gm, '').trim();

  if (!stripped) return 'SAFE';

  for (const rule of RULES) {
    if (rule.pattern.test(stripped)) {
      if (rule.risk === 'DESTRUCTIVE' && hasOverride) {
        return 'WARNING';
      }
      return rule.risk;
    }
  }

  return 'SAFE';
}

export function classifyStatementWithReason(sql: string): { risk: RiskLevel; reason: string } {
  const hasOverride = sql.includes(OVERRIDE_COMMENT);
  const stripped = sql.replace(/--.*$/gm, '').trim();

  if (!stripped) return { risk: 'SAFE', reason: 'Empty or comment-only statement' };

  for (const rule of RULES) {
    if (rule.pattern.test(stripped)) {
      const risk = (rule.risk === 'DESTRUCTIVE' && hasOverride) ? 'WARNING' : rule.risk;
      const reason = hasOverride && rule.risk === 'DESTRUCTIVE'
        ? `${rule.reason} (override acknowledged)`
        : rule.reason;
      return { risk, reason };
    }
  }

  return { risk: 'SAFE', reason: 'No known risk pattern detected' };
}

export { OVERRIDE_COMMENT };
```

### Step 5: Run tests to verify they pass

Run: `cd backend && npx vitest run tests/unit/scripts/migration-safety/patterns.test.ts`
Expected: ALL PASS

### Step 6: Commit

```bash
git add backend/scripts/migration-safety/types.ts backend/scripts/migration-safety/patterns.ts backend/tests/unit/scripts/migration-safety/patterns.test.ts
git commit -m "feat(migration-safety): add DDL risk classifier with pgvector awareness"
```

---

## Task 2: Migration Analyzer Script

**Files:**
- Create: `backend/scripts/migration-safety/analyze-migration.ts`
- Test: `backend/tests/unit/scripts/migration-safety/analyze-migration.test.ts`

### Step 1: Write the failing test

```typescript
// backend/tests/unit/scripts/migration-safety/analyze-migration.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeMigrationSql } from '../../../scripts/migration-safety/analyze-migration.js';

describe('analyzeMigrationSql', () => {
  it('reports SAFE for a create-table migration', () => {
    const sql = `CREATE TABLE IF NOT EXISTS foo (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL DEFAULT ''
    );`;
    const report = analyzeMigrationSql(sql, '0008_test.sql');
    expect(report.riskLevel).toBe('SAFE');
    expect(report.blockers).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });

  it('reports WARNING for NOT NULL without DEFAULT', () => {
    const sql = 'ALTER TABLE foo ADD COLUMN bar TEXT NOT NULL;';
    const report = analyzeMigrationSql(sql, '0008_test.sql');
    expect(report.riskLevel).toBe('WARNING');
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it('reports DESTRUCTIVE for DROP TABLE', () => {
    const sql = 'DROP TABLE IF EXISTS foo;';
    const report = analyzeMigrationSql(sql, '0008_test.sql');
    expect(report.riskLevel).toBe('DESTRUCTIVE');
    expect(report.blockers.length).toBeGreaterThan(0);
  });

  it('downgrades DESTRUCTIVE to WARNING with override', () => {
    const sql = '-- migration-safety:allow-destructive\nDROP TABLE IF EXISTS foo;';
    const report = analyzeMigrationSql(sql, '0008_test.sql');
    expect(report.riskLevel).toBe('WARNING');
    expect(report.blockers).toHaveLength(0);
  });

  it('combines risks — highest wins', () => {
    const sql = `CREATE TABLE foo (id UUID PRIMARY KEY);
ALTER TABLE bar DROP COLUMN baz;`;
    const report = analyzeMigrationSql(sql, '0008_test.sql');
    expect(report.riskLevel).toBe('DESTRUCTIVE');
  });

  it('handles no-op migrations', () => {
    const sql = '-- No-op: already applied';
    const report = analyzeMigrationSql(sql, '0004_noop.sql');
    expect(report.riskLevel).toBe('SAFE');
  });

  it('flags CREATE EXTENSION as WARNING', () => {
    const sql = 'CREATE EXTENSION IF NOT EXISTS vector;';
    const report = analyzeMigrationSql(sql, '0009_pgvector.sql');
    expect(report.riskLevel).toBe('WARNING');
    expect(report.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('superuser')])
    );
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd backend && npx vitest run tests/unit/scripts/migration-safety/analyze-migration.test.ts`
Expected: FAIL — module not found

### Step 3: Implement the analyzer

```typescript
// backend/scripts/migration-safety/analyze-migration.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { classifyStatementWithReason } from './patterns.js';
import type { MigrationReport, RiskLevel, StatementAnalysis } from './types.js';

/**
 * Split SQL content into individual statements.
 * Handles multi-line statements separated by semicolons.
 */
function splitStatements(sql: string): { line: number; sql: string }[] {
  const results: { line: number; sql: string }[] = [];
  const lines = sql.split('\n');
  let current = '';
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip pure comment lines and empty lines when building a statement
    if (!current && (line.startsWith('--') || !line)) {
      continue;
    }

    if (!current) {
      startLine = i + 1;
    }

    current += (current ? '\n' : '') + lines[i];

    if (line.endsWith(';')) {
      results.push({ line: startLine, sql: current.trim() });
      current = '';
    }
  }

  // Catch any trailing statement without semicolon
  if (current.trim()) {
    results.push({ line: startLine, sql: current.trim() });
  }

  return results;
}

const RISK_PRIORITY: Record<RiskLevel, number> = {
  SAFE: 0,
  WARNING: 1,
  DESTRUCTIVE: 2,
};

/**
 * Analyze raw SQL content and return a structured risk report.
 */
export function analyzeMigrationSql(sqlContent: string, fileName: string): MigrationReport {
  const statements = splitStatements(sqlContent);
  const analyzed: StatementAnalysis[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  let overallRisk: RiskLevel = 'SAFE';

  // Check for file-level override
  const hasFileOverride = sqlContent.includes('-- migration-safety:allow-destructive');

  for (const stmt of statements) {
    // Pass the override context along with the statement
    const fullSql = hasFileOverride
      ? `-- migration-safety:allow-destructive\n${stmt.sql}`
      : stmt.sql;
    const { risk, reason } = classifyStatementWithReason(fullSql);

    analyzed.push({ line: stmt.line, sql: stmt.sql, risk, reason });

    if (RISK_PRIORITY[risk] > RISK_PRIORITY[overallRisk]) {
      overallRisk = risk;
    }

    if (risk === 'WARNING') {
      warnings.push(`Line ${stmt.line}: ${reason}`);
    }
    if (risk === 'DESTRUCTIVE') {
      blockers.push(`Line ${stmt.line}: ${reason}`);
    }
  }

  return {
    file: fileName,
    riskLevel: overallRisk,
    statements: analyzed,
    warnings,
    blockers,
  };
}

/**
 * Analyze a migration file from disk.
 */
export function analyzeMigrationFile(filePath: string): MigrationReport {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  return analyzeMigrationSql(content, fileName);
}

/**
 * CLI entry point. Accepts file paths as arguments.
 * --warn-only: exit 0 even if DESTRUCTIVE (for pre-commit hook)
 * Exits 1 if any DESTRUCTIVE without --warn-only.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const warnOnly = args.includes('--warn-only');
  const files = args.filter((a) => !a.startsWith('--'));

  if (files.length === 0) {
    console.log('Usage: analyze-migration.ts [--warn-only] <file1.sql> [file2.sql ...]');
    process.exit(0);
  }

  let hasBlocker = false;

  for (const file of files) {
    const report = analyzeMigrationFile(file);
    console.log(JSON.stringify(report, null, 2));

    if (report.riskLevel === 'DESTRUCTIVE') {
      hasBlocker = true;
    }
  }

  if (hasBlocker && !warnOnly) {
    console.error('\nBLOCKED: Destructive operations detected. Add "-- migration-safety:allow-destructive" to override.');
    process.exit(1);
  }
}

// Only run CLI when executed directly
const isDirectRun = process.argv[1]?.includes('analyze-migration');
if (isDirectRun) {
  main();
}
```

### Step 4: Run tests to verify they pass

Run: `cd backend && npx vitest run tests/unit/scripts/migration-safety/analyze-migration.test.ts`
Expected: ALL PASS

### Step 5: Commit

```bash
git add backend/scripts/migration-safety/analyze-migration.ts backend/tests/unit/scripts/migration-safety/analyze-migration.test.ts
git commit -m "feat(migration-safety): add migration analyzer with CLI entry point"
```

---

## Task 3: Rollback Generator

**Files:**
- Create: `backend/scripts/migration-safety/generate-rollback.ts`
- Test: `backend/tests/unit/scripts/migration-safety/generate-rollback.test.ts`

### Step 1: Write the failing test

```typescript
// backend/tests/unit/scripts/migration-safety/generate-rollback.test.ts
import { describe, it, expect } from 'vitest';
import { generateRollbackSql } from '../../../scripts/migration-safety/generate-rollback.js';

describe('generateRollbackSql', () => {
  it('reverses CREATE TABLE', () => {
    const up = 'CREATE TABLE IF NOT EXISTS foo (id UUID PRIMARY KEY);';
    const result = generateRollbackSql(up);
    expect(result.statements).toContain('DROP TABLE IF EXISTS foo;');
    expect(result.manualRequired).toHaveLength(0);
  });

  it('reverses CREATE TABLE without IF NOT EXISTS', () => {
    const up = 'CREATE TABLE foo (id UUID PRIMARY KEY);';
    const result = generateRollbackSql(up);
    expect(result.statements).toContain('DROP TABLE IF EXISTS foo;');
  });

  it('reverses ADD COLUMN', () => {
    const up = 'ALTER TABLE foo ADD COLUMN bar TEXT NOT NULL;';
    const result = generateRollbackSql(up);
    expect(result.statements).toContain('ALTER TABLE foo DROP COLUMN IF EXISTS bar;');
  });

  it('reverses CREATE INDEX', () => {
    const up = 'CREATE INDEX IF NOT EXISTS idx_foo ON bar(col);';
    const result = generateRollbackSql(up);
    expect(result.statements).toContain('DROP INDEX IF EXISTS idx_foo;');
  });

  it('reverses CREATE INDEX CONCURRENTLY', () => {
    const up = 'CREATE INDEX CONCURRENTLY idx_foo ON bar(col);';
    const result = generateRollbackSql(up);
    expect(result.statements).toContain('DROP INDEX IF EXISTS idx_foo;');
  });

  it('reverses ADD CONSTRAINT', () => {
    const up = "ALTER TABLE foo ADD CONSTRAINT check_bar CHECK (bar IN ('a','b'));";
    const result = generateRollbackSql(up);
    expect(result.statements).toContain('ALTER TABLE foo DROP CONSTRAINT IF EXISTS check_bar;');
  });

  it('reverses CREATE EXTENSION', () => {
    const up = 'CREATE EXTENSION IF NOT EXISTS vector;';
    const result = generateRollbackSql(up);
    expect(result.statements).toContain('DROP EXTENSION IF EXISTS vector;');
  });

  it('skips COMMENT ON (no-op rollback)', () => {
    const up = "COMMENT ON TABLE foo IS 'a description';";
    const result = generateRollbackSql(up);
    expect(result.statements).toHaveLength(0);
  });

  it('marks ALTER TYPE as manual', () => {
    const up = 'ALTER TABLE foo ALTER COLUMN bar TYPE INTEGER USING bar::integer;';
    const result = generateRollbackSql(up);
    expect(result.manualRequired.length).toBeGreaterThan(0);
    expect(result.manualRequired[0]).toContain('ALTER');
  });

  it('handles multi-statement migrations', () => {
    const up = `CREATE TABLE foo (id UUID PRIMARY KEY);
CREATE INDEX idx_foo ON foo(id);
ALTER TABLE foo ADD COLUMN bar TEXT;`;
    const result = generateRollbackSql(up);
    // Rollback should be in REVERSE order
    expect(result.statements[0]).toContain('DROP COLUMN');
    expect(result.statements[1]).toContain('DROP INDEX');
    expect(result.statements[2]).toContain('DROP TABLE');
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd backend && npx vitest run tests/unit/scripts/migration-safety/generate-rollback.test.ts`
Expected: FAIL — module not found

### Step 3: Implement the rollback generator

```typescript
// backend/scripts/migration-safety/generate-rollback.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RollbackResult } from './types.js';

interface RollbackRule {
  pattern: RegExp;
  generate: (match: RegExpMatchArray) => string | null;
  manualReason?: string;
}

const ROLLBACK_RULES: RollbackRule[] = [
  {
    // CREATE TABLE [IF NOT EXISTS] <name>
    pattern: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i,
    generate: (m) => `DROP TABLE IF EXISTS ${m[1]};`,
  },
  {
    // ALTER TABLE <table> ADD COLUMN <column>
    pattern: /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i,
    generate: (m) => `ALTER TABLE ${m[1]} DROP COLUMN IF EXISTS ${m[2]};`,
  },
  {
    // CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] <name>
    pattern: /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i,
    generate: (m) => `DROP INDEX IF EXISTS ${m[1]};`,
  },
  {
    // ALTER TABLE <table> ADD CONSTRAINT <name>
    pattern: /ALTER\s+TABLE\s+(\w+)\s+ADD\s+CONSTRAINT\s+(\w+)/i,
    generate: (m) => `ALTER TABLE ${m[1]} DROP CONSTRAINT IF EXISTS ${m[2]};`,
  },
  {
    // CREATE EXTENSION [IF NOT EXISTS] <name>
    pattern: /CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i,
    generate: (m) => `DROP EXTENSION IF EXISTS ${m[1]};`,
  },
  {
    // COMMENT ON — no rollback needed
    pattern: /COMMENT\s+ON/i,
    generate: () => null,
  },
  {
    // ALTER TABLE <table> ALTER COLUMN <col> TYPE — requires manual rollback
    pattern: /ALTER\s+TABLE\s+(\w+)\s+ALTER\s+COLUMN\s+(\w+)\s+TYPE/i,
    generate: () => null,
    manualReason: 'Cannot auto-reverse ALTER TYPE — original type and data conversion unknown',
  },
  {
    // INSERT / UPDATE / DELETE — data mutations require manual rollback
    pattern: /^(INSERT|UPDATE|DELETE)\b/i,
    generate: () => null,
    manualReason: 'Data mutation cannot be auto-reversed',
  },
];

/**
 * Split SQL into statements (same logic as analyze-migration).
 */
function splitStatements(sql: string): string[] {
  const results: string[] = [];
  const lines = sql.split('\n');
  let current = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!current && (line.startsWith('--') || !line)) continue;

    current += (current ? '\n' : '') + rawLine;

    if (line.endsWith(';')) {
      results.push(current.trim());
      current = '';
    }
  }

  if (current.trim()) results.push(current.trim());
  return results;
}

/**
 * Generate rollback SQL from an UP migration's raw SQL content.
 */
export function generateRollbackSql(upSql: string): RollbackResult {
  const statements = splitStatements(upSql);
  const rollbackStatements: string[] = [];
  const manualRequired: string[] = [];

  // Process in forward order, then reverse the rollback statements
  for (const stmt of statements) {
    let matched = false;

    for (const rule of ROLLBACK_RULES) {
      const match = stmt.match(rule.pattern);
      if (match) {
        const rollback = rule.generate(match);
        if (rollback) {
          rollbackStatements.push(rollback);
        }
        if (rule.manualReason) {
          manualRequired.push(`-- MANUAL ROLLBACK REQUIRED: ${rule.manualReason}\n-- Original: ${stmt.split('\n')[0]}`);
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Unknown statement — flag for manual review if non-trivial
      const stripped = stmt.replace(/--.*$/gm, '').trim();
      if (stripped && !stripped.startsWith('--')) {
        manualRequired.push(`-- MANUAL REVIEW: Unrecognized statement\n-- Original: ${stmt.split('\n')[0]}`);
      }
    }
  }

  // Reverse order for rollback (undo last change first)
  rollbackStatements.reverse();

  return {
    inputFile: '',
    outputFile: '',
    statements: rollbackStatements,
    manualRequired,
  };
}

/**
 * Generate a rollback file for a given UP migration file.
 */
export function generateRollbackFile(upFilePath: string, outputDir: string): RollbackResult {
  const content = fs.readFileSync(upFilePath, 'utf-8');
  const baseName = path.basename(upFilePath, '.sql');
  const outputFile = path.join(outputDir, `${baseName}_rollback.sql`);

  const result = generateRollbackSql(content);
  result.inputFile = upFilePath;
  result.outputFile = outputFile;

  // Build the rollback file content
  const header = `-- Auto-generated rollback for ${path.basename(upFilePath)}\n-- Generated: ${new Date().toISOString()}\n\n`;
  const body = [
    ...result.statements,
    ...(result.manualRequired.length > 0 ? ['', ...result.manualRequired] : []),
  ].join('\n\n');

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, header + body + '\n');

  return result;
}

/**
 * CLI entry point.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outputDir = args.find((a) => a.startsWith('--output='))?.split('=')[1]
    ?? path.join(process.cwd(), 'drizzle', 'rollbacks');
  const files = args.filter((a) => !a.startsWith('--'));

  if (files.length === 0) {
    console.log('Usage: generate-rollback.ts [--output=dir] <file1.sql> [file2.sql ...]');
    process.exit(0);
  }

  for (const file of files) {
    const result = generateRollbackFile(file, outputDir);
    console.log(`Generated: ${result.outputFile}`);
    if (result.manualRequired.length > 0) {
      console.warn(`  MANUAL ROLLBACK REQUIRED for ${result.manualRequired.length} statement(s)`);
    }
  }
}

const isDirectRun = process.argv[1]?.includes('generate-rollback');
if (isDirectRun) {
  main();
}
```

### Step 4: Run tests to verify they pass

Run: `cd backend && npx vitest run tests/unit/scripts/migration-safety/generate-rollback.test.ts`
Expected: ALL PASS

### Step 5: Commit

```bash
git add backend/scripts/migration-safety/generate-rollback.ts backend/tests/unit/scripts/migration-safety/generate-rollback.test.ts
git commit -m "feat(migration-safety): add rollback generator with reverse-order output"
```

---

## Task 4: Rollback Validator Script

**Files:**
- Create: `backend/scripts/migration-safety/validate-rollback.ts`
- Test: `backend/tests/unit/scripts/migration-safety/validate-rollback.test.ts`

This script is primarily a CI runner that needs a real PostgreSQL instance. The unit test covers the schema-diff logic and validation plan; the actual UP+DOWN roundtrip is tested in CI.

**SECURITY NOTE:** This script uses `execFileSync` (not `execSync`) for all subprocess calls. `execFileSync` passes arguments as an array, preventing shell injection. Never use `exec` or `execSync` with string concatenation.

### Step 1: Write the failing test

```typescript
// backend/tests/unit/scripts/migration-safety/validate-rollback.test.ts
import { describe, it, expect } from 'vitest';
import { diffSchemas, buildValidationPlan } from '../../../scripts/migration-safety/validate-rollback.js';

describe('diffSchemas', () => {
  it('returns empty diff for identical schemas', () => {
    const schema = 'CREATE TABLE foo (id INT);';
    expect(diffSchemas(schema, schema)).toBe('');
  });

  it('returns non-empty diff for different schemas', () => {
    const before = 'CREATE TABLE foo (id INT);';
    const after = 'CREATE TABLE foo (id INT, bar TEXT);';
    expect(diffSchemas(before, after)).not.toBe('');
  });
});

describe('buildValidationPlan', () => {
  it('returns skip for rollbacks with manual-required markers', () => {
    const rollbackSql = '-- MANUAL ROLLBACK REQUIRED: Cannot auto-reverse ALTER TYPE';
    const plan = buildValidationPlan(rollbackSql);
    expect(plan.skip).toBe(true);
    expect(plan.reason).toContain('MANUAL');
  });

  it('returns run for clean rollbacks', () => {
    const rollbackSql = 'DROP TABLE IF EXISTS foo;';
    const plan = buildValidationPlan(rollbackSql);
    expect(plan.skip).toBe(false);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd backend && npx vitest run tests/unit/scripts/migration-safety/validate-rollback.test.ts`
Expected: FAIL — module not found

### Step 3: Implement the validator

```typescript
// backend/scripts/migration-safety/validate-rollback.ts

import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export interface ValidationPlan {
  skip: boolean;
  reason?: string;
}

/**
 * Diff two schema dumps. Returns empty string if identical.
 */
export function diffSchemas(before: string, after: string): string {
  const normalize = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
  const a = normalize(before);
  const b = normalize(after);
  if (a === b) return '';

  // Simple line-by-line diff for CI output
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const diffs: string[] = [];

  const maxLen = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (aLines[i] !== bLines[i]) {
      if (aLines[i]) diffs.push(`- ${aLines[i]}`);
      if (bLines[i]) diffs.push(`+ ${bLines[i]}`);
    }
  }

  return diffs.join('\n');
}

/**
 * Check if a rollback file requires manual intervention.
 */
export function buildValidationPlan(rollbackSql: string): ValidationPlan {
  if (rollbackSql.includes('-- MANUAL ROLLBACK REQUIRED')) {
    return { skip: true, reason: 'Rollback contains MANUAL ROLLBACK REQUIRED markers — needs human review' };
  }
  return { skip: false };
}

/**
 * Run pg_dump --schema-only against a database.
 * Uses execFileSync (array args) to prevent shell injection.
 */
function pgDumpSchema(databaseUrl: string): string {
  return execFileSync('pg_dump', ['--schema-only', databaseUrl], { encoding: 'utf-8' });
}

/**
 * Execute a SQL file against a database.
 * Uses execFileSync (array args) to prevent shell injection.
 */
function execSqlFile(databaseUrl: string, filePath: string): void {
  execFileSync('psql', [databaseUrl, '-f', filePath], { stdio: 'pipe' });
}

/**
 * Validate a rollback by applying UP then DOWN and checking schema identity.
 *
 * Requires:
 * - A clean PostgreSQL database with all prior migrations applied
 * - pg_dump and psql available on PATH
 *
 * Returns { valid: true } or { valid: false, diff: string }
 */
export async function validateRollback(
  databaseUrl: string,
  upFile: string,
  rollbackFile: string
): Promise<{ valid: boolean; diff: string; skipped: boolean }> {
  const rollbackSql = fs.readFileSync(rollbackFile, 'utf-8');
  const plan = buildValidationPlan(rollbackSql);

  if (plan.skip) {
    console.log(`SKIP: ${plan.reason}`);
    return { valid: true, diff: '', skipped: true };
  }

  // 1. Capture baseline schema
  const baseline = pgDumpSchema(databaseUrl);

  // 2. Apply UP migration
  execSqlFile(databaseUrl, upFile);

  // 3. Apply DOWN rollback
  execSqlFile(databaseUrl, rollbackFile);

  // 4. Capture post-rollback schema
  const postRollback = pgDumpSchema(databaseUrl);

  // 5. Compare
  const diff = diffSchemas(baseline, postRollback);

  return { valid: diff === '', diff, skipped: false };
}

/**
 * CLI entry point.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: validate-rollback.ts <up.sql> <rollback.sql>');
    process.exit(0);
  }

  const [upFile, rollbackFile] = args;
  const result = await validateRollback(databaseUrl, upFile, rollbackFile);

  if (result.skipped) {
    console.log('Validation skipped (manual rollback required)');
    process.exit(0);
  }

  if (result.valid) {
    console.log('Rollback validated: schema is identical after UP + DOWN');
    process.exit(0);
  } else {
    console.error('Rollback FAILED: schema differs after UP + DOWN');
    console.error(result.diff);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1]?.includes('validate-rollback');
if (isDirectRun) {
  main();
}
```

### Step 4: Run tests to verify they pass

Run: `cd backend && npx vitest run tests/unit/scripts/migration-safety/validate-rollback.test.ts`
Expected: ALL PASS

### Step 5: Commit

```bash
git add backend/scripts/migration-safety/validate-rollback.ts backend/tests/unit/scripts/migration-safety/validate-rollback.test.ts
git commit -m "feat(migration-safety): add rollback validator with schema diff (execFileSync)"
```

---

## Task 5: npm Scripts and Rollbacks Directory

**Files:**
- Modify: `backend/package.json` — add migration safety scripts
- Create: `backend/drizzle/rollbacks/.gitkeep`

### Step 1: Add npm scripts to backend/package.json

Add these to the `"scripts"` section in `backend/package.json` (after the existing `db:studio` line):

```json
"migration:analyze": "tsx scripts/migration-safety/analyze-migration.ts",
"migration:rollback": "tsx scripts/migration-safety/generate-rollback.ts",
"migration:validate": "tsx scripts/migration-safety/validate-rollback.ts"
```

### Step 2: Create rollbacks directory

```bash
mkdir -p backend/drizzle/rollbacks
touch backend/drizzle/rollbacks/.gitkeep
```

### Step 3: Verify scripts run

Run: `cd backend && npm run migration:analyze` (no args — should print usage)
Expected: prints usage line, exits 0

Run: `cd backend && npm run migration:rollback` (no args — should print usage)
Expected: prints usage line, exits 0

### Step 4: Commit

```bash
git add backend/package.json backend/drizzle/rollbacks/.gitkeep
git commit -m "chore(migration-safety): add npm scripts and rollbacks directory"
```

---

## Task 6: Local Pre-Commit Hook

**Files:**
- Modify: `package.json` (root) — add lint-staged rule for SQL files

### Step 1: Add lint-staged rule

In the root `package.json`, add to the `"lint-staged"` object:

```json
"backend/drizzle/*.sql": "pnpm --filter renovation-agent-backend migration:analyze -- --warn-only"
```

The full `"lint-staged"` section should now be:
```json
"lint-staged": {
  "backend/src/**/*.ts": "pnpm --filter renovation-agent-backend lint",
  "frontend/**/*.{ts,tsx}": "pnpm --filter frontend lint",
  "backend/drizzle/*.sql": "pnpm --filter renovation-agent-backend migration:analyze -- --warn-only"
}
```

This runs the analyzer in warn-only mode (non-blocking) on every committed SQL migration file.

### Step 2: Test by staging a mock migration

Create a temporary test file, stage it, and verify the hook reports:

```bash
echo "DROP TABLE foo;" > backend/drizzle/test_hook.sql
git add backend/drizzle/test_hook.sql
# The pre-commit hook should print the DESTRUCTIVE warning but NOT block (--warn-only)
git reset HEAD backend/drizzle/test_hook.sql
rm backend/drizzle/test_hook.sql
```

### Step 3: Commit

```bash
git add package.json
git commit -m "chore(migration-safety): add pre-commit hook for migration analysis"
```

---

## Task 7: CI Quality Gates — Migration Safety Job

**Files:**
- Modify: `.github/workflows/quality-gates.yml` — add migration-safety job

### Step 1: Add the migration-safety job

Insert this job after the `backend-quality` job (after line 68, before `frontend-quality`). This job only runs when SQL migration files are changed in a PR:

```yaml
  migration-safety:
    name: Migration Safety
    runs-on: ubuntu-latest
    if: ${{ github.event_name == 'pull_request' }}
    defaults:
      run:
        working-directory: backend

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: migration_test
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
        ports:
          - 5433:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Detect new migration files
        id: detect
        run: |
          MIGRATIONS=$(git diff --name-only origin/main...HEAD -- backend/drizzle/*.sql | grep -v '/rollbacks/' || true)
          if [ -z "$MIGRATIONS" ]; then
            echo "skip=true" >> $GITHUB_OUTPUT
            echo "No new migration files detected"
          else
            echo "skip=false" >> $GITHUB_OUTPUT
            echo "files<<EOF" >> $GITHUB_OUTPUT
            echo "$MIGRATIONS" >> $GITHUB_OUTPUT
            echo "EOF" >> $GITHUB_OUTPUT
            echo "New migrations: $MIGRATIONS"
          fi
        working-directory: .

      - name: Setup pnpm
        if: steps.detect.outputs.skip != 'true'
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        if: steps.detect.outputs.skip != 'true'
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          cache-dependency-path: pnpm-lock.yaml

      - name: Install dependencies
        if: steps.detect.outputs.skip != 'true'
        run: pnpm install --frozen-lockfile
        working-directory: .

      - name: Analyze migrations
        if: steps.detect.outputs.skip != 'true'
        run: |
          echo "## Migration Safety Report" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          EXIT_CODE=0
          while IFS= read -r file; do
            [ -z "$file" ] && continue
            echo "### $(basename $file)" >> $GITHUB_STEP_SUMMARY
            echo '```json' >> $GITHUB_STEP_SUMMARY
            pnpm migration:analyze "../$file" >> $GITHUB_STEP_SUMMARY 2>&1 || EXIT_CODE=$?
            echo '```' >> $GITHUB_STEP_SUMMARY
          done <<< "${{ steps.detect.outputs.files }}"
          exit $EXIT_CODE

      - name: Generate rollbacks
        if: steps.detect.outputs.skip != 'true'
        run: |
          while IFS= read -r file; do
            [ -z "$file" ] && continue
            pnpm migration:rollback -- --output=drizzle/rollbacks "../$file"
          done <<< "${{ steps.detect.outputs.files }}"

      - name: Apply prior migrations
        if: steps.detect.outputs.skip != 'true'
        run: pnpm db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5433/migration_test
          NODE_ENV: test
          GOOGLE_API_KEY: test-key

      - name: Validate rollbacks
        if: steps.detect.outputs.skip != 'true'
        run: |
          while IFS= read -r file; do
            [ -z "$file" ] && continue
            BASENAME=$(basename "$file" .sql)
            ROLLBACK="drizzle/rollbacks/${BASENAME}_rollback.sql"
            if [ -f "$ROLLBACK" ]; then
              pnpm migration:validate "$file" "$ROLLBACK"
            else
              echo "No rollback found for $file — skipping validation"
            fi
          done <<< "${{ steps.detect.outputs.files }}"
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5433/migration_test
```

### Step 2: Verify YAML syntax

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/quality-gates.yml'))"` or manually review indentation.

### Step 3: Commit

```bash
git add .github/workflows/quality-gates.yml
git commit -m "ci(migration-safety): add PR migration analysis, rollback gen, and validation"
```

---

## Task 8: Production Deploy Gate

**Files:**
- Modify: `.github/workflows/backend-deploy.yml` — add dry-run + environment protection
- Create: `backend/scripts/migration-safety/list-pending.ts` — helper to detect pending migrations

### Step 1: Create the list-pending helper script

```typescript
// backend/scripts/migration-safety/list-pending.ts

import * as fs from 'node:fs';
import * as path from 'node:path';

interface JournalEntry {
  idx: number;
  tag: string;
}

interface Journal {
  entries: JournalEntry[];
}

const journalPath = path.join(process.cwd(), 'drizzle', 'meta', '_journal.json');
const drizzleDir = path.join(process.cwd(), 'drizzle');

const journal: Journal = JSON.parse(fs.readFileSync(journalPath, 'utf-8'));
const appliedTags = new Set(journal.entries.map((e) => e.tag));

const sqlFiles = fs.readdirSync(drizzleDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

let hasPending = false;
for (const file of sqlFiles) {
  const tag = file.replace('.sql', '');
  const status = appliedTags.has(tag) ? 'applied' : 'PENDING';
  if (status === 'PENDING') hasPending = true;
  console.log(`${status}: ${file}`);
}

if (!hasPending) {
  process.exit(0);
}
```

### Step 2: Replace the run-migrations job in backend-deploy.yml

Replace lines 91-121 (the current `run-migrations` job) with these two jobs:

```yaml
  migration-dry-run:
    name: Migration Dry Run
    runs-on: ubuntu-latest
    needs: build-and-push
    defaults:
      run:
        working-directory: backend

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          cache-dependency-path: pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        working-directory: .

      - name: Check pending migrations
        run: |
          echo "## Production Migration Dry Run" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          tsx scripts/migration-safety/list-pending.ts >> $GITHUB_STEP_SUMMARY 2>&1 || true
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Analyze all migration files
        run: |
          echo "### Risk Analysis" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          for file in drizzle/0*.sql; do
            echo '```json' >> $GITHUB_STEP_SUMMARY
            pnpm migration:analyze "$file" >> $GITHUB_STEP_SUMMARY 2>&1 || true
            echo '```' >> $GITHUB_STEP_SUMMARY
          done

  run-migrations:
    name: Run Database Migrations
    runs-on: ubuntu-latest
    needs: migration-dry-run
    environment: production
    defaults:
      run:
        working-directory: backend

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          cache-dependency-path: pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile
        working-directory: .

      - name: Run Drizzle migrations
        run: pnpm db:migrate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### Step 3: Commit

```bash
git add .github/workflows/backend-deploy.yml backend/scripts/migration-safety/list-pending.ts
git commit -m "ci(migration-safety): add production dry-run and environment protection gate"
```

**POST-MERGE ACTION:** Configure the `production` environment in GitHub repo settings:
Settings > Environments > New environment > "production" > Required reviewers > Add yourself.

---

## Task 9: Claude Agent Definition

**Files:**
- Create: `.claude/agents/migration-safety.md`

### Step 1: Write the agent file

Create `.claude/agents/migration-safety.md` with the full agent definition from the design doc (Section 3). The agent follows the same format as `e2e-test-engineer.md` and `langgraph-specialist.md`:

- Frontmatter: name, description (with examples), model: sonnet, memory: project
- Role statement and mission
- Project Context (database stack, migration history, CI safety pipeline, risk classification, table list)
- Core Capabilities (6): code cross-reference, data safety, extension compatibility, migration ordering, rollback review, production planning
- Workflow sections: reviewing a PR, planning a migration, when CI flags a WARNING
- Design Principles: expand-contract, idempotent migrations, rollback-first, small focused migrations
- Code Standards: file naming, IF NOT EXISTS, COMMENT ON, CONCURRENTLY
- Output Format: structured review template
- Key References: file paths
- Persistent Agent Memory block

The full content is in the design doc at `docs/plans/2026-02-20-migration-safety-design.md`, Section 3.

### Step 2: Commit

```bash
git add .claude/agents/migration-safety.md
git commit -m "feat(migration-safety): add Claude agent for semantic migration review"
```

---

## Task 10: Run Full Test Suite and Verify

### Step 1: Run all migration safety tests

Run: `cd backend && npx vitest run tests/unit/scripts/migration-safety/`
Expected: ALL PASS (patterns, analyze-migration, generate-rollback, validate-rollback — 4 test files)

### Step 2: Run full backend test suite

Run: `cd backend && npm run test:unit`
Expected: ALL PASS, coverage thresholds met (80% lines/functions/branches/statements)

### Step 3: Run lint and type-check

Run: `cd backend && npm run lint && npm run build`
Expected: 0 errors

### Step 4: Test analyzer against real migrations

Run the analyzer against existing migration files to verify it handles them correctly:

```bash
cd backend
npm run migration:analyze -- drizzle/0000_nosy_guardian.sql
npm run migration:analyze -- drizzle/0004_brief_adam_destine.sql
npm run migration:analyze -- drizzle/0006_add_performance_indexes.sql
npm run migration:analyze -- drizzle/0007_reconcile_manual_tables.sql
```

Expected: All should report SAFE (existing migrations are non-destructive).

### Step 5: Generate rollbacks for existing migrations

```bash
cd backend
for f in drizzle/0*.sql; do npm run migration:rollback -- --output=drizzle/rollbacks "$f"; done
```

Expected: Rollback files created in `backend/drizzle/rollbacks/`

### Step 6: Final commit

```bash
git add backend/drizzle/rollbacks/
git commit -m "chore(migration-safety): generate rollbacks for existing migrations"
```
