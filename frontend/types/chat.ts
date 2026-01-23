export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  session_id: string;
}

export interface SocketEvents {
  'chat:join_session': (sessionId: string) => void;
  'chat:session_joined': (data: { sessionId: string }) => void;
  'chat:user_message': (data: { sessionId: string; content: string }) => void;
  'chat:message_ack': (data: { sessionId: string; status: string; timestamp: string }) => void;
  'chat:assistant_token': (data: { sessionId: string; token: string; done?: boolean }) => void;
  'chat:error': (data: { sessionId: string; error: string }) => void;
}
