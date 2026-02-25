import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createDevModel } from '../../config/claude.js';
import { writeTools } from '../tools/index.js';
import { DEV_AGENT_NAMES } from '../types.js';
import { SCAFFOLD_AGENT_PROMPT } from './prompt.js';

/**
 * Create the scaffold specialist agent.
 * Generates boilerplate following project conventions.
 */
export function createScaffoldAgent() {
  return createReactAgent({
    llm: createDevModel(),
    tools: writeTools,
    name: DEV_AGENT_NAMES.SCAFFOLD,
    prompt: SCAFFOLD_AGENT_PROMPT,
  });
}
