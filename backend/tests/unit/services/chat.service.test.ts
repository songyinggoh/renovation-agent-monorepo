import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from '../../../src/services/chat.service.js';
import { MessageService } from '../../../src/services/message.service.js';

// Mock MessageService
vi.mock('../../../src/services/message.service.js', () => ({
  MessageService: vi.fn().mockImplementation(() => ({
    saveMessage: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    getRecentMessages: vi.fn().mockResolvedValue([]),
    getMessageHistory: vi.fn().mockResolvedValue([]),
  })),
}));

// Mock checkpointer service
vi.mock('../../../src/services/checkpointer.service.js', () => ({
  getCheckpointer: vi.fn().mockReturnValue({}),
}));

// Mock Gemini config - include bindTools for ReAct agent creation
vi.mock('../../../src/config/gemini.js', () => ({
  createStreamingModel: vi.fn().mockReturnValue({
    stream: vi.fn(),
    invoke: vi.fn(),
    bindTools: vi.fn().mockReturnValue({
      invoke: vi.fn(),
    }),
  }),
}));

// Mock renovation tools
vi.mock('../../../src/tools/index.js', () => ({
  renovationTools: [],
}));

// Mock prompts
vi.mock('../../../src/config/prompts.js', () => ({
  getSystemPrompt: vi.fn().mockReturnValue('You are a helpful renovation assistant.'),
}));

// Mock database
vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ phase: 'INTAKE' }]),
        }),
      }),
    }),
  },
}));

vi.mock('../../../src/db/schema/sessions.schema.js', () => ({
  renovationSessions: {
    id: 'id',
    phase: 'phase',
  },
}));

vi.mock('../../../src/db/schema/messages.schema.js', () => ({}));

// Mock drizzle-orm eq operator
vi.mock('drizzle-orm', () => ({
  eq: vi.fn().mockReturnValue({}),
}));

// Hoist the mock graph so it's available in vi.mock factories
const { mockCompiledGraph } = vi.hoisted(() => ({
  mockCompiledGraph: {
    stream: vi.fn(),
    invoke: vi.fn(),
  },
}));

// Mock LangGraph - provide a fake compiled graph
vi.mock('@langchain/langgraph', () => {
  const mockWorkflow = {
    addNode: vi.fn().mockReturnThis(),
    addEdge: vi.fn().mockReturnThis(),
    addConditionalEdges: vi.fn().mockReturnThis(),
    compile: vi.fn().mockReturnValue(mockCompiledGraph),
  };
  return {
    StateGraph: vi.fn().mockReturnValue(mockWorkflow),
    START: 'START',
    END: 'END',
    MessagesAnnotation: { State: {} },
  };
});

