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
  async saveMessage(message: NewChatMessage): Promise<ChatMessage> {
    logger.info('Saving message', {
      sessionId: message.sessionId,
      role: message.role,
      type: message.type,
      contentLength: message.content?.length || 0,
    });

    const [saved] = await db.insert(chatMessages).values(message).returning();

    if (!saved) {
      throw new Error('Failed to save message: No record returned');
    }

    logger.info('Message saved successfully', {
      messageId: saved.id,
      sessionId: saved.sessionId,
    });

    return saved;
  }

  async getMessageHistory(sessionId: string, limit: number = 50): Promise<ChatMessage[]> {
    logger.info('Fetching message history', { sessionId, limit });

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);

    return messages.reverse();
  }

  async getRecentMessages(sessionId: string, count: number = 10): Promise<ChatMessage[]> {
    logger.info('Fetching recent messages', { sessionId, count });

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(count);

    return messages.reverse();
  }

  toLangChainMessages(
    messages: ChatMessage[]
  ): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    return messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));
  }
}
