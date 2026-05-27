import { ChatAnthropic } from '@langchain/anthropic';
import { env } from './env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'ClaudeConfig' });

/**
 * Claude model configuration for the dev-agent framework
 *
 * This file provides factory functions for creating Claude models
 * used by the multi-agent orchestration system (dev-agent CLI).
 *
 * NOTE: Production chat uses Gemini (see gemini.ts).
 *       Claude models are dev-only for agent tooling.
 */

/**
 * Model name constants for easy reference
 */
export const CLAUDE_MODELS = {
  SONNET: 'claude-sonnet-4-20250514',
  OPUS: 'claude-opus-4-20250514',
} as const;

/**
 * Validate that the Anthropic API key is configured.
 * Returns the key as a narrowed string type.
 */
function requireAnthropicKey(): string {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is required for dev-agent. Set it in backend/.env'
    );
  }
  return env.ANTHROPIC_API_KEY;
}

/**
 * Create a Claude Sonnet model for dev-agent tasks.
 * Used for: scaffold, migration, test, implement agents.
 */
export function createDevModel() {
  const apiKey = requireAnthropicKey();

  logger.info('Creating Claude dev model', {
    model: CLAUDE_MODELS.SONNET,
    temperature: 0,
    maxTokens: 8192,
  });

  return new ChatAnthropic({
    modelName: CLAUDE_MODELS.SONNET,
    anthropicApiKey: apiKey,
    temperature: 0,
    maxTokens: 8192,
  });
}

/**
 * Create a Claude Opus model for complex reasoning tasks.
 * Used for: review agent (deeper reasoning needed).
 */
export function createDevReviewModel() {
  const apiKey = requireAnthropicKey();

  logger.info('Creating Claude review model', {
    model: CLAUDE_MODELS.OPUS,
    temperature: 0,
    maxTokens: 8192,
  });

  return new ChatAnthropic({
    modelName: CLAUDE_MODELS.OPUS,
    anthropicApiKey: apiKey,
    temperature: 0,
    maxTokens: 8192,
  });
}
