/**
 * Shared types for the migration safety toolchain.
 */

export type RiskLevel = 'SAFE' | 'WARNING' | 'DESTRUCTIVE';

export interface StatementAnalysis {
  line: number;
  sql: string;
  risk: RiskLevel;
  reason: string;
}

export interface AnalysisReport {
  file: string;
  riskLevel: RiskLevel;
  statements: StatementAnalysis[];
  warnings: string[];
  blockers: string[];
  hasOverride: boolean;
}

export interface RollbackEntry {
  originalSql: string;
  rollbackSql: string | null;
  requiresManual: boolean;
  manualReason?: string;
}

export interface RollbackReport {
  sourceFile: string;
  outputFile: string;
  entries: RollbackEntry[];
  requiresManualReview: boolean;
}

export interface SchemaSnapshot {
  tables: string[];
  columns: Array<{
    table: string;
    column: string;
    type: string;
    nullable: string;
    default: string | null;
  }>;
  indexes: Array<{ name: string; table: string; definition: string }>;
  constraints: Array<{ name: string; table: string; type: string }>;
}

export interface ValidationResult {
  success: boolean;
  upFile: string;
  downFile: string;
  differences?: string[];
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}
