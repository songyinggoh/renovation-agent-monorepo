import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  BaseMessage,
  ToolMessage,
  type AIMessageChunk,
} from '@langchain/core/messages';
import { StateGraph, START, MessagesAnnotation, GraphRecursionError } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { eq } from 'drizzle-orm';
import { createStreamingModel, type TracedModel } from '../config/gemini.js';
import { getSystemPrompt } from '../config/prompts.js';
import { renovationTools } from '../tools/index.js';
import { Logger } from '../utils/logger.js';
import {
  traceAICall,
  startAIStreamSpan,
  extractTokenUsage,
  recordTokenUsage,
} from '../utils/ai-tracing.js';
import { createSafeShouldContinue, MAX_REACT_ITERATIONS } from '../utils/agent-guards.js';
import { MessageService } from './message.service.js';
import { AssetService } from './asset.service.js';
import { getCheckpointer } from './checkpointer.service.js';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { type ChatMessage } from '../db/schema/messages.schema.js';
import type { MessageAttachment } from '@renovation/shared-types';

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
 *
 * Phase IV: Instrumented with OpenTelemetry spans for AI call tracing (IA doc 1.4).
 */
export class ChatService {
  private model: TracedModel;
  private messageService: MessageService;
  private assetService: AssetService;
  private graph;

