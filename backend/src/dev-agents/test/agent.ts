import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createDevModel } from '../../config/claude.js';
import { devTools } from '../tools/index.js';
import { DEV_AGENT_NAMES } from '../types.js';
import { TEST_AGENT_PROMPT } from './prompt.js';

/**
 * Create the test specialist agent.
 *
 * Uses Claude Sonnet with the full dev toolset to run tests,
 * diagnose failures, apply fixes, and verify regressions.
 */
export function createTestAgent() {
  return createReactAgent({
    llm: createDevModel(),
    tools: devTools,
    name: DEV_AGENT_NAMES.TEST,
    prompt: TEST_AGENT_PROMPT,
  });
}
