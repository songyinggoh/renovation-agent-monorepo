import { isAgentEnabled } from '../utils/agent-killswitch.js';
import { execFileNoThrow } from '../utils/execFileNoThrow.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'DevAgentGuards' });

/** Branches that agents must never write to directly */
const PROTECTED_BRANCHES = new Set(['main', 'master', 'dev', 'production', 'staging']);

/**
 * Check the kill switch for an agent. Throws if the agent is disabled.
 *
 * @param agentId - The agent ID to check (e.g. 'dev-supervisor')
 * @throws Error if the agent is disabled via Redis kill switch
 */
export async function checkKillSwitch(agentId: string): Promise<void> {
  const enabled = await isAgentEnabled(agentId);
  if (!enabled) {
    throw new Error(
      `Agent "${agentId}" is disabled via kill switch. ` +
      `Enable with: redis-cli DEL agent:${agentId}:enabled`
    );
  }
}

/**
 * Convert a task description into a URL-safe branch slug.
 *
 * - Lowercased
 * - Non-alphanumeric replaced with hyphens
 * - Consecutive hyphens collapsed
 * - Trimmed and truncated to 50 chars
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Ensure the working tree is on a dev-agent/* branch.
 *
 * - If already on dev-agent/*, returns the current branch name.
 * - If on a protected branch (main, dev, etc.), creates and checks out
 *   a new dev-agent/<slug> branch from HEAD.
 * - NEVER writes to protected branches.
 *
 * All git operations use execFileNoThrow (not exec) to prevent command injection.
 *
 * @param taskDescription - Human-readable task used to generate the branch name
 * @returns The dev-agent/* branch name
 * @throws Error if git operations fail
 */
export async function ensureDevBranch(taskDescription: string): Promise<string> {
  // Get current branch name via execFileNoThrow (safe, no shell)
  const { stdout, exitCode, stderr } = await execFileNoThrow(
    'git',
    ['rev-parse', '--abbrev-ref', 'HEAD'],
  );

  if (exitCode !== 0) {
    throw new Error(`Failed to determine current git branch: ${stderr}`);
  }

  const currentBranch = stdout.trim();

  // Already on a dev-agent/* branch — use it
  if (currentBranch.startsWith('dev-agent/')) {
    logger.info('Already on dev-agent branch', { branch: currentBranch });
    return currentBranch;
  }

  // On a protected branch — create a new dev-agent/* branch
  const slug = slugify(taskDescription);
  const newBranch = `dev-agent/${slug}`;

  if (PROTECTED_BRANCHES.has(currentBranch)) {
    logger.info('On protected branch, creating dev-agent branch', {
      currentBranch,
      newBranch,
    });
  } else {
    logger.info('Not on dev-agent branch, creating one', {
      currentBranch,
      newBranch,
    });
  }

  // Create and checkout new branch via execFileNoThrow (safe, no shell)
  const checkout = await execFileNoThrow(
    'git',
    ['checkout', '-b', newBranch],
  );

  if (checkout.exitCode !== 0) {
    throw new Error(`Failed to create branch "${newBranch}": ${checkout.stderr}`);
  }

  logger.info('Created and checked out dev-agent branch', { branch: newBranch });
  return newBranch;
}
