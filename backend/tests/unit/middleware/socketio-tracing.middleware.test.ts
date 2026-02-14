import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  traceSocketEvent,
  traceConnection,
  traceDisconnect,
  addMessageAttributes,
  addJoinAttributes,
  addRateLimitAttributes,
  addSecurityAttributes,
} from '../../../src/middleware/socketio-tracing.middleware.js';

// Mock spans
const mockSpan = {
  setAttribute: vi.fn(),
  setStatus: vi.fn(),
  end: vi.fn(),
  recordException: vi.fn(),
};

const mockActiveSpan = {
  setAttribute: vi.fn(),
};

// Mock OpenTelemetry API
vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual('@opentelemetry/api');
  return {
    ...actual,
    trace: {
      getTracer: () => ({
        startSpan: () => mockSpan,
        startActiveSpan: (_: unknown, fn: (span: typeof mockSpan) => void) => fn(mockSpan),
      }),
      getActiveSpan: () => mockActiveSpan,
    },
  };
});

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Create mock socket
function createMockSocket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-socket-id',
    conn: {
      transport: { name: 'websocket' },
    },
    rooms: new Set(['test-socket-id']),
    user: undefined,
    ...overrides,
  };
}

describe('Socket.io Tracing Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('traceConnection', () => {
    it('should create a span with connection attributes', () => {
      const socket = createMockSocket();

      traceConnection(socket as never);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('messaging.system', 'socket.io');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('socket.id', 'test-socket-id');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('socket.event', 'connection');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('messaging.operation', 'connection');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('socket.transport', 'websocket');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should include user.id when authenticated', () => {
      const socket = createMockSocket({ user: { id: 'user-123' } });

      traceConnection(socket as never);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('user.id', 'user-123');
    });

    it('should not include user.id when unauthenticated', () => {
      const socket = createMockSocket();

      traceConnection(socket as never);

      const calls = mockSpan.setAttribute.mock.calls;
      const userIdCalls = calls.filter(
        (call: [string, unknown]) => call[0] === 'user.id',
      );
      expect(userIdCalls).toHaveLength(0);
    });

    it('should include rooms when socket has joined rooms', () => {
      const socket = createMockSocket({
        rooms: new Set(['test-socket-id', 'session:abc-123']),
      });

      traceConnection(socket as never);

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('socket.room', 'session:abc-123');
    });
  });

  describe('traceDisconnect', () => {
    it('should create a span with disconnect attributes', () => {
      const socket = createMockSocket();

      traceDisconnect(socket as never, 'transport close');

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('messaging.system', 'socket.io');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('socket.event', 'disconnect');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('messaging.operation', 'disconnect');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('socket.disconnect_reason', 'transport close');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe('traceSocketEvent', () => {
    it('should wrap a sync handler with tracing', () => {
      const socket = createMockSocket();
      const handler = vi.fn();

      const traced = traceSocketEvent(socket as never, 'test:event', handler);
      traced('arg1', 'arg2');

      expect(handler).toHaveBeenCalledWith('arg1', 'arg2');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('messaging.system', 'socket.io');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('socket.event', 'test:event');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('messaging.operation', 'receive');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should wrap an async handler and wait for completion', async () => {
      const socket = createMockSocket();
      const handler = vi.fn().mockResolvedValue(undefined);

      const traced = traceSocketEvent(socket as never, 'test:async', handler);
      traced();

      // Wait for the promise to resolve
      await vi.waitFor(() => {
        expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should record error on async handler failure', async () => {
      const socket = createMockSocket();
      const error = new Error('async failure');
      const handler = vi.fn().mockRejectedValue(error);

      const traced = traceSocketEvent(socket as never, 'test:fail', handler);
      traced();

      await vi.waitFor(() => {
        expect(mockSpan.setStatus).toHaveBeenCalledWith({
          code: SpanStatusCode.ERROR,
          message: 'async failure',
        });
      });
      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should record error on sync handler throw', () => {
      const socket = createMockSocket();
      const error = new Error('sync failure');
      const handler = vi.fn().mockImplementation(() => {
        throw error;
      });

      const traced = traceSocketEvent(socket as never, 'test:throw', handler);

      expect(() => traced()).toThrow('sync failure');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'sync failure',
      });
      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should handle non-Error thrown values', () => {
      const socket = createMockSocket();
      const handler = vi.fn().mockImplementation(() => {
        throw 'string error';
      });

      const traced = traceSocketEvent(socket as never, 'test:string', handler);

      expect(() => traced()).toThrow('string error');
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'string error',
      });
    });

    it('should set transport attribute from socket connection', () => {
      const socket = createMockSocket({
        conn: { transport: { name: 'polling' } },
      });
      const handler = vi.fn();

      const traced = traceSocketEvent(socket as never, 'test:polling', handler);
      traced();

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('socket.transport', 'polling');
    });
  });

  describe('addMessageAttributes', () => {
    it('should set session and content length on active span', () => {
      addMessageAttributes('session-abc', 150);

      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('session.id', 'session-abc');
      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('socket.room', 'session:session-abc');
      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('socket.content_length', 150);
    });

    it('should set extra attributes when provided', () => {
      addMessageAttributes('session-abc', 100, {
        'custom.key': 'value',
        'custom.count': 42,
      });

      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('custom.key', 'value');
      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('custom.count', 42);
    });

    it('should never include message content in attributes', () => {
      addMessageAttributes('session-abc', 500);

      const calls = mockActiveSpan.setAttribute.mock.calls;
      const values = calls.map((call: [string, unknown]) => call[1]);
      // No string values longer than a session ID should appear (content protection)
      values.forEach((value: unknown) => {
        if (typeof value === 'string') {
          expect(value.length).toBeLessThan(100);
        }
      });
    });
  });

  describe('addJoinAttributes', () => {
    it('should set session and room on active span', () => {
      addJoinAttributes('session-xyz');

      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('session.id', 'session-xyz');
      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('socket.room', 'session:session-xyz');
    });
  });

  describe('addRateLimitAttributes', () => {
    it('should record rate limit exceeded', () => {
      addRateLimitAttributes(true, 0);

      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('rate_limit.exceeded', true);
      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('rate_limit.tokens_remaining', 0);
    });

    it('should record rate limit not exceeded', () => {
      addRateLimitAttributes(false, 5);

      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('rate_limit.exceeded', false);
      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('rate_limit.tokens_remaining', 5);
    });

    it('should skip tokens_remaining when undefined', () => {
      addRateLimitAttributes(false);

      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('rate_limit.exceeded', false);
      const calls = mockActiveSpan.setAttribute.mock.calls;
      const tokensCalls = calls.filter(
        (call: [string, unknown]) => call[0] === 'rate_limit.tokens_remaining',
      );
      expect(tokensCalls).toHaveLength(0);
    });
  });

  describe('addSecurityAttributes', () => {
    it('should record clean message', () => {
      addSecurityAttributes(false, true);

      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('security.prompt_injection', false);
      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('validation.passed', true);
    });

    it('should record suspicious message', () => {
      addSecurityAttributes(true, true);

      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('security.prompt_injection', true);
      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('validation.passed', true);
    });

    it('should record failed validation', () => {
      addSecurityAttributes(false, false);

      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('security.prompt_injection', false);
      expect(mockActiveSpan.setAttribute).toHaveBeenCalledWith('validation.passed', false);
    });
  });
});
