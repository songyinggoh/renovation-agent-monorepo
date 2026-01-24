import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { StateGraph, START, MessagesAnnotation } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph';
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
 * Uses LangGraph StateGraph with Gemini 2.5 for intelligent conversation
 * Manages message history, streaming responses, and session-based memory
 */
export class ChatService {
  private model: ChatGoogleGenerativeAI;
  private messageService: MessageService;
  private graph;

  constructor() {
    this.model = createStreamingModel();
    this.messageService = new MessageService();
    this.graph = this.createAgent();
    logger.info('ChatService initialized with LangGraph agent');
  }

  /**
   * Create the LangGraph agent with StateGraph
   * Uses a single call_model node for conversational AI
   *
   * @returns Compiled StateGraph with memory checkpointer
   */
  private createAgent() {
    const workflow = new StateGraph(MessagesAnnotation)
      .addNode('call_model', async (state) => {
        const messages = [...state.messages];

        // Prepend system message if not already present
        if (messages.length === 0 || messages[0].getType() !== 'system') {
          messages.unshift(new SystemMessage(RENOVATION_AGENT_SYSTEM_PROMPT) as BaseMessage);
        }

        logger.info('LangGraph: Invoking model', {
          messageCount: messages.length,
        });

        const response = await this.model.invoke(messages as BaseMessage[]);
        return { messages: [response] };
      })
      .addEdge(START, 'call_model');

    // Add memory checkpointing for session-based conversation state
    const checkpointer = new MemorySaver();
    const graph = workflow.compile({ checkpointer });

    logger.info('LangGraph agent compiled with MemorySaver checkpointer');
    return graph;
  }

  /**
   * Process a user message and stream the AI response using LangGraph
   *
   * @param sessionId - The session ID for context and thread_id
   * @param userMessage - The user's message content
   * @param callback - Callbacks for streaming tokens
   * @returns Promise that resolves when streaming is complete
   */
  async processMessage(
    sessionId: string,
    userMessage: string,
    callback: StreamCallback
  ): Promise<void> {
    logger.info('Processing user message with LangGraph', {
      sessionId,
      messageLength: userMessage.length,
    });

    try {
      // Step 1: Save user message to database (for long-term persistence)
      await this.messageService.saveMessage({
        sessionId,
        userId: null, // Nullable for Phases 1-7
        role: 'user',
        content: userMessage,
        type: 'text',
      });

      // Step 2: Load message history from database for initial context
      const history = await this.messageService.getRecentMessages(sessionId, 20);
      const historicalMessages = this.convertHistoryToMessages(history);

      // Step 3: Stream response from LangGraph agent
      let fullResponse = '';

      const config = {
        configurable: { thread_id: sessionId },
        streamMode: 'messages' as const,
      };

      // Combine historical messages with new user message
      const inputMessages = [...historicalMessages, new HumanMessage(userMessage) as BaseMessage];

      const stream = await this.graph.stream(
        { messages: inputMessages as BaseMessage[] },
        config
      );

      // Process streaming chunks
      for await (const chunk of stream) {
        const [message] = chunk;
        if (message && typeof message.content === 'string' && message.content) {
          fullResponse += message.content;
          callback.onToken(message.content);
        }
      }

      logger.info('AI response streamed successfully via LangGraph', {
        sessionId,
        responseLength: fullResponse.length,
      });

      // Step 4: Save assistant message to database (for long-term persistence)
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
      logger.error('Error processing message with LangGraph', error as Error, { sessionId });
      callback.onError(error as Error);
      throw error;
    }
  }

  /**
   * Convert database chat history to LangChain messages
   * Used to load historical context for the LangGraph agent
   *
   * @param history - Previous messages from database
   * @returns Array of LangChain messages
   */
  private convertHistoryToMessages(history: ChatMessage[]): BaseMessage[] {
    const messages: BaseMessage[] = [];

    // Convert each database message to appropriate LangChain message type
    for (const msg of history) {
      if (msg.role === 'user') {
        messages.push(new HumanMessage(msg.content));
      } else if (msg.role === 'assistant') {
        messages.push(new AIMessage(msg.content));
      } else if (msg.role === 'system') {
        messages.push(new SystemMessage(msg.content));
      }
    }

    logger.info('Converted history to messages', {
      totalMessages: messages.length,
      historyCount: history.length,
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
