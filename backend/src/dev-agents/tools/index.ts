/**
 * Dev agent tool barrel exports with curated subsets.
 *
 * Each agent type gets a specific toolset:
 * - devTools: all 10 tools (implement agent)
 * - readOnlyTools: read + search only (research, review agents)
 * - writeTools: read/write + search, no git commit (scaffold, migration agents)
 */

// File operations
export { fileReadTool, fileWriteTool, fileEditTool } from './file-ops.js';

// Shell execution
export { bashExecTool, BLOCKED_PATTERNS, matchBlockedPattern } from './bash.js';

// Search
export { codebaseSearchTool, fileFindTool } from './search.js';

// Git
export { gitStatusTool, gitDiffTool, gitCommitTool, gitBranchTool } from './git.js';

// ── Tool imports for subset assembly ────────────────────────────────────────
import { fileReadTool, fileWriteTool, fileEditTool } from './file-ops.js';
import { bashExecTool } from './bash.js';
import { codebaseSearchTool, fileFindTool } from './search.js';
import { gitStatusTool, gitDiffTool, gitCommitTool, gitBranchTool } from './git.js';

/** All dev tools — used by the implement agent */
export const devTools = [
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  bashExecTool,
  codebaseSearchTool,
  fileFindTool,
  gitStatusTool,
  gitDiffTool,
  gitCommitTool,
  gitBranchTool,
];

/** Read-only tools — used by research and review agents */
export const readOnlyTools = [
  fileReadTool,
  codebaseSearchTool,
  fileFindTool,
  gitStatusTool,
  gitDiffTool,
];

/** Write tools without git commit — used by scaffold and migration agents */
export const writeTools = [
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  bashExecTool,
  codebaseSearchTool,
  fileFindTool,
  gitStatusTool,
  gitDiffTool,
];
