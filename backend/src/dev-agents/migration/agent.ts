import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { createDevModel } from '../../config/claude.js';
import { writeTools } from '../tools/index.js';
import { DEV_AGENT_NAMES } from '../types.js';
import { MIGRATION_AGENT_PROMPT } from './prompt.js';

/**
 * Create a migration specialist agent.
 *
 * Uses Drizzle ORM conventions to handle schema changes and
 * generate migrations via `drizzle-kit generate`.
 *
 * Toolset: writeTools (read/write/search/bash — no git commit).
 */
export function createMigrationAgent() {
  return createReactAgent({
    llm: createDevModel(),
    tools: writeTools,
    name: DEV_AGENT_NAMES.MIGRATION,
    prompt: MIGRATION_AGENT_PROMPT,
  });
}
