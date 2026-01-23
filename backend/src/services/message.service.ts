import { eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chatMessages, type ChatMessage, type NewChatMessage } from '../db/schema/messages.schema.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'MessageService' });

/**
 * Service for managing chat messages
 * Handles CRUD operations for chat_messages table
 */
export class MessageService {
  /**
   * Save a new chat message to the database
   *
   * @param message - The message data to insert
   * @returns The created message with generated ID
   */
  async saveMessage(message: NewChatMessage): Promise<ChatMessage> {
    logger.info('Saving message', {
      sessionId: message.sessionId,
      role: message.role,
      type: message.type,
      contentLength: message.content?.length || 0,
    });

    try {
      const [saved] = await db.insert(chatMessages).values(message).returning();

      if (!saved) {
        throw new Error('Failed to save message: No record returned');
      }

      logger.info('Message saved successfully', {
        messageId: saved.id,
        sessionId: saved.sessionId,
      });

      return saved;
    } catch (error) {
      logger.error('Failed to save message', error as Error, {
        sessionId: message.sessionId,
        role: message.role,
      });
      throw error;
    }
  }

  /**
   * Get chat message history for a session
   *
   * @param sessionId - The session ID to fetch messages for
   * @param limit - Maximum number of messages to fetch (default: 50)
   * @returns Array of messages ordered by creation time (oldest first)
   */
  async getMessageHistory(sessionId: string, limit: number = 50): Promise<ChatMessage[]> {
    logger.info('Fetching message history', { sessionId, limit });

    try {
      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(limit);

      // Reverse to get chronological order (oldest first)
      const chronologicalMessages = messages.reverse();

      logger.info('Message history fetched', {
        sessionId,
        count: chronologicalMessages.length,
      });

      return chronologicalMessages;
    } catch (error) {
      logger.error('Failed to fetch message history', error as Error, { sessionId });
      throw error;
    }
  }

  /**
   * Get the last N messages for a session
   * Useful for loading recent context for the AI agent
   *
   * @param sessionId - The session ID
   * @param count - Number of recent messages to fetch
   * @returns Array of recent messages in chronological order
   */
  async getRecentMessages(sessionId: string, count: number = 10): Promise<ChatMessage[]> {
    logger.info('Fetching recent messages', { sessionId, count });

    try {
      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, sessionId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(count);

      // Reverse to get chronological order
      const chronologicalMessages = messages.reverse();

      logger.info('Recent messages fetched', {
        sessionId,
        count: chronologicalMessages.length,
      });

      return chronologicalMessages;
    } catch (error) {
      logger.error('Failed to fetch recent messages', error as Error, { sessionId });
      throw error;
    }
  }

  /**
   * Convert database messages to LangChain message format
   * Maps our ChatMessage type to the format expected by LangChain
   *
   * @param messages - Array of ChatMessage from database
   * @returns Array of messages in LangChain format
   */
  toLangChainMessages(
    messages: ChatMessage[]
  ): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    return messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));
  }
}
