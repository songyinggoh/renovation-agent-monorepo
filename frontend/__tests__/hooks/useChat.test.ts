import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { useChat } from '@/hooks/useChat';

// Mock Socket.io client with proper typing
interface MockSocket {
  on: Mock;
  emit: Mock;
  disconnect: Mock;
  connected: boolean;
}

const mockSocket: MockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// Mock Supabase client
const mockSupabase = {
  auth: {
    getSession: vi.fn(),
  },
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => mockSupabase),
}));

// Mock fetchWithAuth for message history loading
const mockFetchWithAuth = vi.fn();
vi.mock('@/lib/api', () => ({
  fetchWithAuth: (...args: unknown[]) => mockFetchWithAuth(...args),
}));

// Helper to get mock handler by event name
function getMockHandler<T>(eventName: string): T | undefined {
  const calls = mockSocket.on.mock.calls as Array<[string, T]>;
  return calls.find((call) => call[0] === eventName)?.[1];
}

describe('useChat Hook - Phase 1.1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.connected = false;

    // Setup default fetchWithAuth mock (empty history)
    mockFetchWithAuth.mockResolvedValue({ messages: [] });

    // Setup default auth mock
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'valid-token-123',
        },
      },
      error: null,
    });
  });

  describe('Initialization', () => {
    it('should not connect without sessionId', () => {
      const { result } = renderHook(() => useChat(''));

      expect(result.current.isConnected).toBe(false);
      expect(mockSupabase.auth.getSession).not.toHaveBeenCalled();
    });

    it('should initialize socket with Supabase token', async () => {
      const { io } = await import('socket.io-client');

      renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSupabase.auth.getSession).toHaveBeenCalled();
        expect(io).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            auth: { token: 'valid-token-123' },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
          })
        );
      });
    });

    it('should set error when auth fails', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Auth failed' },
      });

      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(result.current.error).toContain('Authentication error');
      });
    });

    it('should connect anonymously when no token found', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { io } = await import('socket.io-client');

      renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(io).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            auth: {},
          })
        );
      });
    });

    it('should expose socketRef', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(result.current.socketRef).toBeDefined();
        expect(result.current.socketRef.current).toBeDefined();
      });
    });
  });

  describe('Connection Events', () => {
    it('should set isConnected to true on connect', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      });

      // Simulate connect event
      const connectHandler = getMockHandler<() => void>('connect');

      act(() => {
        mockSocket.connected = true;
        connectHandler?.();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
        expect(result.current.error).toBeNull();
      });

      // Verify it emits join_session
      expect(mockSocket.emit).toHaveBeenCalledWith('chat:join_session', { sessionId: 'session-123' });
    });

    it('should set isConnected to false on disconnect', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      });

      // First connect
      const connectHandler = getMockHandler<() => void>('connect');

      act(() => {
        mockSocket.connected = true;
        connectHandler?.();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Then disconnect
      const disconnectHandler = getMockHandler<(reason: string) => void>('disconnect');

      act(() => {
        mockSocket.connected = false;
        disconnectHandler?.('transport close');
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(false);
        expect(result.current.isAssistantTyping).toBe(false);
      });
    });

    it('should set error on connect_error', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
      });

      const errorHandler = getMockHandler<(err: Error) => void>('connect_error');

      act(() => {
        errorHandler?.(new Error('Connection refused'));
      });

      await waitFor(() => {
        expect(result.current.error).toContain('Connection error');
        expect(result.current.isConnected).toBe(false);
      });
    });
  });

  describe('Session Events', () => {
    it('should handle chat:session_joined event', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('chat:session_joined', expect.any(Function));
      });

      const joinedHandler = getMockHandler<(data: { sessionId: string }) => void>('chat:session_joined');

      act(() => {
        joinedHandler?.({ sessionId: 'session-123' });
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });

    it('should handle chat:message_ack event', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('chat:message_ack', expect.any(Function));
      });

      const ackHandler = getMockHandler<(data: { sessionId: string; status: string; timestamp: string }) => void>('chat:message_ack');

      act(() => {
        ackHandler?.({
          sessionId: 'session-123',
          status: 'received',
          timestamp: new Date().toISOString(),
        });
      });

      // Just verify no errors thrown
      expect(result.current.error).toBeNull();
    });
  });

  describe('Message Handling', () => {
    it('should send message via sendMessage()', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      // Wait for handlers to be registered
      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      });

      // First connect
      const connectHandler = getMockHandler<() => void>('connect');

      act(() => {
        mockSocket.connected = true;
        connectHandler?.();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Send message
      act(() => {
        result.current.sendMessage('Hello, assistant!');
      });

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith('chat:user_message', {
          sessionId: 'session-123',
          content: 'Hello, assistant!',
        });

        // Check optimistic update
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].content).toBe('Hello, assistant!');
        expect(result.current.messages[0].role).toBe('user');
      });
    });

    it('should not send message when not connected', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      act(() => {
        result.current.sendMessage('Should not send');
      });

      expect(mockSocket.emit).not.toHaveBeenCalledWith(
        'chat:user_message',
        expect.anything()
      );
    });

    it('should handle chat:assistant_token streaming', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('chat:assistant_token', expect.any(Function));
      });

      const tokenHandler = getMockHandler<(data: { sessionId: string; token: string; done?: boolean }) => void>('chat:assistant_token');

      // Simulate streaming tokens
      act(() => {
        tokenHandler?.({ sessionId: 'session-123', token: 'Hello', done: false });
      });

      await waitFor(() => {
        expect(result.current.isAssistantTyping).toBe(true);
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].content).toBe('Hello');
        expect(result.current.messages[0].role).toBe('assistant');
      });

      act(() => {
        tokenHandler?.({ sessionId: 'session-123', token: ' World', done: false });
      });

      await waitFor(() => {
        expect(result.current.messages[0].content).toBe('Hello World');
      });

      // Simulate done
      act(() => {
        tokenHandler?.({ sessionId: 'session-123', token: '', done: true });
      });

      await waitFor(() => {
        expect(result.current.isAssistantTyping).toBe(false);
      });
    });

    it('should ignore assistant tokens from different session', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('chat:assistant_token', expect.any(Function));
      });

      const tokenHandler = getMockHandler<(data: { sessionId: string; token: string; done?: boolean }) => void>('chat:assistant_token');

      act(() => {
        tokenHandler?.({ sessionId: 'different-session', token: 'Should ignore', done: false });
      });

      expect(result.current.messages).toHaveLength(0);
    });

    it('should handle chat:error event', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('chat:error', expect.any(Function));
      });

      const errorHandler = getMockHandler<(data: { sessionId: string; error: string }) => void>('chat:error');

      act(() => {
        errorHandler?.({
          sessionId: 'session-123',
          error: 'Something went wrong',
        });
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Something went wrong');
        expect(result.current.isAssistantTyping).toBe(false);
      });
    });

    it('should ignore errors from different session', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('chat:error', expect.any(Function));
      });

      const errorHandler = getMockHandler<(data: { sessionId: string; error: string }) => void>('chat:error');

      act(() => {
        errorHandler?.({
          sessionId: 'different-session',
          error: 'Should ignore',
        });
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('Message History Loading', () => {
    it('should load message history after joining session', async () => {
      const mockHistory = [
        { id: 'msg-1', role: 'user', content: 'Hello', created_at: '2026-01-01T00:00:00Z', session_id: 'session-123' },
        { id: 'msg-2', role: 'assistant', content: 'Hi there!', created_at: '2026-01-01T00:01:00Z', session_id: 'session-123' },
      ];

      mockFetchWithAuth.mockResolvedValue({ messages: mockHistory });

      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('chat:session_joined', expect.any(Function));
      });

      // Simulate session joined
      const joinedHandler = getMockHandler<(data: { sessionId: string }) => void>('chat:session_joined');

      await act(async () => {
        joinedHandler?.({ sessionId: 'session-123' });
      });

      await waitFor(() => {
        expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/sessions/session-123/messages');
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[0].content).toBe('Hello');
        expect(result.current.messages[1].content).toBe('Hi there!');
      });
    });

    it('should set isLoadingHistory while fetching', async () => {
      // Make fetchWithAuth hang
      let resolveFetch: (value: { messages: never[] }) => void;
      mockFetchWithAuth.mockReturnValue(new Promise((resolve) => {
        resolveFetch = resolve;
      }));

      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('chat:session_joined', expect.any(Function));
      });

      const joinedHandler = getMockHandler<(data: { sessionId: string }) => void>('chat:session_joined');

      act(() => {
        joinedHandler?.({ sessionId: 'session-123' });
      });

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(true);
      });

      // Resolve the fetch
      await act(async () => {
        resolveFetch!({ messages: [] });
      });

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });
    });

    it('should handle history load failure gracefully', async () => {
      mockFetchWithAuth.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('chat:session_joined', expect.any(Function));
      });

      const joinedHandler = getMockHandler<(data: { sessionId: string }) => void>('chat:session_joined');

      await act(async () => {
        joinedHandler?.({ sessionId: 'session-123' });
      });

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
        expect(result.current.messages).toHaveLength(0);
      });
    });
  });

  describe('Cleanup', () => {
    it('should disconnect on unmount', async () => {
      const { unmount } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalled();
      });

      unmount();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('Session Event Bridge Removal', () => {
    it('should NOT dispatch window CustomEvents for session events', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      });

      // session:rooms_updated and session:phase_changed listeners should NOT be registered
      const registeredEvents = (mockSocket.on.mock.calls as [string, unknown][]).map((call) => call[0]);
      expect(registeredEvents).not.toContain('session:rooms_updated');
      expect(registeredEvents).not.toContain('session:phase_changed');

      dispatchSpy.mockRestore();
    });
  });
});
