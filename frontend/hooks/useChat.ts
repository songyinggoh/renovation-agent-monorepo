import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { createClient } from '@/lib/supabase/client';
import { fetchWithAuth } from '@/lib/api';
import { Message } from '@/types/chat';
import { Logger } from '@/lib/logger';

const logger = new Logger({ serviceName: 'useChat' });

export const useChat = (sessionId: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!sessionId) return;

    let socket: Socket;

    const loadMessageHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const data = await fetchWithAuth(`/api/sessions/${sessionId}/messages`);
        const history: Message[] = (data.messages || []).map(
          (msg: Record<string, unknown>) => ({
            id: msg.id as string,
            role: msg.role as Message['role'],
            content: msg.content as string,
            created_at: msg.created_at as string,
            session_id: msg.session_id as string,
          })
        );
        setMessages(history);
      } catch (err) {
        logger.error('Failed to load message history', err as Error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    const initSocket = async () => {
      try {
        const { data: { session }, error: authError } = await supabase.auth.getSession();

        if (authError) {
          setError(`Authentication error: ${authError.message}`);
          logger.error('Auth error', authError);
          return;
        }

        const token = session?.access_token;

        if (!token) {
          setError('No authentication token found. Please sign in.');
          logger.error('No auth token found', new Error('Missing token'));
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
          logger.info('Connected to server');
          setIsConnected(true);
          setError(null);
          socket.emit('chat:join_session', sessionId);
        });

        socket.on('disconnect', (reason) => {
          logger.info('Disconnected', { reason });
          setIsConnected(false);
          setIsAssistantTyping(false);
          if (reason === 'io server disconnect') {
            setError('Disconnected by server. Please refresh.');
          }
        });

        socket.on('connect_error', (err) => {
          logger.error('Connection error', err);
          setIsConnected(false);
          setError(`Connection error: ${err.message}`);
        });

        socket.on('chat:session_joined', (data: { sessionId: string }) => {
          logger.info('Joined session', { sessionId: data.sessionId });
          setError(null);
          loadMessageHistory();
        });

        // Handle message acknowledgment/receipt
        socket.on('chat:message_ack', (data: { sessionId: string; status: string; timestamp: string }) => {
          logger.debug('Message acknowledged', { sessionId: data.sessionId });
        });

        // Handle incoming assistant tokens (streaming)
        socket.on('chat:assistant_token', (data: { sessionId: string; token: string; done?: boolean }) => {
          if (data.sessionId !== sessionId) return;

          if (data.done) {
            // Final token - mark assistant as done typing
            setIsAssistantTyping(false);
            logger.info('Assistant finished streaming');
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

        // Handle tool call events (agent is calling a tool)
        socket.on('chat:tool_call', (data: { sessionId: string; toolName: string; input: string }) => {
          if (data.sessionId !== sessionId) return;
          logger.info('Tool call', { toolName: data.toolName });

          setMessages((prev: Message[]) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: data.toolName,
              created_at: new Date().toISOString(),
              session_id: sessionId,
              type: 'tool_call',
              tool_name: data.toolName,
            },
          ]);
        });

        // Handle tool result events (tool returned a result)
        socket.on('chat:tool_result', (data: { sessionId: string; toolName: string; result: string }) => {
          if (data.sessionId !== sessionId) return;
          logger.info('Tool result', { toolName: data.toolName });

          let toolData: Record<string, unknown> = {};
          try {
            toolData = JSON.parse(data.result) as Record<string, unknown>;
          } catch {
            toolData = { raw: data.result };
          }

          setMessages((prev: Message[]) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant' as const,
              content: data.result,
              created_at: new Date().toISOString(),
              session_id: sessionId,
              type: 'tool_result',
              tool_name: data.toolName,
              tool_data: toolData,
            },
          ]);
        });

        // Handle errors from server
        socket.on('chat:error', (data: { sessionId: string; error: string }) => {
          if (data.sessionId !== sessionId) return;
          logger.error('Server error', new Error(data.error));
          setError(data.error);
          setIsAssistantTyping(false);
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to initialize chat: ${errorMessage}`);
        logger.error('Initialization error', err instanceof Error ? err : new Error(String(err)));
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
    isLoadingHistory,
  };
};
