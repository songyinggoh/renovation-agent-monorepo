/**
 * Search tools for dev agents.
 *
 * Provides codebase_search (regex via ripgrep/grep) and file_find (glob).
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';
import { Logger } from '../../utils/logger.js';

const logger = new Logger({ serviceName: 'DevTools:Search' });

/**
 * codebase_search - Regex search via ripgrep (rg), falling back to grep.
 */
export const codebaseSearchTool = tool(
  async ({ pattern, path, glob: fileGlob }): Promise<string> => {
    logger.info('Tool invoked: codebase_search', { pattern, path, glob: fileGlob });

    const searchPath = path ?? '.';

    // Try ripgrep first
    const rgArgs = ['--no-heading', '--line-number', '--max-count', '100'];
    if (fileGlob) {
      rgArgs.push('--glob', fileGlob);
    }
    rgArgs.push(pattern, searchPath);

    const rgResult = await execFileNoThrow('rg', rgArgs);

    if (rgResult.exitCode !== 127) {
      // rg was found (exit 0 = matches, exit 1 = no matches, exit 2 = error)
      if (rgResult.exitCode === 0) {
        return rgResult.stdout;
      }
      if (rgResult.exitCode === 1) {
        return 'No matches found.';
      }
      return JSON.stringify({
        success: false,
        error: rgResult.stderr || 'ripgrep search failed',
      });
    }

    // Fallback to grep
    logger.info('rg not found, falling back to grep');
    const grepArgs = ['-rn', '--max-count=100'];
    if (fileGlob) {
      grepArgs.push(`--include=${fileGlob}`);
    }
    grepArgs.push(pattern, searchPath);

    const grepResult = await execFileNoThrow('grep', grepArgs);

    if (grepResult.exitCode === 0) {
      return grepResult.stdout;
    }
    if (grepResult.exitCode === 1) {
      return 'No matches found.';
    }
    return JSON.stringify({
      success: false,
      error: grepResult.stderr || 'grep search failed',
    });
  },
  {
    name: 'codebase_search',
    description:
      'Search the codebase using a regex pattern. Uses ripgrep (rg) if available, otherwise grep. Returns matching lines with file paths and line numbers.',
    schema: z.object({
      pattern: z.string().describe('Regex pattern to search for'),
      path: z.string().optional().describe('Directory or file to search in (default: current directory)'),
      glob: z.string().optional().describe('File glob filter, e.g. "*.ts" or "**/*.test.ts"'),
    }),
  },
);

/**
 * file_find - Find files by glob pattern using the system find command
 * or a cross-platform fallback.
 */
export const fileFindTool = tool(
  async ({ pattern, path }): Promise<string> => {
    logger.info('Tool invoked: file_find', { pattern, path });

    const searchPath = path ?? '.';

    // Try using find (Unix) or dir (Windows) via rg --files with glob
    // rg --files --glob is the most cross-platform option
    const rgArgs = ['--files', '--glob', pattern, searchPath];
    const rgResult = await execFileNoThrow('rg', rgArgs);

    if (rgResult.exitCode !== 127) {
      if (rgResult.exitCode === 0 && rgResult.stdout.trim()) {
        return rgResult.stdout.trim();
      }
      if (rgResult.exitCode === 0 || rgResult.exitCode === 1) {
        return 'No files found matching the pattern.';
      }
    }

    // Fallback: try find on Unix
    const findResult = await execFileNoThrow('find', [searchPath, '-name', pattern, '-type', 'f']);
    if (findResult.exitCode !== 127) {
      if (findResult.exitCode === 0 && findResult.stdout.trim()) {
        return findResult.stdout.trim();
      }
      return 'No files found matching the pattern.';
    }

    return JSON.stringify({
      success: false,
      error: 'Neither rg nor find is available on this system',
    });
  },
  {
    name: 'file_find',
    description:
      'Find files by glob pattern. Uses ripgrep --files or system find. Returns a newline-separated list of matching file paths.',
    schema: z.object({
      pattern: z.string().describe('Glob pattern to match files, e.g. "*.ts" or "**/*.test.ts"'),
      path: z.string().optional().describe('Directory to search in (default: current directory)'),
    }),
  },
);
