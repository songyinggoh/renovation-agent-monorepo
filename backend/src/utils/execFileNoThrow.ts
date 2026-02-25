/**
 * Safe shell execution utility using child_process.execFile.
 *
 * Uses execFile (NOT exec) to prevent command injection -- execFile does NOT
 * spawn a shell, so metacharacters like ;, |, && are not interpreted.
 *
 * Returns { stdout, stderr, exitCode } instead of throwing on non-zero exit.
 */

import { execFile as execFileCb } from 'node:child_process';

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecFileOptions {
  /** Working directory for the command */
  cwd?: string;
  /** Timeout in milliseconds (default: 30_000) */
  timeout?: number;
  /** Max buffer size in bytes (default: 10 MB) */
  maxBuffer?: number;
}

/**
 * Execute a command without throwing on non-zero exit codes.
 *
 * @param file - The executable to run (e.g. 'git', 'rg', 'node')
 * @param args - Array of arguments (NOT a shell string)
 * @param options - Optional cwd, timeout, maxBuffer
 * @returns { stdout, stderr, exitCode }
 */
export function execFileNoThrow(
  file: string,
  args: string[] = [],
  options: ExecFileOptions = {},
): Promise<ExecResult> {
  const { cwd, timeout = 30_000, maxBuffer = 10 * 1024 * 1024 } = options;

  return new Promise<ExecResult>((resolve) => {
    execFileCb(
      file,
      args,
      { cwd, timeout, maxBuffer, windowsHide: true },
      (error, stdout, stderr) => {
        if (error && typeof (error as NodeJS.ErrnoException).code === 'string' &&
            (error as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve({
            stdout: '',
            stderr: `Command not found: ${file}`,
            exitCode: 127,
          });
          return;
        }

        // Prefer error.status (exit code) over error.code (which may be a string like 'ERR_...')
        const exitCode =
          error && typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : error && 'code' in error && typeof error.code === 'number'
              ? error.code
              : error
                ? 1
                : 0;

        resolve({
          stdout: typeof stdout === 'string' ? stdout : '',
          stderr: typeof stderr === 'string' ? stderr : '',
          exitCode,
        });
      },
    );
  });
}
