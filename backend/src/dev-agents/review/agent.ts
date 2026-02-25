import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createDevReviewModel } from '../../config/claude.js';
import { readOnlyTools } from '../tools/index.js';
import { DEV_AGENT_NAMES } from '../types.js';
import { REVIEW_AGENT_PROMPT } from './prompt.js';

/**
 * Create the review specialist agent.
 *
 * This agent is powered by Claude Opus for deeper reasoning capability.
 * It performs READ-ONLY code reviews against CLAUDE.md quality standards
 * and produces structured review reports.
 *
 * Tools: file_read, codebase_search, file_find, git_status, git_diff
 * (all read-only — no write or execute tools).
 */
export function createReviewAgent() {
  return createReactAgent({
    llm: createDevReviewModel(),
    tools: readOnlyTools,
    name: DEV_AGENT_NAMES.REVIEW,
    prompt: REVIEW_AGENT_PROMPT,
  });
}
