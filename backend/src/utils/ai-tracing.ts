/**
 * AI Call Instrumentation (Phase IV, Phase 4)
 *
 * Provides OpenTelemetry tracing utilities for Gemini/LangChain AI calls.
 * Captures attributes defined in IA doc section 1.4 (AI Pipeline Layer).
 *
 * @see docs/implementation plan/Phase_IV_Information_Architecture.md
 */

import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

const tracer = trace.getTracer(
  'renovation-agent-ai',
  process.env.npm_package_version ?? '1.0.0',
);

/** Token usage from LangChain response_metadata */
export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** AI span attributes matching IA doc section 1.4 */
export interface AISpanAttributes {
  'ai.system'?: string;
  'ai.model'?: string;
  'ai.temperature'?: number;
  'ai.prompt.phase'?: string;
  'ai.prompt.history_size'?: number;
  'ai.tool.name'?: string;
  'ai.tool.calls_count'?: number;
  'ai.react_loop.iterations'?: number;
  [key: string]: string | number | boolean | undefined;
}

/**
 * Gemini pricing per 1M tokens (approximate, 2025 rates)
 * Used for ai.cost.estimated_usd attribute
 */
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gemini-1.5-pro': { input: 1.25, output: 5.00 },
};

const DEFAULT_PRICING = { input: 0.075, output: 0.30 };
const TOKENS_PER_MILLION = 1_000_000;

/**
 * Estimate cost in USD for a Gemini API call
 */
export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  if (promptTokens === 0 && completionTokens === 0) return 0;
  const pricing = GEMINI_PRICING[model] ?? DEFAULT_PRICING;
  return (promptTokens * pricing.input + completionTokens * pricing.output) / TOKENS_PER_MILLION;
}

/**
 * Record token usage attributes on a span
 */
export function recordTokenUsage(span: Span, usage: TokenUsage, model?: string): void {
  const prompt = usage.promptTokens ?? 0;
  const completion = usage.completionTokens ?? 0;
  const total = usage.totalTokens ?? prompt + completion;

  span.setAttribute('ai.usage.prompt_tokens', prompt);
  span.setAttribute('ai.usage.completion_tokens', completion);
  span.setAttribute('ai.usage.total_tokens', total);

  if (model && (prompt > 0 || completion > 0)) {
    span.setAttribute('ai.cost.estimated_usd', estimateCost(model, prompt, completion));
  }
}

/**
 * Extract token usage from LangChain response_metadata
 */
export function extractTokenUsage(
  responseMetadata: Record<string, unknown> | undefined,
): TokenUsage | null {
  if (!responseMetadata) return null;

  const tokenUsage = responseMetadata.tokenUsage as
    | { promptTokens?: number; completionTokens?: number; totalTokens?: number }
    | undefined;

  if (!tokenUsage) return null;

  return {
    promptTokens: tokenUsage.promptTokens,
    completionTokens: tokenUsage.completionTokens,
    totalTokens: tokenUsage.totalTokens,
  };
}

/**
 * Wrap an async AI operation in an OpenTelemetry span
 *
 * Records ai.* attributes from IA doc section 1.4.
 * Automatically records exceptions and sets error status on failure.
 *
 * @param spanName - Span name (e.g. 'ai.chat.invoke', 'ai.vision.invoke')
 * @param attributes - AI-specific span attributes
 * @param fn - Async operation to trace
 * @returns Result of the wrapped operation
 */
export async function traceAICall<T>(
  spanName: string,
  attributes: AISpanAttributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer.startActiveSpan(spanName, (span: Span) => {
    // Set initial attributes
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined) {
        span.setAttribute(key, value);
      }
    }

    return fn(span)
      .then((result) => {
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      })
      .catch((error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        span.recordException(err);
        throw error;
      })
      .finally(() => {
        span.end();
      });
  });
}

/**
 * Wrap a streaming AI operation in an OpenTelemetry span
 *
 * Tracks ai.stream.first_token_ms and ai.stream.total_ms timing.
 * The caller must invoke the returned callbacks during streaming.
 *
 * @param spanName - Span name (e.g. 'ai.stream')
 * @param attributes - AI-specific span attributes
 * @returns Object with span, onFirstToken, and endStream helpers
 */
export function startAIStreamSpan(
  spanName: string,
  attributes: AISpanAttributes,
): {
  span: Span;
  onFirstToken: () => void;
  endStream: (error?: Error) => void;
} {
  const span = tracer.startSpan(spanName);
  const startTime = performance.now();
  let firstTokenRecorded = false;

  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) {
      span.setAttribute(key, value);
    }
  }

  return {
    span,
    onFirstToken: () => {
      if (!firstTokenRecorded) {
        firstTokenRecorded = true;
        span.setAttribute('ai.stream.first_token_ms', Math.round(performance.now() - startTime));
      }
    },
    endStream: (error?: Error) => {
      span.setAttribute('ai.stream.total_ms', Math.round(performance.now() - startTime));
      if (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        span.recordException(error);
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();
    },
  };
}

