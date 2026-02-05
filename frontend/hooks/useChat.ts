import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { createClient } from '@/lib/supabase/client';
import { Message } from '@/types/chat';

export const useChat = (sessionId: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!sessionId) return;

    let socket: Socket;

    const initSocket = async () => {
      try {
        const { data: { session }, error: authError } = await supabase.auth.getSession();

        if (authError) {
          setError(`Authentication error: ${authError.message}`);
          console.error('Auth error:', authError);
          return;
        }

        const token = session?.access_token;

        if (!token) {
          setError('No authentication token found. Please sign in.');
          console.error('No auth token found');
          return;
        }

        socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000', {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
        });

        socketRef.current = socket;

        socket.on('connect', () => {
          console.log('[useChat] Connected to server');
          setIsConnected(true);
          setError(null);
          socket.emit('chat:join_session', sessionId);
        });

        socket.on('disconnect', (reason) => {
          console.log('[useChat] Disconnected:', reason);
          setIsConnected(false);
          setIsAssistantTyping(false);
          if (reason === 'io server disconnect') {
            setError('Disconnected by server. Please refresh.');
          }
        });

        socket.on('connect_error', (err) => {
          console.error('[useChat] Connection error:', err);
          setIsConnected(false);
          setError(`Connection error: ${err.message}`);
        });

        socket.on('chat:session_joined', (data: { sessionId: string }) => {
          console.log('[useChat] Joined session:', data.sessionId);
          setError(null);
        });

        // Handle message acknowledgment/receipt
        socket.on('chat:message_ack', (data: { sessionId: string; status: string; timestamp: string }) => {
          console.log('[useChat] Message acknowledged:', data);
        });

        // Handle incoming assistant tokens (streaming)
        socket.on('chat:assistant_token', (data: { sessionId: string; token: string; done?: boolean }) => {
          if (data.sessionId !== sessionId) return;

          if (data.done) {
            // Final token - mark assistant as done typing
            setIsAssistantTyping(false);
            console.log('[useChat] Assistant finished streaming');
          } else {
            // Streaming token
            setIsAssistantTyping(true);

            // Append token to the last assistant message or create new one
            setMessages((prev: Message[]) => {
              const lastMessage = prev[prev.length - 1];

              if (lastMessage && lastMessage.role === 'assistant') {
                // Append to existing assistant message
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastMessage,
                    content: lastMessage.content + data.token,
                  },
                ];
              } else {
                // Create new assistant message
                return [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    role: 'assistant' as const,
                    content: data.token,
                    created_at: new Date().toISOString(),
                    session_id: sessionId,
                  },
                ];
              }
            });
          }
        });

        // Handle errors from server
        socket.on('chat:error', (data: { sessionId: string; error: string }) => {
          if (data.sessionId !== sessionId) return;
          console.error('[useChat] Server error:', data.error);
          setError(data.error);
          setIsAssistantTyping(false);
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to initialize chat: ${errorMessage}`);
        console.error('[useChat] Initialization error:', err);
      }
    };

    initSocket();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [sessionId, supabase.auth]);

  const sendMessage = useCallback((content: string) => {
    if (!socketRef.current || !isConnected) return;

    // Optimistically add message
    const newMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
      session_id: sessionId,
    };

    setMessages((prev: Message[]) => [...prev, newMessage]);

    socketRef.current.emit('chat:user_message', {
      sessionId,
      content,
    });
  }, [sessionId, isConnected]);

  return {
    messages,
    sendMessage,
    isConnected,
    error,
    isAssistantTyping,
  };
};
