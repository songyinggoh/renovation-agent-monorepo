import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChat } from '@/hooks/useChat';
import { Socket } from 'socket.io-client';

// Mock Socket.io client
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
} as unknown as Socket;

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

describe('useChat Hook - Phase 1.1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.connected = false;

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

    it('should set error when no token found', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(result.current.error).toContain('No authentication token found');
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
      const connectHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];

      act(() => {
        mockSocket.connected = true;
        connectHandler?.();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
        expect(result.current.error).toBeNull();
      });

      // Verify it emits join_session
      expect(mockSocket.emit).toHaveBeenCalledWith('chat:join_session', 'session-123');
    });

    it('should set isConnected to false on disconnect', async () => {
      const { result } = renderHook(() => useChat('session-123'));

      await waitFor(() => {
        expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      });

      // First connect
      const connectHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];

      act(() => {
        mockSocket.connected = true;
        connectHandler?.();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Then disconnect
      const disconnectHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'disconnect'
      )?.[1];

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

      const errorHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'connect_error'
      )?.[1];

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

      const joinedHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'chat:session_joined'
      )?.[1];

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

      const ackHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'chat:message_ack'
      )?.[1];

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

      // First connect
      const connectHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'connect'
      )?.[1];

      await act(async () => {
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

      const tokenHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'chat:assistant_token'
      )?.[1];

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

      const tokenHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'chat:assistant_token'
      )?.[1];

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

      const errorHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'chat:error'
      )?.[1];

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

      const errorHandler = mockSocket.on.mock.calls.find(
        (call) => call[0] === 'chat:error'
      )?.[1];

      act(() => {
        errorHandler?.({
          sessionId: 'different-session',
          error: 'Should ignore',
        });
      });

      expect(result.current.error).toBeNull();
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
});
