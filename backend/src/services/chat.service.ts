import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { createStreamingModel } from '../config/gemini.js';
import { Logger } from '../utils/logger.js';
import { MessageService } from './message.service.js';
import { type ChatMessage } from '../db/schema/messages.schema.js';

const logger = new Logger({ serviceName: 'ChatService' });

/**
 * System prompt for the renovation agent
 * Defines the agent's personality, capabilities, and behavior
 */
const RENOVATION_AGENT_SYSTEM_PROMPT = `You are a helpful AI renovation planning assistant. Your role is to help users plan and design their home renovation projects.

You assist with:
- Understanding the user's renovation goals and preferences
- Analyzing room photos and floor plans
- Suggesting design styles and creating mood boards
- Recommending furniture and decor products
- Creating detailed renovation plans and checklists
- Generating realistic room renders

You are friendly, professional, and detail-oriented. You ask clarifying questions when needed and provide specific, actionable advice. You understand interior design principles, color theory, and spatial planning.

Current conversation phase: INTAKE (gathering initial requirements)

Please engage with the user naturally and help them articulate their renovation vision.`;

/**
 * Callback interface for streaming responses
 */
export interface StreamCallback {
  onToken: (token: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
}

/**
 * ChatService handles AI-powered chat interactions
 *
 * Integrates LangChain with Gemini 2.5 for intelligent conversation
 * Manages message history and streaming responses
 */
export class ChatService {
  private model: ChatGoogleGenerativeAI;
  private messageService: MessageService;

  constructor() {
    this.model = createStreamingModel();
    this.messageService = new MessageService();
    logger.info('ChatService initialized');
  }

  /**
   * Process a user message and stream the AI response
   *
   * @param sessionId - The session ID for context
   * @param userMessage - The user's message content
   * @param callback - Callbacks for streaming tokens
   * @returns Promise that resolves when streaming is complete
   */
  async processMessage(
    sessionId: string,
    userMessage: string,
    callback: StreamCallback
  ): Promise<void> {
    logger.info('Processing user message', {
      sessionId,
      messageLength: userMessage.length,
    });

    try {
      // Step 1: Save user message to database
      await this.messageService.saveMessage({
        sessionId,
        userId: null, // Nullable for Phases 1-7
        role: 'user',
        content: userMessage,
        type: 'text',
      });

      // Step 2: Load message history for context
      const history = await this.messageService.getRecentMessages(sessionId, 20);
      const messages = this.buildMessageChain(history, userMessage);

      // Step 3: Stream response from Gemini
      let fullResponse = '';

      const stream = await this.model.stream(messages);

      for await (const chunk of stream) {
        const token = chunk.content as string;
        fullResponse += token;
        callback.onToken(token);
      }

      logger.info('AI response streamed successfully', {
        sessionId,
        responseLength: fullResponse.length,
      });

      // Step 4: Save assistant message to database
      await this.messageService.saveMessage({
        sessionId,
        userId: null,
        role: 'assistant',
        content: fullResponse,
        type: 'text',
      });

      // Step 5: Notify completion
      callback.onComplete(fullResponse);
    } catch (error) {
      logger.error('Error processing message', error as Error, { sessionId });
      callback.onError(error as Error);
      throw error;
    }
  }

  /**
   * Build the message chain for the AI model
   * Includes system prompt + conversation history + new user message
   *
   * @param history - Previous messages from database
   * @param newUserMessage - The new message from the user
   * @returns Array of LangChain messages
   */
  private buildMessageChain(history: ChatMessage[], newUserMessage: string): BaseMessage[] {
    const messages: BaseMessage[] = [];

    // Add system prompt
    messages.push(new SystemMessage(RENOVATION_AGENT_SYSTEM_PROMPT));

    // Add conversation history
    for (const msg of history) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        messages.push(new AIMessage(msg.content));
      } else if (msg.role === 'system') {
        messages.push(new SystemMessage(msg.content));
      }
    }

    // Add new user message
    messages.push(new HumanMessage(newUserMessage));

    logger.info('Built message chain', {
      totalMessages: messages.length,
      historyMessages: history.length,
    });

    return messages;
  }

  /**
   * Get conversation history for a session
   *
   * @param sessionId - The session ID
   * @param limit - Maximum number of messages to fetch
   * @returns Array of chat messages
   */
  async getHistory(sessionId: string, limit: number = 50): Promise<ChatMessage[]> {
    return this.messageService.getMessageHistory(sessionId, limit);
  }
}
