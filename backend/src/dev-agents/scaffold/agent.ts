import { createAgent } from 'langchain';
import { createDevModel } from '../../config/claude.js';
import { writeTools } from '../tools/index.js';
import { DEV_AGENT_NAMES } from '../types.js';
import { SCAFFOLD_AGENT_PROMPT } from './prompt.js';
import { createDevAgentMiddleware } from '../middleware.js';

/**
 * Create the scaffold specialist agent.
 * Generates boilerplate following project conventions.
 */
export function createScaffoldAgent() {
  return createAgent({
    model: createDevModel(),
    tools: writeTools,
    name: DEV_AGENT_NAMES.SCAFFOLD,
    systemPrompt: SCAFFOLD_AGENT_PROMPT,
    middleware: createDevAgentMiddleware(DEV_AGENT_NAMES.SCAFFOLD),
  });
}
