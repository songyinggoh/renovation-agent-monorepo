import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

interface MockSocket {
  on: Mock;
  off: Mock;
}

const mockSocket: MockSocket = {
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('@/lib/logger', () => {
  class MockLogger {
    info() {}
    warn() {}
    error() {}
    debug() {}
  }
  return { Logger: MockLogger };
});

import { useRenderState } from '@/hooks/useRenderState';
import type { Socket } from 'socket.io-client';

function getMockHandler<T>(eventName: string): T | undefined {
  const calls = mockSocket.on.mock.calls as Array<[string, T]>;
  return calls.find((call) => call[0] === eventName)?.[1];
}

describe('useRenderState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should start with empty renders map', () => {
    const socketRef = { current: mockSocket as unknown as Socket };
    const { result } = renderHook(() => useRenderState(socketRef));

    expect(result.current.activeRenders.size).toBe(0);
  });

  it('should track render:started', () => {
    const socketRef = { current: mockSocket as unknown as Socket };
    const { result } = renderHook(() => useRenderState(socketRef));

    const handler = getMockHandler<(data: { assetId: string; roomId: string; sessionId: string }) => void>('render:started');

    act(() => {
      handler?.({ assetId: 'asset-1', roomId: 'room-1', sessionId: 'sess-1' });
    });

    expect(result.current.activeRenders.size).toBe(1);
    const render = result.current.activeRenders.get('asset-1');
    expect(render?.status).toBe('started');
    expect(render?.roomId).toBe('room-1');
  });

  it('should update to complete on render:complete', () => {
    vi.useFakeTimers();
    const socketRef = { current: mockSocket as unknown as Socket };
    const { result } = renderHook(() => useRenderState(socketRef));

    const startHandler = getMockHandler<(data: { assetId: string; roomId: string; sessionId: string }) => void>('render:started');
    const completeHandler = getMockHandler<(data: { assetId: string; roomId: string }) => void>('render:complete');

    act(() => {
      startHandler?.({ assetId: 'asset-1', roomId: 'room-1', sessionId: 'sess-1' });
    });

    act(() => {
      completeHandler?.({ assetId: 'asset-1', roomId: 'room-1' });
    });

    expect(result.current.activeRenders.get('asset-1')?.status).toBe('complete');

    // Removed after display delay
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.activeRenders.size).toBe(0);

    vi.useRealTimers();
  });

  it('should update to failed on render:failed', () => {
    vi.useFakeTimers();
    const socketRef = { current: mockSocket as unknown as Socket };
    const { result } = renderHook(() => useRenderState(socketRef));

    const startHandler = getMockHandler<(data: { assetId: string; roomId: string; sessionId: string }) => void>('render:started');
    const failHandler = getMockHandler<(data: { assetId: string; roomId: string; error: string }) => void>('render:failed');

    act(() => {
      startHandler?.({ assetId: 'asset-1', roomId: 'room-1', sessionId: 'sess-1' });
    });

    act(() => {
      failHandler?.({ assetId: 'asset-1', roomId: 'room-1', error: 'Generation failed' });
    });

    const render = result.current.activeRenders.get('asset-1');
    expect(render?.status).toBe('failed');
    expect(render?.error).toBe('Generation failed');

    // Removed after display delay
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.activeRenders.size).toBe(0);

    vi.useRealTimers();
  });

  it('should clear all state on reconnect', () => {
    const socketRef = { current: mockSocket as unknown as Socket };
    const { result } = renderHook(() => useRenderState(socketRef));

    const startHandler = getMockHandler<(data: { assetId: string; roomId: string; sessionId: string }) => void>('render:started');
    const connectHandler = getMockHandler<() => void>('connect');

    act(() => {
      startHandler?.({ assetId: 'asset-1', roomId: 'room-1', sessionId: 'sess-1' });
    });
    expect(result.current.activeRenders.size).toBe(1);

    act(() => connectHandler?.());
    expect(result.current.activeRenders.size).toBe(0);
  });

  it('should clean up listeners on unmount', () => {
    const socketRef = { current: mockSocket as unknown as Socket };
    const { unmount } = renderHook(() => useRenderState(socketRef));

    unmount();

    const removedEvents = (mockSocket.off.mock.calls as [string, unknown][]).map((c) => c[0]);
    expect(removedEvents).toContain('render:started');
    expect(removedEvents).toContain('render:complete');
    expect(removedEvents).toContain('render:failed');
    expect(removedEvents).toContain('connect');
  });
});
