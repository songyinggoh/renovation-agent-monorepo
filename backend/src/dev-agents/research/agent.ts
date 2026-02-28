/**
 * Research specialist agent.
 *
 * Uses read-only tools to analyze the codebase and produce
 * structured research output for planning decisions.
 */

import { createAgent } from 'langchain';
import { createDevModel } from '../../config/claude.js';
import { readOnlyTools } from '../tools/index.js';
import { DEV_AGENT_NAMES } from '../types.js';
import { RESEARCH_AGENT_PROMPT } from './prompt.js';
import { createDevAgentMiddleware } from '../middleware.js';

export function createResearchAgent() {
  return createAgent({
    model: createDevModel(),
    tools: readOnlyTools,
    name: DEV_AGENT_NAMES.RESEARCH,
    systemPrompt: RESEARCH_AGENT_PROMPT,
    middleware: createDevAgentMiddleware(DEV_AGENT_NAMES.RESEARCH),
  });
}
