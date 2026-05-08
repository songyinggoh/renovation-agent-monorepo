/**
 * Bash execution tool for dev agents.
 *
 * Runs shell commands with a safety filter that blocks destructive patterns.
 * Uses execFileNoThrow (which wraps child_process.execFile) with a shell
 * binary as the executable, so the command string is passed as a single
 * argument -- not interpolated into a shell invocation.
 */

import { platform } from 'node:os';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';
import { Logger } from '../../utils/logger.js';

const logger = new Logger({ serviceName: 'DevTools:Bash' });

/** Patterns that are blocked for safety (case-insensitive, word-bounded) */
export const BLOCKED_PATTERNS: RegExp[] = [
  /rm\s+-rf\b.*[/~]/i,     // rm -rf / or ~ (including flags like --no-preserve-root)
  /\bmkfs\b/i,              // format filesystem
  /\bdd\s+if=/i,            // raw disk write
  /curl.*\|\s*bash/i,       // pipe curl to bash
  /wget.*\|\s*bash/i,       // pipe wget to bash
  /\bgit\s+push\s+.*--force/i, // force push (matches branch isolation goal)
];

/**
 * Check if a command matches any blocked pattern.
 * @returns The matched pattern string, or null if safe.
 */
export function matchBlockedPattern(command: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return pattern.source;
    }
  }
  return null;
}

/**
 * bash_exec -- Run a shell command with safety filtering.
 */
export const bashExecTool = tool(
  async ({ command, cwd }): Promise<string> => {
    logger.info('Tool invoked: bash_exec', { command, cwd });

    const blocked = matchBlockedPattern(command);
    if (blocked) {
      logger.warn('bash_exec blocked destructive command', undefined, {
        command,
        blockedPattern: blocked,
      });
      return JSON.stringify({
        success: false,
        error: `Command blocked by safety filter: matches pattern /${blocked}/`,
      });
    }

    // Use platform-appropriate shell to support pipes and redirects.
    // The command string is passed as a single argument to execFile,
    // NOT interpolated into a shell string.
    const isWindows = platform() === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/bash';
    const shellFlag = isWindows ? '/c' : '-c';

    const result = await execFileNoThrow(shell, [shellFlag, command], {
      cwd,
      timeout: 60_000,
    });

    return JSON.stringify({
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  },
  {
    name: 'bash_exec',
    description:
      'Run a shell command. Destructive commands (rm -rf /, mkfs, dd, curl|bash) are blocked. Returns stdout, stderr, and exit code.',
    schema: z.object({
      command: z.string().describe('The shell command to run'),
      cwd: z.string().optional().describe('Working directory for the command'),
    }),
  },
);
