/**
 * Re-exported from shared-types (single source of truth)
 */
export type { MessageRole, MessageType } from '@renovation/shared-types';
export type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@renovation/shared-types';

import type { MessageRole, MessageType } from '@renovation/shared-types';

/**
 * Frontend message shape (snake_case to match API response)
 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  session_id: string;
  type?: MessageType;
  tool_name?: string;
  tool_data?: Record<string, unknown>;
  imageUrls?: string[];
}
