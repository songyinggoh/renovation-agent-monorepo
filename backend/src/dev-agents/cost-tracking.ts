import { createMiddleware } from 'langchain';
import type { AIMessage } from '@langchain/core/messages';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'DevAgentCost' });

/**
 * Custom middleware that logs token usage after each model call.
 * Uses wrapModelCall to intercept the response and extract usage_metadata.
 */
export function createCostTrackingMiddleware(agentName: string) {
  return createMiddleware({
    name: 'cost_tracking',
    wrapModelCall: async (request, handler) => {
      const response = await handler(request);

      // AIMessage includes usage_metadata with token counts
      const msg = response as AIMessage;
      const usage = msg.usage_metadata;
      if (usage) {
        logger.info('Dev agent model call', {
          agent: agentName,
          inputTokens: usage.input_tokens,
          outputTokens: usage.output_tokens,
          totalTokens: usage.total_tokens,
          model: msg.response_metadata?.model,
        });
      }

      return response;
    },
  });
}
