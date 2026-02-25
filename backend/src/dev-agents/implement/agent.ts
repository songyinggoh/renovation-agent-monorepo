/**
 * Implement specialist agent.
 *
 * Uses the full dev toolset to write code following TDD,
 * run quality gates, and commit changes.
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createDevModel } from '../../config/claude.js';
import { devTools } from '../tools/index.js';
import { DEV_AGENT_NAMES } from '../types.js';
import { IMPLEMENT_AGENT_PROMPT } from './prompt.js';

export function createImplementAgent() {
  return createReactAgent({
    llm: createDevModel(),
    tools: devTools,
    name: DEV_AGENT_NAMES.IMPLEMENT,
    prompt: IMPLEMENT_AGENT_PROMPT,
  });
}
