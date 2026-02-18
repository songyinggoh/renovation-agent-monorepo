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

// Mock AssetService
vi.mock('../../../src/services/asset.service.js', () => ({
  AssetService: vi.fn().mockImplementation(() => ({
    getSignedUrl: vi.fn().mockResolvedValue('https://storage.example.com/signed-url'),
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

// Mock agent-guards
vi.mock('../../../src/utils/agent-guards.js', () => ({
  createSafeShouldContinue: vi.fn().mockReturnValue(
    vi.fn().mockReturnValue('END')
  ),
  MAX_REACT_ITERATIONS: 10,
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
  class GraphRecursionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'GraphRecursionError';
    }
  }
  return {
    StateGraph: vi.fn().mockReturnValue(mockWorkflow),
    START: 'START',
    END: 'END',
    MessagesAnnotation: { State: {} },
    GraphRecursionError,
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

    it('should handle GraphRecursionError gracefully with fallback message', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Trigger recursion loop';

      // Import the mocked GraphRecursionError class
      const { GraphRecursionError } = await import('@langchain/langgraph');
      const recursionError = new GraphRecursionError('Recursion limit reached');

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockRejectedValue(recursionError);

      const callback = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      // Should NOT throw — it catches GraphRecursionError and sends fallback
      await chatService.processMessage(sessionId, userMessage, callback);

      // Verify fallback message was sent
      expect(callback.onToken).toHaveBeenCalledWith(
        expect.stringContaining('trouble processing')
      );
      expect(callback.onComplete).toHaveBeenCalledWith(
        expect.stringContaining('trouble processing')
      );
      // onError should NOT have been called for recursion errors
      expect(callback.onError).not.toHaveBeenCalled();
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
    it('should load and include message history in context', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Continue our conversation';

      // Mock previous conversation
      const mockHistory = [
        { id: '1', sessionId, userId: null, role: 'user', content: 'Hello', type: 'text', createdAt: new Date(), toolName: null, toolOutput: null },
        { id: '2', sessionId, userId: null, role: 'assistant', content: 'Hi there', type: 'text', createdAt: new Date(), toolName: null, toolOutput: null },
      ];

      vi.spyOn(mockMessageService, 'getRecentMessages').mockResolvedValue(mockHistory);

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Continuing...' }, { langgraph_node: 'call_model' }];
      });

      await chatService.processMessage(sessionId, userMessage, {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      // Verify history was loaded
      expect(mockMessageService.getRecentMessages).toHaveBeenCalledWith(sessionId, 20);

      // Verify graph was called (with history included in messages)
      expect(mockGraph.stream).toHaveBeenCalled();
    });

    it('should filter out messages with invalid roles', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Test';

      // Include a message with invalid role
      const mockHistory = [
        { id: '1', sessionId, userId: null, role: 'user', content: 'Hello', type: 'text', createdAt: new Date(), toolName: null, toolOutput: null },
        { id: '2', sessionId, userId: null, role: 'invalid_role' as 'user', content: 'Bad', type: 'text', createdAt: new Date(), toolName: null, toolOutput: null },
        { id: '3', sessionId, userId: null, role: 'assistant', content: 'Hi', type: 'text', createdAt: new Date(), toolName: null, toolOutput: null },
      ];

      vi.spyOn(mockMessageService, 'getRecentMessages').mockResolvedValue(mockHistory);

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response' }, { langgraph_node: 'call_model' }];
      });

      await chatService.processMessage(sessionId, userMessage, {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      // Should still process successfully (invalid role filtered out)
      expect(mockGraph.stream).toHaveBeenCalled();
    });
  });

  describe('multipart message with attachments', () => {
    it('should build multipart HumanMessage when attachments are provided', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Look at this room';
      const attachments = [
        { assetId: '660e8400-e29b-41d4-a716-446655440001' },
      ];

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'I see a kitchen!' }, { langgraph_node: 'call_model' }];
      });

      const callback = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      await chatService.processMessage(sessionId, userMessage, callback, attachments);

      // Verify user message was saved with image type and imageUrl
      expect(mockMessageService.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId,
          role: 'user',
          content: userMessage,
          type: 'image',
          imageUrl: expect.stringContaining('signed-url'),
        })
      );

      // Verify graph received the message (multipart content)
      expect(mockGraph.stream).toHaveBeenCalled();
      expect(callback.onComplete).toHaveBeenCalledWith('I see a kitchen!');
    });

    it('should fall back to text when all attachment URLs fail to resolve', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Look at this room';

      // Override asset service to fail
      const assetService = (chatService as unknown as { assetService: { getSignedUrl: ReturnType<typeof vi.fn> } }).assetService;
      assetService.getSignedUrl.mockResolvedValue(null);

      const attachments = [
        { assetId: '660e8400-e29b-41d4-a716-446655440001' },
      ];

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response' }, { langgraph_node: 'call_model' }];
      });

      const callback = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      await chatService.processMessage(sessionId, userMessage, callback, attachments);

      // Should save as text type since no URLs resolved
      expect(mockMessageService.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'text',
          role: 'user',
        })
      );
    });

    it('should process message without attachments as plain text', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Just text, no images';

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response' }, { langgraph_node: 'call_model' }];
      });

      const callback = {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      };

      await chatService.processMessage(sessionId, userMessage, callback);

      expect(mockMessageService.saveMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'text',
          role: 'user',
        })
      );
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
