import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { createClient } from '@/lib/supabase/client';
import { Message, SocketEvents } from '@/types/chat';

export const useChat = (sessionId: string) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!sessionId) return;

    let socket: Socket;

    const initSocket = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (!token) {
        console.error('No auth token found');
        return;
      }

      socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000', {
        auth: { token },
        transports: ['websocket'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('Socket connected');
        setIsConnected(true);
        socket.emit('chat:join_session', sessionId);
      });

      socket.on('disconnect', () => {
        console.log('Socket disconnected');
        setIsConnected(false);
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        setIsConnected(false);
      });

      socket.on('chat:session_joined', (data: { sessionId: string }) => {
        console.log('Joined session:', data.sessionId);
      });

      // Handle message acknowledgment/receipt
      socket.on('chat:message_ack', (data: { sessionId: string; status: string; timestamp: string }) => {
        // Ideally update message status here
        console.log('Message ack:', data);
      });

      // TODO: Handle incoming assistant tokens/messages
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

    setMessages((prev) => [...prev, newMessage]);

    socketRef.current.emit('chat:user_message', {
      sessionId,
      content,
    });
  }, [sessionId, isConnected]);

  return {
    messages,
    sendMessage,
    isConnected,
  };
};
