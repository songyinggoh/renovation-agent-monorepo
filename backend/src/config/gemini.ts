import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { env } from './env.js';
import { Logger } from '../utils/logger.js';
import type { AISpanAttributes } from '../utils/ai-tracing.js';

const logger = new Logger({ serviceName: 'GeminiConfig' });

/**
 * Gemini model configuration for the renovation agent
 *
 * This file provides factory functions for creating Gemini models
 * optimized for different use cases in the renovation planning system.
 *
 * Phase IV: Each factory attaches traceAttributes for OTel instrumentation (IA doc 1.4).
 */

/**
 * Default Gemini model configuration
 * Using Gemini 2.5 Flash for optimal balance of speed, cost, and quality
 */
const DEFAULT_MODEL_CONFIG = {
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  maxOutputTokens: 8192,
  topP: 0.95,
  topK: 40,
};

/** Model with attached trace attributes for OTel instrumentation */
export type TracedModel = ChatGoogleGenerativeAI & { traceAttributes: AISpanAttributes };

/**
 * Build IA doc section 1.4 tracing attributes for an AI model config
 */
export function getModelTraceAttributes(
  model: string,
  temperature: number,
): AISpanAttributes {
  return {
    'ai.system': 'gemini',
    'ai.model': model,
    'ai.temperature': temperature,
  };
}

/**
 * Create a Gemini model instance for chat/conversation
 *
 * @param options - Optional model configuration overrides
 * @returns Configured ChatGoogleGenerativeAI instance with traceAttributes
 */
export function createChatModel(options?: {
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
}): TracedModel {
  const config = {
    ...DEFAULT_MODEL_CONFIG,
    ...options,
    apiKey: env.GOOGLE_API_KEY,
  };

  logger.info('Creating Gemini chat model', {
    model: config.model,
    temperature: config.temperature,
    maxOutputTokens: config.maxOutputTokens,
  });

  const model = new ChatGoogleGenerativeAI(config);
  return Object.assign(model, {
    traceAttributes: getModelTraceAttributes(config.model, config.temperature),
  });
}

/**
 * Create a Gemini model instance optimized for vision/image analysis
 *
 * Vision models are used for analyzing user-uploaded room images
 * and providing design recommendations based on visual input.
 *
 * @returns Configured ChatGoogleGenerativeAI instance with vision support
 */
export function createVisionModel(): TracedModel {
  logger.info('Creating Gemini vision model');

  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash', // Supports vision
    temperature: 0.5, // Lower temperature for more precise image analysis
    maxOutputTokens: 4096,
    apiKey: env.GOOGLE_API_KEY,
  });
  return Object.assign(model, {
    traceAttributes: getModelTraceAttributes('gemini-2.5-flash', 0.5),
  });
}

/**
 * Create a Gemini model instance optimized for structured output
 *
 * Used for generating checklists, plans, and other structured data
 * where precise JSON formatting is required.
 *
 * @returns Configured ChatGoogleGenerativeAI instance
 */
export function createStructuredModel(): TracedModel {
  logger.info('Creating Gemini structured output model');

  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    temperature: 0.3, // Lower temperature for more consistent structure
    maxOutputTokens: 8192,
    topP: 0.9,
    apiKey: env.GOOGLE_API_KEY,
  });
  return Object.assign(model, {
    traceAttributes: getModelTraceAttributes('gemini-2.5-flash', 0.3),
  });
}

/**
 * Create a Gemini model instance optimized for streaming responses
 *
 * Used for the main chat interface where we want to stream tokens
 * back to the user in real-time via Socket.io.
 *
 * @returns Configured ChatGoogleGenerativeAI instance
 */
export function createStreamingModel(): TracedModel {
  logger.info('Creating Gemini streaming model');

  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    temperature: 0.7,
    maxOutputTokens: 8192,
    streaming: true, // Enable streaming
    apiKey: env.GOOGLE_API_KEY,
  });
  return Object.assign(model, {
    traceAttributes: getModelTraceAttributes('gemini-2.5-flash', 0.7),
  });
}

/**
 * Model name constants for easy reference
 */
export const GEMINI_MODELS = {
  FLASH: 'gemini-2.5-flash',
  PRO: 'gemini-1.5-pro',
} as const;