vi.mock('@langchain/langgraph/prebuilt', () => ({
  ToolNode: vi.fn().mockReturnValue({}),
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('ChatService', () => {
  let chatService: ChatService;
  let mockMessageService: MessageService;

  beforeEach(() => {
    vi.clearAllMocks();
    chatService = new ChatService();
    mockMessageService = (chatService as unknown as { messageService: MessageService }).messageService;
  });

  describe('processMessage', () => {
    it('should process message and stream response', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Hello, AI!';
      const mockResponse = 'Hello! How can I help you?';

      // Mock the graph's stream method to yield [message, metadata] tuples
      // Metadata must include langgraph_node: 'call_model' to reach the text streaming branch
      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        for (const word of mockResponse.split(' ')) {
          yield [
            { content: word + ' ', tool_call_chunks: [] },
            { langgraph_node: 'call_model' },
          ];
        }
      });

      const callback = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      await chatService.processMessage(sessionId, userMessage, callback);

      // Verify user message was saved
      expect(mockMessageService.saveMessage).toHaveBeenCalledWith({
        sessionId,
        userId: null,
        role: 'user',
        content: userMessage,
        type: 'text',
      });

      // Verify tokens were streamed
      expect(callback.onToken).toHaveBeenCalled();
      expect(callback.onComplete).toHaveBeenCalled();
      expect(callback.onError).not.toHaveBeenCalled();

      // Verify assistant message was saved
      expect(mockMessageService.saveMessage).toHaveBeenCalledWith({
        sessionId,
        userId: null,
        role: 'assistant',
        content: expect.any(String),
        type: 'text',
      });
    });

    it('should handle errors during processing', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Hello, AI!';
      const mockError = new Error('API Error');

      // Mock error in graph streaming
      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockRejectedValue(mockError);

      const callback = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      await expect(
        chatService.processMessage(sessionId, userMessage, callback)
      ).rejects.toThrow('API Error');

      expect(callback.onError).toHaveBeenCalledWith(mockError);
      expect(callback.onComplete).not.toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('should delegate to MessageService.getMessageHistory with default limit', async () => {
      const sessionId = 'test-session';
      const mockHistory = [
        { id: '1', content: 'Message 1' },
        { id: '2', content: 'Message 2' },
      ];

      vi.spyOn(mockMessageService, 'getMessageHistory').mockResolvedValue(mockHistory as Parameters<typeof mockMessageService.getMessageHistory>[1] extends Promise<infer U> ? U : never);

      const result = await chatService.getHistory(sessionId);

      expect(mockMessageService.getMessageHistory).toHaveBeenCalledWith(sessionId, 50);
      expect(result).toEqual(mockHistory);
    });

    it('should delegate to MessageService.getMessageHistory with custom limit', async () => {
      const sessionId = 'test-session';
      const mockHistory = [{ id: '1', content: 'Message 1' }];

      vi.spyOn(mockMessageService, 'getMessageHistory').mockResolvedValue(mockHistory as Parameters<typeof mockMessageService.getMessageHistory>[1] extends Promise<infer U> ? U : never);

      const result = await chatService.getHistory(sessionId, 100);

      expect(mockMessageService.getMessageHistory).toHaveBeenCalledWith(sessionId, 100);
      expect(result).toEqual(mockHistory);
    });
  });

  describe('tool execution flow', () => {
    it('should handle tool calls and stream tool results', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Get room products';

      // Mock graph stream with tool execution flow
      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        // Step 1: AI requests tool call
        yield [
          {
            content: '',
            tool_call_chunks: [{ name: 'get_room_products', args: { roomId: '123' } }],
          },
          { langgraph_node: 'call_model' },
        ];

        // Step 2: Tool execution result
        yield [
          {
            name: 'get_room_products',
            content: JSON.stringify({ products: [{ id: 1, name: 'Product A' }] }),
            tool_call_id: 'call_123',
          },
          { langgraph_node: 'tools' },
        ];

        // Step 3: AI final response
        yield [
          { content: 'Found 1 product for you!' },
          { langgraph_node: 'call_model' },
        ];
      });

      const callback = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
        onToolCall: vi.fn(),
        onToolResult: vi.fn(),
      };

      await chatService.processMessage(sessionId, userMessage, callback);

      // Verify tool call was logged
      expect(callback.onToolCall).toHaveBeenCalledWith('get_room_products', '');

      // Verify tool result was logged
      expect(callback.onToolResult).toHaveBeenCalledWith(
        'get_room_products',
        expect.stringContaining('Product A')
      );

      // Verify tool messages were saved to database
      expect(mockMessageService.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool_call',
          toolName: 'get_room_products',
        })
      );

      expect(mockMessageService.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'tool_result',
          toolName: 'get_room_products',
          toolOutput: { products: [{ id: 1, name: 'Product A' }] },
        })
      );

      // Verify final text response
      expect(callback.onComplete).toHaveBeenCalledWith('Found 1 product for you!');
    });

    it('should handle multiple tool calls without duplication', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Search products';

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        // Same tool name appears in multiple chunks (streaming)
        yield [
          {
            content: '',
            tool_call_chunks: [{ name: 'search_products', args: {} }],
          },
          { langgraph_node: 'call_model' },
        ];
        yield [
          {
            content: '',
            tool_call_chunks: [{ name: 'search_products', args: {} }],
          },
          { langgraph_node: 'call_model' },
        ];
      });

      const callback = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
        onToolCall: vi.fn(),
      };

      await chatService.processMessage(sessionId, userMessage, callback);

      // Should only emit tool call once
      expect(callback.onToolCall).toHaveBeenCalledTimes(1);
    });

    it('should handle invalid JSON in tool results gracefully', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Test';

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [
          {
            name: 'test_tool',
            content: 'invalid json {[',
            tool_call_id: 'call_123',
          },
          { langgraph_node: 'tools' },
        ];
      });

      const callback = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
        onToolResult: vi.fn(),
      };

      await chatService.processMessage(sessionId, userMessage, callback);

      // Should save with null toolOutput
      expect(mockMessageService.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          toolOutput: null,
        })
      );

      // Should still call onToolResult callback
      expect(callback.onToolResult).toHaveBeenCalledWith('test_tool', 'invalid json {[');
    });
  });

  describe('message history and context', () => {
    it('should pass user message and system prompt to graph (checkpointer handles history)', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Continue our conversation';

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Continuing...' }, { langgraph_node: 'call_model' }];
      });

      await chatService.processMessage(sessionId, userMessage, {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      // Verify graph was called with messages (system prompt + user message)
      expect(mockGraph.stream).toHaveBeenCalled();
      const callArgs = mockGraph.stream.mock.calls[0];
      const inputMessages = callArgs[0].messages;
      // Should have SystemMessage + HumanMessage
      expect(inputMessages).toHaveLength(2);
      // Config should include thread_id for checkpointer
      expect(callArgs[1].configurable.thread_id).toBe(sessionId);
    });

    it('should save user message before streaming from graph', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Test';

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response' }, { langgraph_node: 'call_model' }];
      });

      await chatService.processMessage(sessionId, userMessage, {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      // User message should be saved to database
      expect(mockMessageService.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId,
          role: 'user',
          content: userMessage,
          type: 'text',
        })
      );
      // Graph should be called after saving
      expect(mockGraph.stream).toHaveBeenCalled();
    });
  });

  describe('phase handling', () => {
    it('should fetch session phase and use in system prompt', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Test';

      // Mock database to return specific phase
      const mockDb = (await import('../../../src/db/index.js')).db;
      vi.mocked(mockDb.select().from({}).where({}).limit).mockResolvedValue([{ phase: 'RENDER' }]);

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response' }, { langgraph_node: 'call_model' }];
      });

      const { getSystemPrompt } = await import('../../../src/config/prompts.js');

      await chatService.processMessage(sessionId, userMessage, {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      // Verify system prompt was called with RENDER phase
      expect(getSystemPrompt).toHaveBeenCalledWith('RENDER', sessionId);
    });

    it('should default to INTAKE phase if session phase lookup fails', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Test';

      // Mock database to return empty (no session found)
      const mockDb = (await import('../../../src/db/index.js')).db;
      vi.mocked(mockDb.select().from({}).where({}).limit).mockResolvedValue([]);

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response' }, { langgraph_node: 'call_model' }];
      });

      const { getSystemPrompt } = await import('../../../src/config/prompts.js');

      await chatService.processMessage(sessionId, userMessage, {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      // Should default to INTAKE
      expect(getSystemPrompt).toHaveBeenCalledWith('INTAKE', sessionId);
    });

    it('should handle database errors when fetching phase', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Test';

      // Mock database to throw error
      const mockDb = (await import('../../../src/db/index.js')).db;
      vi.mocked(mockDb.select().from({}).where({}).limit).mockRejectedValue(new Error('DB Error'));

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response' }, { langgraph_node: 'call_model' }];
      });

      const { getSystemPrompt } = await import('../../../src/config/prompts.js');

      await chatService.processMessage(sessionId, userMessage, {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      // Should still proceed with default INTAKE phase
      expect(getSystemPrompt).toHaveBeenCalledWith('INTAKE', sessionId);
    });
  });
});
