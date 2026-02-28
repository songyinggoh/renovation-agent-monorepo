/**
 * Implement specialist agent.
 *
 * Uses the full dev toolset to write code following TDD,
 * run quality gates, and commit changes.
 */

import { createAgent } from 'langchain';
import { createDevModel } from '../../config/claude.js';
import { devTools } from '../tools/index.js';
import { DEV_AGENT_NAMES } from '../types.js';
import { IMPLEMENT_AGENT_PROMPT } from './prompt.js';
import { createDevAgentMiddleware } from '../middleware.js';

export function createImplementAgent() {
  return createAgent({
    model: createDevModel(),
    tools: devTools,
    name: DEV_AGENT_NAMES.IMPLEMENT,
    systemPrompt: IMPLEMENT_AGENT_PROMPT,
    middleware: createDevAgentMiddleware(DEV_AGENT_NAMES.IMPLEMENT),
  });
}
