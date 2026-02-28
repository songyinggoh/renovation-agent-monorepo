import {
  toolCallLimitMiddleware,
  modelCallLimitMiddleware,
  modelFallbackMiddleware,
} from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { createCostTrackingMiddleware } from './cost-tracking.js';
import type { DevAgentName } from './types.js';

/** Per-agent tool call limits (per run) */
export const TOOL_CALL_LIMITS: Record<DevAgentName, number> = {
  'scaffold-agent': 30,
  'migration-agent': 30,
  'test-agent': 50,
  'review-agent': 30,
  'research-agent': 50,
  'implement-agent': 100,
  'dev-supervisor': 10,
};

/** Per-agent model call limits (per run) */
export const MODEL_CALL_LIMITS: Record<DevAgentName, number> = {
  'scaffold-agent': 20,
  'migration-agent': 20,
  'test-agent': 30,
  'review-agent': 20,
  'research-agent': 30,
  'implement-agent': 50,
  'dev-supervisor': 10,
};

/**
 * Create the middleware stack for a dev agent.
 *
 * Stack order:
 * 1. toolCallLimit — cheapest check, runs first
 * 2. modelCallLimit — prevents runaway LLM calls
 * 3. modelFallback — retries with fallback on failure
 * 4. costTracking — logs token usage (always runs, even near limits)
 */
export function createDevAgentMiddleware(
  agentName: DevAgentName,
): AgentMiddleware[] {
  return [
    toolCallLimitMiddleware({
      runLimit: TOOL_CALL_LIMITS[agentName],
      exitBehavior: 'end',
    }),
    modelCallLimitMiddleware({
      runLimit: MODEL_CALL_LIMITS[agentName],
      exitBehavior: 'end',
    }),
    modelFallbackMiddleware(
      'anthropic:claude-sonnet-4-20250514',
    ),
    createCostTrackingMiddleware(agentName),
  ];
}
