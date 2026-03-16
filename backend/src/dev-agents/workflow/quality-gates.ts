/**
 * Quality Gates Node
 *
 * Runs the project's mandatory quality checks:
 * - Backend: lint, type-check (build), unit tests
 * - Frontend: lint, type-check
 *
 * Returns { passed: boolean, output: string }.
 * If any gate fails, the workflow routes back to the implement agent
 * with the error output as context.
 */

import { execFileNoThrow } from '../../utils/execFileNoThrow.js';
import { Logger } from '../../utils/logger.js';

const logger = new Logger({ serviceName: 'QualityGates' });

export interface QualityGateResult {
  passed: boolean;
  output: string;
}

interface GateCheck {
  name: string;
  cwd: string;
  command: string;
  args: string[];
}

/**
 * Define the quality gate checks.
 * Each check runs via execFileNoThrow for safety.
 */
function getGateChecks(rootDir: string): GateCheck[] {
  return [
    {
      name: 'backend:lint',
      cwd: `${rootDir}/backend`,
      command: 'npm',
      args: ['run', 'lint'],
    },
    {
      name: 'backend:build',
      cwd: `${rootDir}/backend`,
      command: 'npm',
      args: ['run', 'build'],
    },
    {
      name: 'backend:test',
      cwd: `${rootDir}/backend`,
      command: 'npm',
      args: ['run', 'test:unit'],
    },
    {
      name: 'frontend:lint',
      cwd: `${rootDir}/frontend`,
      command: 'npm',
      args: ['run', 'lint'],
    },
    {
      name: 'frontend:type-check',
      cwd: `${rootDir}/frontend`,
      command: 'npm',
      args: ['run', 'type-check'],
    },
  ];
}

/**
 * Detect the monorepo root directory.
 * Walks up from the current file's location to find the directory
 * containing both `backend/` and `frontend/`.
 */
function getMonorepoRoot(): string {
  // This file is at backend/src/dev-agents/workflow/quality-gates.ts
  // Monorepo root is 4 levels up
  const path = new URL('../../../../', import.meta.url);
  return path.pathname.replace(/\/$/, '');
}

/**
 * Run all quality gate checks sequentially.
 *
 * Stops on first failure and returns the failure output.
 * On success, returns a summary of all passing checks.
 *
 * @param rootDir - Optional override for monorepo root (for testing)
 * @returns { passed: boolean, output: string }
 */
export async function runQualityGates(rootDir?: string): Promise<QualityGateResult> {
  const root = rootDir ?? getMonorepoRoot();
  const checks = getGateChecks(root);
  const outputs: string[] = [];

  logger.info('Running quality gates', { checkCount: checks.length });

  for (const check of checks) {
    logger.info(`Quality gate: ${check.name}`, { cwd: check.cwd });

    const result = await execFileNoThrow(check.command, check.args, {
      cwd: check.cwd,
      timeout: 120_000, // 2 minutes per check
    });

    if (result.exitCode !== 0) {
      const failureOutput = [
        `FAILED: ${check.name}`,
        `Exit code: ${result.exitCode}`,
        result.stdout ? `stdout:\n${result.stdout}` : '',
        result.stderr ? `stderr:\n${result.stderr}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      logger.error(`Quality gate failed: ${check.name}`, new Error(failureOutput));

      return {
        passed: false,
        output: failureOutput,
      };
    }

    outputs.push(`PASSED: ${check.name}`);
    logger.info(`Quality gate passed: ${check.name}`);
  }

  const output = outputs.join('\n');
  logger.info('All quality gates passed');

  return { passed: true, output };
}
