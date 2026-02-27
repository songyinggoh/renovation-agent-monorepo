import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentEvent } from '../../../src/agents/types.js';

// Mock Socket.io
const mockEmit = vi.fn();
const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
const mockIo = { to: mockTo } as unknown;

// Mock Logger
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

// Mock OTel
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: vi.fn().mockReturnValue(null),
  },
}));

describe('AgentEventEmitter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should emit agent:start event to Socket.io room', async () => {
    const { AgentEventEmitter } = await import('../../../src/agents/agent-event-emitter.js');
    const emitter = new AgentEventEmitter(mockIo as never, mockLogger as never, 'session-123');

    const event: AgentEvent = { type: 'agent:start', phase: 'INTAKE' as never, sessionId: 'session-123' };
    emitter.emit(event);

    expect(mockTo).toHaveBeenCalledWith('session-123');
    expect(mockEmit).toHaveBeenCalledWith('agent:start', event);
  });

  it('should log non-error events via Logger.info', async () => {
    const { AgentEventEmitter } = await import('../../../src/agents/agent-event-emitter.js');
    const emitter = new AgentEventEmitter(mockIo as never, mockLogger as never, 'session-123');

    const event: AgentEvent = { type: 'agent:start', phase: 'INTAKE' as never, sessionId: 'session-123' };
    emitter.emit(event);

    expect(mockLogger.info).toHaveBeenCalledWith('agent:start', expect.objectContaining({ type: 'agent:start' }));
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should log agent:error events via Logger.error', async () => {
    const { AgentEventEmitter } = await import('../../../src/agents/agent-event-emitter.js');
    const emitter = new AgentEventEmitter(mockIo as never, mockLogger as never, 'session-123');

    const event: AgentEvent = { type: 'agent:error', error: 'test error', phase: 'INTAKE' as never };
    emitter.emit(event);

    expect(mockLogger.error).toHaveBeenCalledWith('agent:error', expect.any(Error), expect.objectContaining({ type: 'agent:error' }));
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it('should add OTel span event when active span exists', async () => {
    const mockSpan = { addEvent: vi.fn() };
    const { trace } = await import('@opentelemetry/api');
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as never);

    const { AgentEventEmitter } = await import('../../../src/agents/agent-event-emitter.js');
    const emitter = new AgentEventEmitter(mockIo as never, mockLogger as never, 'session-123');

    const event: AgentEvent = { type: 'agent:tool_call', tool: 'search_products', args: { query: 'tiles' } };
    emitter.emit(event);

    expect(mockSpan.addEvent).toHaveBeenCalledWith('agent:tool_call', expect.any(Object));
  });

  it('should not throw when OTel span is null', async () => {
    const { trace } = await import('@opentelemetry/api');
    vi.mocked(trace.getActiveSpan).mockReturnValue(null);

    const { AgentEventEmitter } = await import('../../../src/agents/agent-event-emitter.js');
    const emitter = new AgentEventEmitter(mockIo as never, mockLogger as never, 'session-123');

    expect(() => emitter.emit({ type: 'agent:complete', phase: 'INTAKE' as never, result: 'done' })).not.toThrow();
  });
});
