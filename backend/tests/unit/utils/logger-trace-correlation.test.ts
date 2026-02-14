import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock request-id middleware
vi.mock('../../../src/middleware/request-id.middleware.js', () => ({
  getRequestId: vi.fn(() => undefined),
}));

// Mock span context
const mockSpanContext = {
  traceId: 'abc123def456abc123def456abc12345',
  spanId: 'span1234span5678',
  traceFlags: 1,
};

const mockSpan = {
  spanContext: vi.fn(() => mockSpanContext),
};

let mockActiveSpan: typeof mockSpan | undefined = mockSpan;

vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return {
    ...actual,
    trace: {
      getActiveSpan: () => mockActiveSpan,
    },
    isSpanContextValid: (ctx: typeof mockSpanContext) =>
      ctx.traceId !== '00000000000000000000000000000000' &&
      ctx.spanId !== '0000000000000000',
  };
});

import { Logger } from '../../../src/utils/logger.js';

describe('Logger Trace Correlation', () => {
  let logger: Logger;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new Logger({ serviceName: 'TestService' });
    consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('should inject trace_id and span_id when span is active', () => {
    mockActiveSpan = mockSpan;

    logger.info('Test message');

    expect(consoleSpy).toHaveBeenCalledOnce();
    const logOutput = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(logOutput.trace_id).toBe('abc123def456abc123def456abc12345');
    expect(logOutput.span_id).toBe('span1234span5678');
  });

  it('should not include trace fields when no span is active', () => {
    mockActiveSpan = undefined;

    logger.info('No span');

    const logOutput = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(logOutput.trace_id).toBeUndefined();
    expect(logOutput.span_id).toBeUndefined();
  });

  it('should preserve existing metadata alongside trace context', () => {
    mockActiveSpan = mockSpan;

    logger.info('Test', { userId: '123', action: 'login' });

    const logOutput = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(logOutput.userId).toBe('123');
    expect(logOutput.action).toBe('login');
    expect(logOutput.trace_id).toBe('abc123def456abc123def456abc12345');
    expect(logOutput.span_id).toBe('span1234span5678');
  });

  it('should not break with invalid span context', () => {
    const invalidSpan = {
      spanContext: () => ({
        traceId: '00000000000000000000000000000000',
        spanId: '0000000000000000',
        traceFlags: 0,
      }),
    };
    mockActiveSpan = invalidSpan as typeof mockSpan;

    expect(() => logger.info('Invalid span')).not.toThrow();

    const logOutput = JSON.parse(consoleSpy.mock.calls[0][0] as string);
    expect(logOutput.trace_id).toBeUndefined();
    expect(logOutput.span_id).toBeUndefined();
  });

  it('should include trace context in error logs', () => {
    mockActiveSpan = mockSpan;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.error('Something failed', new Error('test error'), { sessionId: 'abc' });

    const logOutput = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(logOutput.trace_id).toBe('abc123def456abc123def456abc12345');
    expect(logOutput.span_id).toBe('span1234span5678');
    expect(logOutput.sessionId).toBe('abc');
    expect(logOutput.error.message).toBe('test error');

    errorSpy.mockRestore();
  });

  it('should include trace context in warn logs', () => {
    mockActiveSpan = mockSpan;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('Warning message', undefined, { context: 'test' });

    const logOutput = JSON.parse(warnSpy.mock.calls[0][0] as string);
    expect(logOutput.trace_id).toBe('abc123def456abc123def456abc12345');
    expect(logOutput.context).toBe('test');

    warnSpy.mockRestore();
  });
});
