import type { RoomSummary } from './session.js';
import type { RenovationPhase } from './phases.js';

export interface ChatJoinSessionPayload {
  sessionId: string;
}

export interface MessageAttachment {
  assetId: string;
  fileName?: string;
}

export interface ChatUserMessagePayload {
  sessionId: string;
  content: string;
  attachments?: MessageAttachment[];
}

export interface ChatMessageAckPayload {
  sessionId: string;
  status: string;
  timestamp: string;
}

export interface ChatAssistantTokenPayload {
  sessionId: string;
  token: string;
  done?: boolean;
}

export interface ChatToolCallPayload {
  sessionId: string;
  toolName: string;
  input: string;
}

export interface ChatToolResultPayload {
  sessionId: string;
  toolName: string;
  result: string;
}

export interface ChatErrorPayload {
  sessionId?: string;
  error: string;
  details?: Array<{ field: string; message: string }>;
}

export interface ChatWarningPayload {
  sessionId: string;
  warning?: string;
}

export interface SessionRoomsUpdatedPayload {
  sessionId: string;
  rooms: RoomSummary[];
}

export interface SessionPhaseChangedPayload {
  sessionId: string;
  phase: RenovationPhase;
}

export interface AssetProcessingProgressPayload {
  assetId: string;
  variantType?: string;
  status: 'processing' | 'ready' | 'failed';
  progress: number; // 0-100
}

export interface ClientToServerEvents {
  'chat:join_session': (data: ChatJoinSessionPayload) => void;
  'chat:user_message': (data: ChatUserMessagePayload) => void;
}

export interface ServerToClientEvents {
  'chat:session_joined': (data: ChatJoinSessionPayload) => void;
  'chat:message_ack': (data: ChatMessageAckPayload) => void;
  'chat:assistant_token': (data: ChatAssistantTokenPayload) => void;
  'chat:tool_call': (data: ChatToolCallPayload) => void;
  'chat:tool_result': (data: ChatToolResultPayload) => void;
  'chat:error': (data: ChatErrorPayload) => void;
  'chat:warning': (data: ChatWarningPayload) => void;
  'session:rooms_updated': (data: SessionRoomsUpdatedPayload) => void;
  'session:phase_changed': (data: SessionPhaseChangedPayload) => void;
  'asset:processing_progress': (data: AssetProcessingProgressPayload) => void;
}
