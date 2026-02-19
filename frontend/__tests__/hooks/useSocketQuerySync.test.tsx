import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';

// Mock socket
interface MockSocket {
  on: Mock;
  off: Mock;
  connected: boolean;
}

const mockSocket: MockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  connected: true,
};

// Mock logger before importing hook
vi.mock('@/lib/logger', () => ({
  Logger: class MockLogger {
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    debug = vi.fn();
  },
}));

import { useSocketQuerySync } from '@/hooks/useSocketQuerySync';

function getMockHandler<T>(eventName: string): T | undefined {
  const calls = mockSocket.on.mock.calls as Array<[string, T]>;
  return calls.find((call) => call[0] === eventName)?.[1];
}

describe('useSocketQuerySync', () => {
  let queryClient: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(queryClient, 'invalidateQueries');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should register all event listeners on mount', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    const registeredEvents = mockSocket.on.mock.calls.map((c: [string, unknown]) => c[0]);
    expect(registeredEvents).toContain('connect');
    expect(registeredEvents).toContain('session:rooms_updated');
    expect(registeredEvents).toContain('session:phase_changed');
    expect(registeredEvents).toContain('asset:processing_progress');
    expect(registeredEvents).toContain('render:started');
    expect(registeredEvents).toContain('render:complete');
    expect(registeredEvents).toContain('render:failed');
  });

  it('should remove all listeners on unmount', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    const { unmount } = renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    unmount();

    const removedEvents = mockSocket.off.mock.calls.map((c: [string, unknown]) => c[0]);
    expect(removedEvents).toContain('connect');
    expect(removedEvents).toContain('session:rooms_updated');
    expect(removedEvents).toContain('session:phase_changed');
    expect(removedEvents).toContain('asset:processing_progress');
    expect(removedEvents).toContain('render:started');
    expect(removedEvents).toContain('render:complete');
    expect(removedEvents).toContain('render:failed');
  });

  it('should invalidate session queries on reconnection', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    const connectHandler = getMockHandler<() => void>('connect');

    // First connect — should not invalidate
    act(() => connectHandler?.());
    vi.advanceTimersByTime(500);
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

    // Second connect (reconnection) — should invalidate
    act(() => connectHandler?.());
    vi.advanceTimersByTime(500);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['session', 'sess-1'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['session', 'sess-1', 'rooms'],
    });
  });

  it('should invalidate session on phase_changed with 100ms delay', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    const handler = getMockHandler<(data: { sessionId: string; phase: string }) => void>('session:phase_changed');

    act(() => handler?.({ sessionId: 'sess-1', phase: 'CHECKLIST' }));

    // Before delay — not invalidated yet
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

    // After delay
    act(() => vi.advanceTimersByTime(100));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['session', 'sess-1'],
    });
  });

  it('should invalidate rooms on rooms_updated with 200ms delay', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    const handler = getMockHandler<(data: { sessionId: string }) => void>('session:rooms_updated');

    act(() => handler?.({ sessionId: 'sess-1' }));

    act(() => vi.advanceTimersByTime(200));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['session', 'sess-1', 'rooms'],
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['session', 'sess-1'],
    });
  });

  it('should invalidate rooms on render:complete with 500ms delay', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    const handler = getMockHandler<(data: { assetId: string; roomId: string }) => void>('render:complete');

    act(() => handler?.({ assetId: 'a-1', roomId: 'r-1' }));

    act(() => vi.advanceTimersByTime(499));
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['session', 'sess-1', 'rooms'],
    });
  });

  it('should ignore events from different sessions', () => {
    const socketRef = { current: mockSocket as unknown as import('socket.io-client').Socket };

    renderHook(
      () => useSocketQuerySync({ sessionId: 'sess-1', socketRef }),
      { wrapper },
    );

    const handler = getMockHandler<(data: { sessionId: string }) => void>('session:rooms_updated');

    act(() => handler?.({ sessionId: 'different-session' }));
    act(() => vi.advanceTimersByTime(500));

    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });
});
