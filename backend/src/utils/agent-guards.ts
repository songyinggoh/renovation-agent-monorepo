import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { END } from '@langchain/langgraph';
import { Logger } from './logger.js';

const logger = new Logger({ serviceName: 'AgentGuards' });

/** Maximum ReAct loop iterations before forced termination */
export const MAX_REACT_ITERATIONS = 10;

/** Timeout for entire agent turn in milliseconds (best-effort — unreliable in LangGraph JS) */
export const TURN_TIMEOUT_MS = 120_000;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whitelist of allowed tool names for the ReAct agent */
export const ALLOWED_TOOLS = [
  'get_style_examples',
  'search_products',
  'save_intake_state',
  'save_checklist_state',
  'save_product_recommendation',
  'generate_render',
  'save_renders_state',
] as const;

export type AllowedToolName = (typeof ALLOWED_TOOLS)[number];

/**
 * Validate and sanitize a session ID — must be a valid UUID.
 * Prevents prompt injection via the {{SESSION_ID}} template variable.
 *
 * @throws Error if sessionId is not a valid UUID
 */
export function sanitizeSessionId(sessionId: string): string {
  if (!UUID_REGEX.test(sessionId)) {
    throw new Error('Invalid session ID format: must be UUID');
  }
  return sessionId;
}

/**
 * Create a guarded shouldContinue function for the ReAct agent graph.
 *
 * Acts as SECONDARY defense (primary is LangGraph's built-in recursionLimit).
 * Provides:
 * - Max iteration enforcement with logging
 * - Tool name whitelist validation
 * - Iteration counter reset on non-tool-call responses
 *
 * @param maxIterations - Maximum tool-call cycles before forced END (default: 10)
 * @returns shouldContinue function for StateGraph conditional edges
 */
export function createSafeShouldContinue(maxIterations = MAX_REACT_ITERATIONS) {
  let iterations = 0;

  return function shouldContinue(state: {
    messages: BaseMessage[];
  }): typeof END | 'tools' {
    const lastMessage = state.messages[state.messages.length - 1];

    // No messages or missing last message
    if (!lastMessage) {
      iterations = 0;
      return END;
    }

    // Check if the last message is an AI message with tool calls
    if (
      lastMessage._getType() === 'ai' &&
      (lastMessage as AIMessage).tool_calls?.length
    ) {
      iterations++;

      // Max iteration guard
      if (iterations >= maxIterations) {
        logger.warn(
          'ReAct agent hit max iterations, forcing termination',
          undefined,
          {
            iterations,
            maxIterations,
          }
        );
        iterations = 0; // Reset for next invocation
        return END;
      }

      // Tool name whitelist validation
      const calls = (lastMessage as AIMessage).tool_calls ?? [];
      const invalidTools = calls.filter(
        (tc) => !(ALLOWED_TOOLS as readonly string[]).includes(tc.name)
      );
      if (invalidTools.length > 0) {
        logger.warn(
          'Agent attempted to call invalid tools, forcing termination',
          undefined,
          {
            invalidTools: invalidTools.map((t) => t.name),
          }
        );
        iterations = 0;
        return END;
      }

      return 'tools';
    }

    // Non-tool-call response — reset counter and end
    iterations = 0;
    return END;
  };
}

/**
 * Format an async tool response for the agent.
 * Includes an explicit instruction to NOT re-call the tool.
 */
export interface AsyncToolResponse {
  status: 'started';
  jobId: string;
  message: string;
  estimatedDurationSec?: number;
}

export function formatAsyncToolResponse(
  toolName: string,
  jobId: string,
  estimatedDurationSec?: number
): string {
  const response: AsyncToolResponse = {
    status: 'started',
    jobId,
    message: `${toolName} job started (ID: ${jobId}). The user will receive real-time updates. Do NOT call this tool again for the same request.`,
    ...(estimatedDurationSec !== undefined && { estimatedDurationSec }),
  };
  return JSON.stringify(response);
}
