/**
 * Git tools for dev agents.
 *
 * Provides git_status, git_diff, git_commit, and git_branch tools.
 * All tools use execFileNoThrow to call git directly (no shell injection).
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';
import { Logger } from '../../utils/logger.js';

const logger = new Logger({ serviceName: 'DevTools:Git' });

/** Branches that dev agents must never checkout or overwrite. */
const PROTECTED_BRANCHES = new Set(['main', 'master', 'dev', 'develop', 'production', 'staging']);

/** Required prefix for any new branch created by dev agents. */
const DEV_AGENT_BRANCH_PREFIX = 'dev-agent/';

/**
 * git_status - Show the working tree status.
 */
export const gitStatusTool = tool(
  async (): Promise<string> => {
    logger.info('Tool invoked: git_status');

    const result = await execFileNoThrow('git', ['status', '--porcelain=v1']);

    if (result.exitCode !== 0) {
      return JSON.stringify({
        success: false,
        error: result.stderr || 'git status failed',
      });
    }

    return result.stdout.trim() || 'Working tree clean — no changes.';
  },
  {
    name: 'git_status',
    description: 'Show git working tree status in short format. Returns changed/untracked files.',
    schema: z.object({}),
  },
);

/**
 * git_diff - Show the diff of working tree or staged changes.
 */
export const gitDiffTool = tool(
  async ({ staged }): Promise<string> => {
    logger.info('Tool invoked: git_diff', { staged });

    const args = staged ? ['diff', '--staged'] : ['diff'];
    const result = await execFileNoThrow('git', args);

    if (result.exitCode !== 0) {
      return JSON.stringify({
        success: false,
        error: result.stderr || 'git diff failed',
      });
    }

    return result.stdout.trim() || 'No differences found.';
  },
  {
    name: 'git_diff',
    description:
      'Show git diff. By default shows unstaged changes; set staged=true to show staged (cached) changes.',
    schema: z.object({
      staged: z.boolean().optional().describe('If true, show staged changes (git diff --staged)'),
    }),
  },
);

/**
 * git_commit - Stage specified files and create a commit.
 */
export const gitCommitTool = tool(
  async ({ files, message }): Promise<string> => {
    logger.info('Tool invoked: git_commit', { files, message });

    // Stage files
    const addResult = await execFileNoThrow('git', ['add', ...files]);
    if (addResult.exitCode !== 0) {
      return JSON.stringify({
        success: false,
        error: `git add failed: ${addResult.stderr}`,
      });
    }

    // Commit
    const commitResult = await execFileNoThrow('git', ['commit', '-m', message]);
    if (commitResult.exitCode !== 0) {
      return JSON.stringify({
        success: false,
        error: `git commit failed: ${commitResult.stderr}`,
      });
    }

    return JSON.stringify({
      success: true,
      output: commitResult.stdout.trim(),
    });
  },
  {
    name: 'git_commit',
    description:
      'Stage the specified files and create a git commit with the given message. Uses conventional commit format.',
    schema: z.object({
      files: z.array(z.string()).min(1).describe('Files to stage before committing'),
      message: z.string().describe('Commit message (use conventional commits format)'),
    }),
  },
);

/**
 * git_branch - Create, checkout, or list branches.
 */
export const gitBranchTool = tool(
  async ({ action, name }): Promise<string> => {
    logger.info('Tool invoked: git_branch', { action, name });

    switch (action) {
      case 'list': {
        const result = await execFileNoThrow('git', ['branch', '-a']);
        if (result.exitCode !== 0) {
          return JSON.stringify({ success: false, error: result.stderr });
        }
        return result.stdout.trim();
      }

      case 'create': {
        if (!name) {
          return JSON.stringify({ success: false, error: 'Branch name is required for create action' });
        }
        if (!name.startsWith(DEV_AGENT_BRANCH_PREFIX)) {
          return JSON.stringify({
            success: false,
            error: `Branch name must start with "${DEV_AGENT_BRANCH_PREFIX}". Got: "${name}"`,
          });
        }
        const result = await execFileNoThrow('git', ['checkout', '-b', name]);
        if (result.exitCode !== 0) {
          return JSON.stringify({ success: false, error: result.stderr });
        }
        return JSON.stringify({ success: true, output: `Created and checked out branch: ${name}` });
      }

      case 'checkout': {
        if (!name) {
          return JSON.stringify({ success: false, error: 'Branch name is required for checkout action' });
        }
        if (PROTECTED_BRANCHES.has(name)) {
          return JSON.stringify({
            success: false,
            error: `Checkout of protected branch "${name}" is not allowed. Dev agents must stay on their working branch.`,
          });
        }
        const result = await execFileNoThrow('git', ['checkout', name]);
        if (result.exitCode !== 0) {
          return JSON.stringify({ success: false, error: result.stderr });
        }
        return JSON.stringify({ success: true, output: `Checked out branch: ${name}` });
      }

      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${action as string}` });
    }
  },
  {
    name: 'git_branch',
    description:
      'Manage git branches. Actions: "list" (show all branches), "create" (create and checkout new branch), "checkout" (switch to existing branch).',
    schema: z.object({
      action: z.enum(['create', 'checkout', 'list']).describe('Branch action to perform'),
      name: z.string().optional().describe('Branch name (required for create/checkout)'),
    }),
  },
);
