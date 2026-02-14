import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpanStatusCode } from '@opentelemetry/api';

/** Properly typed mock span to avoid `as never` casts */
interface MockSpan {
  setAttribute: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  recordException: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

// Use vi.hoisted to ensure mocks are available when vi.mock is hoisted
const { mockSpan, mockTracer } = vi.hoisted(() => {
  const span: MockSpan = {
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };

  const tracer = {
    startActiveSpan: vi.fn((_name: string, fn: (s: MockSpan) => unknown) => fn(span)),
    startSpan: vi.fn(() => span),
  };

  return { mockSpan: span, mockTracer: tracer };
});

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return {
    ...actual,
    trace: {
      getTracer: vi.fn(() => mockTracer),
    },
  };
});

import {
  estimateCost,
  extractTokenUsage,
  recordTokenUsage,
  traceAICall,
  startAIStreamSpan,
} from '../../../src/utils/ai-tracing.js';

/** Helper to filter mock.calls by attribute name */
function getAttrCalls(spy: ReturnType<typeof vi.fn>, attrName: string): unknown[][] {
  return spy.mock.calls.filter((call: unknown[]) => call[0] === attrName);
}

describe('ai-tracing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('estimateCost', () => {
    it('should calculate cost for gemini-2.5-flash', () => {
      const cost = estimateCost('gemini-2.5-flash', 1000, 500);
      expect(cost).toBeCloseTo(0.000225, 6);
    });

    it('should calculate cost for gemini-1.5-pro', () => {
      const cost = estimateCost('gemini-1.5-pro', 1000, 500);
      expect(cost).toBeCloseTo(0.00375, 5);
    });

    it('should use default pricing for unknown models', () => {
      const cost = estimateCost('unknown-model', 1000, 500);
      expect(cost).toBeCloseTo(0.000225, 6);
    });

    it('should return 0 for zero tokens', () => {
      expect(estimateCost('gemini-2.5-flash', 0, 0)).toBe(0);
    });

    it('should calculate exact cost using pricing formula', () => {
      // gemini-2.5-flash: input $0.075, output $0.30 per 1M tokens
      const cost = estimateCost('gemini-2.5-flash', 1_000_000, 1_000_000);
      expect(cost).toBe(0.375); // (1M * 0.075 + 1M * 0.30) / 1M
    });
  });

  describe('extractTokenUsage', () => {
    it('should extract token usage from response_metadata', () => {
      const metadata = {
        tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      };
      expect(extractTokenUsage(metadata)).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('should return null for undefined metadata', () => {
      expect(extractTokenUsage(undefined)).toBeNull();
    });

    it('should return null when tokenUsage is missing', () => {
      expect(extractTokenUsage({ other: 'data' })).toBeNull();
    });

    it('should handle partial token usage', () => {
      const metadata = { tokenUsage: { promptTokens: 100 } };
      expect(extractTokenUsage(metadata)).toEqual({
        promptTokens: 100,
        completionTokens: undefined,
        totalTokens: undefined,
      });
    });
  });

  describe('recordTokenUsage', () => {
    it('should set token usage attributes on span', () => {
      recordTokenUsage(mockSpan, { promptTokens: 100, completionTokens: 50, totalTokens: 150 });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.usage.prompt_tokens', 100);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.usage.completion_tokens', 50);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.usage.total_tokens', 150);
    });

    it('should calculate total tokens when not provided', () => {
      recordTokenUsage(mockSpan, { promptTokens: 100, completionTokens: 50 });
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.usage.total_tokens', 150);
    });

    it('should default to 0 for missing token counts', () => {
      recordTokenUsage(mockSpan, {});

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.usage.prompt_tokens', 0);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.usage.completion_tokens', 0);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.usage.total_tokens', 0);
    });

    it('should add cost estimate when model is provided', () => {
      recordTokenUsage(mockSpan, { promptTokens: 1000, completionTokens: 500 }, 'gemini-2.5-flash');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.cost.estimated_usd', expect.any(Number));
    });

    it('should not add cost when tokens are zero', () => {
      recordTokenUsage(mockSpan, { promptTokens: 0, completionTokens: 0 }, 'gemini-2.5-flash');
      expect(getAttrCalls(mockSpan.setAttribute, 'ai.cost.estimated_usd')).toHaveLength(0);
    });
  });

  describe('traceAICall', () => {
    it('should create a span and call the function', async () => {
      const result = await traceAICall(
        'ai.test.operation',
        { 'ai.system': 'gemini', 'ai.model': 'gemini-2.5-flash' },
        async () => 'test-result',
      );

      expect(result).toBe('test-result');
      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith('ai.test.operation', expect.any(Function));
    });

    it('should set attributes on the span', async () => {
      await traceAICall('ai.test', { 'ai.system': 'gemini', 'ai.temperature': 0.7 }, async () => 'ok');

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.system', 'gemini');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.temperature', 0.7);
    });

    it('should skip undefined attributes', async () => {
      await traceAICall('ai.test', { 'ai.system': 'gemini', 'ai.model': undefined }, async () => 'ok');

      expect(getAttrCalls(mockSpan.setAttribute, 'ai.system')).toHaveLength(1);
      expect(getAttrCalls(mockSpan.setAttribute, 'ai.model')).toHaveLength(0);
    });

    it('should set OK status on success', async () => {
      await traceAICall('ai.test', {}, async () => 'ok');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should set ERROR status and record exception on failure', async () => {
      const error = new Error('AI call failed');

      await expect(
        traceAICall('ai.test', {}, async () => { throw error; }),
      ).rejects.toThrow('AI call failed');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'AI call failed',
      });
      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should pass span to the callback for additional attributes', async () => {
      await traceAICall('ai.test', {}, async (span) => {
        span.setAttribute('custom.attr', 'value');
        return 'ok';
      });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('custom.attr', 'value');
    });
  });

  describe('startAIStreamSpan', () => {
    let perfNowSpy: ReturnType<typeof vi.spyOn>;
    let currentTime: number;

    beforeEach(() => {
      currentTime = 1000;
      perfNowSpy = vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
    });

    afterEach(() => {
      perfNowSpy.mockRestore();
    });

    it('should create a span with attributes', () => {
      const { span } = startAIStreamSpan('ai.stream', {
        'ai.system': 'gemini',
        'ai.model': 'gemini-2.5-flash',
      });

      expect(mockTracer.startSpan).toHaveBeenCalledWith('ai.stream');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.system', 'gemini');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.model', 'gemini-2.5-flash');
      expect(span).toBe(mockSpan);
    });

    it('should track first token timing', () => {
      const { onFirstToken } = startAIStreamSpan('ai.stream', {});

      currentTime = 1250;
      onFirstToken();

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.stream.first_token_ms', 250);
    });

    it('should only record first token once', () => {
      const { onFirstToken } = startAIStreamSpan('ai.stream', {});

      currentTime = 1100;
      onFirstToken();
      currentTime = 1200;
      onFirstToken(); // Should be ignored

      const firstTokenCalls = getAttrCalls(mockSpan.setAttribute, 'ai.stream.first_token_ms');
      expect(firstTokenCalls).toHaveLength(1);
      expect(firstTokenCalls[0][1]).toBe(100);
    });

    it('should track total stream duration on success', () => {
      const { endStream } = startAIStreamSpan('ai.stream', {});

      currentTime = 2500;
      endStream();

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.stream.total_ms', 1500);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should record error on stream failure', () => {
      const { endStream } = startAIStreamSpan('ai.stream', {});
      const error = new Error('Stream interrupted');

      currentTime = 1500;
      endStream(error);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('ai.stream.total_ms', 500);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Stream interrupted',
      });
      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });
});
