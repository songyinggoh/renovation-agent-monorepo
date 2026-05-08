/**
 * Research specialist agent.
 *
 * Uses read-only tools to analyze the codebase and produce
 * structured research output for planning decisions.
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createDevModel } from '../../config/claude.js';
import { readOnlyTools } from '../tools/index.js';
import { DEV_AGENT_NAMES } from '../types.js';
import { RESEARCH_AGENT_PROMPT } from './prompt.js';

export function createResearchAgent() {
  return createReactAgent({
    llm: createDevModel(),
    tools: readOnlyTools,
    name: DEV_AGENT_NAMES.RESEARCH,
    prompt: RESEARCH_AGENT_PROMPT,
  });
}
