import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
  ToolMessage,
  type AIMessageChunk,
} from '@langchain/core/messages';
import { StateGraph, START, END, MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { eq } from 'drizzle-orm';
import { createStreamingModel } from '../config/gemini.js';
import { getSystemPrompt } from '../config/prompts.js';
import { renovationTools } from '../tools/index.js';
import { Logger } from '../utils/logger.js';
import { MessageService } from './message.service.js';
import { getCheckpointer } from './checkpointer.service.js';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { type ChatMessage } from '../db/schema/messages.schema.js';

const logger = new Logger({ serviceName: 'ChatService' });

/**
 * Callback interface for streaming responses
 * Includes optional tool event callbacks for ReAct agent
 */
export interface StreamCallback {
  onToken: (token: string) => void;
  onComplete: (fullResponse: string) => void;
  onError: (error: Error) => void;
  onToolCall?: (toolName: string, input: string) => void;
  onToolResult?: (toolName: string, result: string) => void;
}

/**
 * ChatService handles AI-powered chat interactions using a ReAct agent
 *
 * Uses LangGraph StateGraph with Gemini 2.5 Flash and tool calling
 * for intelligent, tool-augmented conversation with phase-aware prompts.
 */
export class ChatService {
  private model: ChatGoogleGenerativeAI;
  private messageService: MessageService;
  private graph;

  constructor() {
    this.model = createStreamingModel();
    this.messageService = new MessageService();
    this.graph = this.createReActAgent();
    logger.info('ChatService initialized with ReAct agent');
  }

  /**
   * Create the ReAct agent graph with tool calling
   *
   * Graph: START → call_model → shouldContinue? → tools → call_model (loop)
   *                                             → END (no tool calls)
   *
   * @returns Compiled StateGraph with tool calling and checkpointer
   */
  private createReActAgent() {
    const modelWithTools = this.model.bindTools(renovationTools);

    const toolNode = new ToolNode(renovationTools);

    function shouldContinue(
      state: typeof MessagesAnnotation.State
    ): typeof END | 'tools' {
      const lastMessage = state.messages[state.messages.length - 1];
      if (
        lastMessage &&
        lastMessage._getType() === 'ai' &&
        (lastMessage as AIMessage).tool_calls?.length
      ) {
        return 'tools';
      }
      return END;
    }

    const workflow = new StateGraph(MessagesAnnotation)
      .addNode('call_model', async (state) => {
        logger.info('ReAct: Invoking model', {
          messageCount: state.messages.length,
        });
        const response = await modelWithTools.invoke(
          state.messages as BaseMessage[]
        );
        return { messages: [response] };
      })
      .addNode('tools', toolNode)
      .addEdge(START, 'call_model')
      .addConditionalEdges('call_model', shouldContinue)
      .addEdge('tools', 'call_model');

    const checkpointer = getCheckpointer();
    const graph = workflow.compile({ checkpointer });

    logger.info('ReAct agent compiled with tool calling and checkpointer');
    return graph;
  }

  /**
   * Fetch the current phase for a session
   *
   * @param sessionId - The session ID
   * @returns Phase string (defaults to 'INTAKE')
   */
  private async getSessionPhase(sessionId: string): Promise<string> {
    try {
      const [session] = await db
        .select({ phase: renovationSessions.phase })
        .from(renovationSessions)
        .where(eq(renovationSessions.id, sessionId))
        .limit(1);
      return session?.phase ?? 'INTAKE';
    } catch (err) {
      logger.warn('Failed to fetch session phase, defaulting to INTAKE', undefined, {
        sessionId,
        error: (err as Error).message,
      });
      return 'INTAKE';
    }
  }

  /**
   * Process a user message through the ReAct agent and stream the response
   *
   * Handles tool calls and results, saving all interactions to the database
   * and firing appropriate callbacks for real-time Socket.io events.
   *
   * @param sessionId - The session ID for context and thread_id
   * @param userMessage - The user's message content
   * @param callback - Callbacks for streaming tokens and tool events
   */
  async processMessage(
    sessionId: string,
    userMessage: string,
    callback: StreamCallback
  ): Promise<void> {
    logger.info('Processing user message with ReAct agent', {
      sessionId,
      messageLength: userMessage.length,
    });

    try {
      // Step 1: Get session phase
      // Note: LangGraph checkpointer handles message history persistence,
      // so we don't need to load it here
      const phase = await this.getSessionPhase(sessionId);

      // Step 2: Save user message to database
      await this.messageService.saveMessage({
        sessionId,
        userId: null,
        role: 'user',
        content: userMessage,
        type: 'text',
      });

      // Step 3: Build phase-aware system prompt and input messages
      // NOTE: The LangGraph checkpointer already persists message history,
      // so we only pass the new user message here to avoid duplication.
      // System prompt is included on every turn to maintain phase context.
      const systemPrompt = getSystemPrompt(phase, sessionId);

      const inputMessages: BaseMessage[] = [
        new SystemMessage(systemPrompt),
        new HumanMessage(userMessage),
      ];

      // Step 5: Stream response from ReAct agent
      let fullResponse = '';
      const emittedToolCalls = new Set<string>(); // Track by tool call ID, not name

      const config = {
        configurable: { thread_id: sessionId },
        streamMode: 'messages' as const,
      };

      const stream = await this.graph.stream(
        { messages: inputMessages as BaseMessage[] },
        config
      );

      for await (const chunk of stream) {
        const [message, metadata] = chunk as [
          BaseMessage,
          Record<string, unknown>,
        ];
        const nodeId = metadata?.langgraph_node as string | undefined;

        // Tool execution results (from 'tools' node)
        if (nodeId === 'tools' && message) {
          const toolMsg = message as unknown as ToolMessage;
          const toolName = toolMsg.name ?? 'unknown';
          const toolResult =
            typeof toolMsg.content === 'string'
              ? toolMsg.content
              : JSON.stringify(toolMsg.content);

          callback.onToolResult?.(toolName, toolResult);

          await this.messageService.saveMessage({
            sessionId,
            userId: null,
            role: 'assistant',
            content: toolResult,
            type: 'tool_result',
            toolName,
            toolOutput: this.safeJsonParse(toolResult),
          });
          continue;
        }

        // Model output (from 'call_model' node)
        if (nodeId === 'call_model' && message) {
          const aiChunk = message as unknown as AIMessageChunk;

          // Detect tool call chunks (model is requesting tool execution)
          if (
            aiChunk.tool_call_chunks &&
            aiChunk.tool_call_chunks.length > 0
          ) {
            for (const tc of aiChunk.tool_call_chunks) {
              // Use tc.id (unique call ID) not tc.name to allow multiple calls to same tool
              const callId = tc.id || tc.name || 'unknown';
              if (tc.name && !emittedToolCalls.has(callId)) {
                emittedToolCalls.add(callId);
                callback.onToolCall?.(tc.name, '');

                await this.messageService.saveMessage({
                  sessionId,
                  userId: null,
                  role: 'assistant',
                  content: `Calling tool: ${tc.name}`,
                  type: 'tool_call',
                  toolName: tc.name,
                });
              }
            }
            continue;
          }

          // Regular text content - stream to user
          if (typeof aiChunk.content === 'string' && aiChunk.content) {
            fullResponse += aiChunk.content;
            callback.onToken(aiChunk.content);
          }
        }
      }

      logger.info('ReAct agent response completed', {
        sessionId,
        responseLength: fullResponse.length,
        toolCallCount: emittedToolCalls.size,
      });

      // Step 6: Save final assistant text response to database
      if (fullResponse) {
        await this.messageService.saveMessage({
          sessionId,
          userId: null,
          role: 'assistant',
          content: fullResponse,
          type: 'text',
        });
      }

      // Step 7: Notify completion
      callback.onComplete(fullResponse);
    } catch (error) {
      logger.error('Error processing message with ReAct agent', error as Error, {
        sessionId,
      });
      callback.onError(error as Error);
      throw error;
    }
  }

  /**
   * Safely parse a JSON string, returning null on failure
   */
  private safeJsonParse(str: string): Record<string, unknown> | null {
    try {
      return JSON.parse(str) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /**
   * Convert database chat history to LangChain messages
   */
  private convertHistoryToMessages(history: ChatMessage[]): BaseMessage[] {
    const constructors: Record<string, (content: string) => BaseMessage> = {
      user: (content) => new HumanMessage(content),
      assistant: (content) => new AIMessage(content),
      system: (content) => new SystemMessage(content),
    };

    return history
      .filter((msg) => msg.role in constructors)
      .map((msg) => constructors[msg.role]!(msg.content));
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