  constructor() {
    this.model = createStreamingModel();
    this.messageService = new MessageService();
    this.assetService = new AssetService();
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

    // Secondary guard: tool whitelist + iteration logging (primary is recursionLimit at stream time)
    const shouldContinue = createSafeShouldContinue();

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
   * Phase IV: Wrapped in OTel spans tracking AI attributes from IA doc section 1.4.
   *
   * @param sessionId - The session ID for context and thread_id
   * @param userMessage - The user's message content
   * @param callback - Callbacks for streaming tokens and tool events
   */
  /**
   * Resolve attachment asset IDs to signed download URLs
   */
  private async resolveAttachmentUrls(attachments: MessageAttachment[]): Promise<string[]> {
    const results = await Promise.allSettled(
      attachments.map((a) => this.assetService.getSignedUrl(a.assetId))
    );

    const urls: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === 'fulfilled' && result.value) {
        urls.push(result.value);
      } else {
        logger.warn('Failed to resolve attachment URL', undefined, {
          assetId: attachments[i]!.assetId,
          reason: result.status === 'rejected' ? (result.reason as Error).message : 'null URL',
        });
      }
    }
    return urls;
  }

  async processMessage(
    sessionId: string,
    userMessage: string,
    callback: StreamCallback,
    attachments?: MessageAttachment[]
  ): Promise<void> {
    logger.info('Processing user message with ReAct agent', {
      sessionId,
      messageLength: userMessage.length,
      attachmentCount: attachments?.length ?? 0,
    });

    const modelAttrs = this.model.traceAttributes;

    await traceAICall(
      'ai.chat.processMessage',
      {
        ...modelAttrs,
        'ai.prompt.history_size': 0, // Updated after history load
      },
      async (parentSpan) => {
        try {
          // Step 1: Load message history BEFORE saving the new message
          // to avoid duplicating the user message in context
          const [phase, history] = await Promise.all([
            this.getSessionPhase(sessionId),
            this.messageService.getRecentMessages(sessionId, 20),
          ]);

          parentSpan.setAttribute('ai.prompt.phase', phase);
          parentSpan.setAttribute('ai.prompt.history_size', history.length);

          // Step 2: Resolve attachment URLs if present
          let imageUrls: string[] = [];
          if (attachments && attachments.length > 0) {
            imageUrls = await this.resolveAttachmentUrls(attachments);
            parentSpan.setAttribute('ai.attachments.count', attachments.length);
            parentSpan.setAttribute('ai.attachments.resolved', imageUrls.length);
          }

          // Step 3: Save user message to database
          const hasImages = imageUrls.length > 0;
          await this.messageService.saveMessage({
            sessionId,
            userId: null,
            role: 'user',
            content: userMessage,
            type: hasImages ? 'image' : 'text',
            ...(hasImages ? { imageUrl: imageUrls.join(',') } : {}),
          });

          // Step 4: Build phase-aware system prompt and input messages
          const systemPrompt = getSystemPrompt(phase, sessionId);
          const historicalMessages = this.convertHistoryToMessages(history);

          // Build multipart HumanMessage when images are attached
          let currentMessage: HumanMessage;
          if (imageUrls.length > 0) {
            const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
              { type: 'text', text: userMessage },
              ...imageUrls.map((url) => ({
                type: 'image_url' as const,
                image_url: { url },
              })),
            ];
            currentMessage = new HumanMessage({ content });
          } else {
            currentMessage = new HumanMessage(userMessage);
          }

          const inputMessages: BaseMessage[] = [
            new SystemMessage(systemPrompt),
            ...historicalMessages,
            currentMessage,
          ];

          // Step 5: Stream response from ReAct agent with AI tracing
          let fullResponse = '';
          const emittedToolCalls = new Set<string>();
          let reactIterations = 0;

          const config = {
            configurable: { thread_id: sessionId },
            streamMode: 'messages' as const,
            recursionLimit: MAX_REACT_ITERATIONS * 2, // Each tool cycle = 2 steps (call_model + tools)
          };

          const streamTrace = startAIStreamSpan('ai.langgraph.stream', {
            ...modelAttrs,
            'ai.prompt.phase': phase,
          });

          const stream = await this.graph.stream(
            { messages: inputMessages as BaseMessage[] },
            config
          );

          let firstTokenEmitted = false;
          let tokenUsageRecorded = false;
          let streamError: Error | undefined;

          try {
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

                // Track token usage from response metadata (IA doc 1.4)
                // Only extract once - LangChain includes usage in the final chunk
                if (!tokenUsageRecorded) {
                  const tokenUsage = extractTokenUsage(
                    aiChunk.response_metadata as Record<string, unknown> | undefined,
                  );
                  if (tokenUsage) {
                    recordTokenUsage(streamTrace.span, tokenUsage, modelAttrs['ai.model'] as string);
                    tokenUsageRecorded = true;
                  }
                }

                // Detect tool call chunks (model is requesting tool execution)
                if (
                  aiChunk.tool_call_chunks &&
                  aiChunk.tool_call_chunks.length > 0
                ) {
                  reactIterations++;
                  for (const tc of aiChunk.tool_call_chunks) {
                    if (tc.name && !emittedToolCalls.has(tc.name)) {
                      emittedToolCalls.add(tc.name);
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
                  if (!firstTokenEmitted) {
                    streamTrace.onFirstToken();
                    firstTokenEmitted = true;
                  }
                  fullResponse += aiChunk.content;
                  callback.onToken(aiChunk.content);
                }
              }
            }
          } catch (err) {
            streamError = err as Error;
            throw err;
          } finally {
            // Always close the stream span to prevent memory leaks
            streamTrace.span.setAttribute('ai.react_loop.iterations', reactIterations);
            streamTrace.span.setAttribute('ai.tool.calls_count', emittedToolCalls.size);
            streamTrace.endStream(streamError);
          }

          parentSpan.setAttribute('ai.react_loop.iterations', reactIterations);
          parentSpan.setAttribute('ai.tool.calls_count', emittedToolCalls.size);

          logger.info('ReAct agent response completed', {
            sessionId,
            responseLength: fullResponse.length,
            toolCallCount: emittedToolCalls.size,
            reactIterations,
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
          // Primary defense: catch GraphRecursionError from recursionLimit
          if (error instanceof GraphRecursionError) {
            const fallback = "I apologize, but I'm having trouble processing that request. Could you try rephrasing?";
            callback.onToken(fallback);
            callback.onComplete(fallback);
            logger.warn('Agent hit recursion limit (GraphRecursionError)', undefined, {
              sessionId,
              limit: MAX_REACT_ITERATIONS * 2,
            });
            parentSpan.addEvent('agent.recursion_limit_hit', {
              'ai.react_loop.max_iterations': MAX_REACT_ITERATIONS,
            });

            // Save the fallback message
            await this.messageService.saveMessage({
              sessionId,
              userId: null,
              role: 'assistant',
              content: fallback,
              type: 'text',
            });
            return;
          }

          logger.error('Error processing message with ReAct agent', error as Error, {
            sessionId,
          });
          callback.onError(error as Error);
          throw error;
        }
      },
    );
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
   *
   * When a user message has imageUrl stored, reconstruct as multipart HumanMessage
   * so the model sees image context from previous turns.
   */
  private convertHistoryToMessages(history: ChatMessage[]): BaseMessage[] {
    return history
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system')
      .map((msg) => {
        if (msg.role === 'user' && msg.imageUrl) {
          const urls = msg.imageUrl.split(',').filter(Boolean);
          const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
            { type: 'text', text: msg.content },
            ...urls.map((url) => ({
              type: 'image_url' as const,
              image_url: { url },
            })),
          ];
          return new HumanMessage({ content });
        }
        if (msg.role === 'assistant') return new AIMessage(msg.content);
        if (msg.role === 'system') return new SystemMessage(msg.content);
        return new HumanMessage(msg.content);
      });
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
