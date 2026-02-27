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

// Mock Gemini config
vi.mock('../../../src/config/gemini.js', () => ({
  createStreamingModel: vi.fn().mockReturnValue({
    stream: vi.fn(),
    invoke: vi.fn(),
    bindTools: vi.fn().mockReturnValue({
      invoke: vi.fn(),
    }),
    traceAttributes: { 'ai.model': 'gemini-2.5-flash' },
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

// Mock redis
vi.mock('../../../src/config/redis.js', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), status: 'ready' },
}));

// Mock socket emitter utility
const { mockGetSocketServer } = vi.hoisted(() => ({
  mockGetSocketServer: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../src/utils/socket-emitter.js', () => ({
  getSocketServer: mockGetSocketServer,
}));

// Hoist the mock graph so it's available in vi.mock factories
const { mockCompiledGraph } = vi.hoisted(() => ({
  mockCompiledGraph: {
    stream: vi.fn(),
    invoke: vi.fn(),
    getGraph: vi.fn(),
  },
}));

// Mock the agents module to return our mock compiled graph
vi.mock('../../../src/agents/index.js', () => ({
  createSupervisorGraph: vi.fn().mockReturnValue(mockCompiledGraph),
  getPhaseCapability: vi.fn().mockImplementation((phase: string) => {
    const caps: Record<string, { maxTurns: number }> = {
      INTAKE: { maxTurns: 20 },
      CHECKLIST: { maxTurns: 8 },
      PLAN: { maxTurns: 8 },
      RENDER: { maxTurns: 3 },
      PAYMENT: { maxTurns: 2 },
      COMPLETE: { maxTurns: 2 },
      ITERATE: { maxTurns: 20 },
    };
    return caps[phase] ?? { maxTurns: 10 };
  }),
  DEFAULT_SESSION_BUDGET: { hardCapUsd: 5.0, softCapUsd: 3.0, perPhaseCapUsd: 2.0 },
  AgentEventEmitter: vi.fn().mockImplementation(() => ({
    emit: vi.fn(),
  })),
}));

// Mock LangGraph (still needed for GraphRecursionError)
vi.mock('@langchain/langgraph', async () => {
  class GraphRecursionError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'GraphRecursionError';
    }
  }
  return {
    GraphRecursionError,
    StateGraph: vi.fn(),
    START: 'START',
    END: 'END',
  };
});

// Mock checkpointer (transitively needed)
vi.mock('../../../src/services/checkpointer.service.js', () => ({
  getCheckpointer: vi.fn().mockReturnValue({}),
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
      // Worker node names end with _worker (e.g., intake_worker)
      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        for (const word of mockResponse.split(' ')) {
          yield [
            { content: word + ' ', tool_call_chunks: [], _getType: () => 'ai' },
            { langgraph_node: 'intake_worker' },
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

      // Mock graph stream with tool execution flow using worker node names
      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        // Step 1: AI requests tool call (from worker node)
        yield [
          {
            content: '',
            tool_call_chunks: [{ name: 'get_room_products', args: { roomId: '123' } }],
            _getType: () => 'ai',
          },
          { langgraph_node: 'intake_worker' },
        ];

        // Step 2: Tool execution result (ToolMessage type)
        yield [
          {
            name: 'get_room_products',
            content: JSON.stringify({ products: [{ id: 1, name: 'Product A' }] }),
            tool_call_id: 'call_123',
            _getType: () => 'tool',
          },
          { langgraph_node: 'intake_worker' },
        ];

        // Step 3: AI final response
        yield [
          { content: 'Found 1 product for you!', _getType: () => 'ai' },
          { langgraph_node: 'intake_worker' },
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
            _getType: () => 'ai',
          },
          { langgraph_node: 'intake_worker' },
        ];
        yield [
          {
            content: '',
            tool_call_chunks: [{ name: 'search_products', args: {} }],
            _getType: () => 'ai',
          },
          { langgraph_node: 'intake_worker' },
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
            _getType: () => 'tool',
          },
          { langgraph_node: 'intake_worker' },
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
        yield [{ content: 'Continuing...', _getType: () => 'ai' }, { langgraph_node: 'intake_worker' }];
      });

      await chatService.processMessage(sessionId, userMessage, {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      // Verify history was loaded
      expect(mockMessageService.getRecentMessages).toHaveBeenCalledWith(sessionId, 20);

      // Verify graph was called with sessionId and currentPhase
      expect(mockGraph.stream).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId,
          currentPhase: 'INTAKE',
          messages: expect.any(Array),
        }),
        expect.any(Object),
      );
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
        yield [{ content: 'Response', _getType: () => 'ai' }, { langgraph_node: 'intake_worker' }];
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
        yield [{ content: 'I see a kitchen!', _getType: () => 'ai' }, { langgraph_node: 'intake_worker' }];
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

      // Verify graph received the message
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
        yield [{ content: 'Response', _getType: () => 'ai' }, { langgraph_node: 'intake_worker' }];
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
        yield [{ content: 'Response', _getType: () => 'ai' }, { langgraph_node: 'intake_worker' }];
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
    it('should fetch session phase and pass to supervisor graph', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Test';

      // Mock database to return specific phase
      const mockDb = (await import('../../../src/db/index.js')).db;
      vi.mocked(mockDb.select().from({}).where({}).limit).mockResolvedValue([{ phase: 'RENDER' }]);

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response', _getType: () => 'ai' }, { langgraph_node: 'render_worker' }];
      });

      await chatService.processMessage(sessionId, userMessage, {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      // Verify graph was called with RENDER phase
      expect(mockGraph.stream).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPhase: 'RENDER',
        }),
        expect.any(Object),
      );
    });

    it('should default to INTAKE phase if session phase lookup fails', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Test';

      // Mock database to return empty (no session found)
      const mockDb = (await import('../../../src/db/index.js')).db;
      vi.mocked(mockDb.select().from({}).where({}).limit).mockResolvedValue([]);

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response', _getType: () => 'ai' }, { langgraph_node: 'intake_worker' }];
      });

      await chatService.processMessage(sessionId, userMessage, {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      // Should default to INTAKE
      expect(mockGraph.stream).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPhase: 'INTAKE',
        }),
        expect.any(Object),
      );
    });

    it('should handle database errors when fetching phase', async () => {
      const sessionId = 'test-session';
      const userMessage = 'Test';

      // Mock database to throw error
      const mockDb = (await import('../../../src/db/index.js')).db;
      vi.mocked(mockDb.select().from({}).where({}).limit).mockRejectedValue(new Error('DB Error'));

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response', _getType: () => 'ai' }, { langgraph_node: 'intake_worker' }];
      });

      await chatService.processMessage(sessionId, userMessage, {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      // Should still proceed with default INTAKE phase
      expect(mockGraph.stream).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPhase: 'INTAKE',
        }),
        expect.any(Object),
      );
    });

    it('should use phase-specific recursionLimit for INTAKE (maxTurns=20 → limit=40)', async () => {
      const sessionId = 'test-session';

      const mockDb = (await import('../../../src/db/index.js')).db;
      vi.mocked(mockDb.select().from({}).where({}).limit).mockResolvedValue([{ phase: 'INTAKE' }]);

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response', _getType: () => 'ai' }, { langgraph_node: 'intake_worker' }];
      });

      await chatService.processMessage(sessionId, 'Test', {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      expect(mockGraph.stream).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ recursionLimit: 40 }),
      );
    });

    it('should use phase-specific recursionLimit for RENDER (maxTurns=3 → limit=6)', async () => {
      const sessionId = 'test-session';

      const mockDb = (await import('../../../src/db/index.js')).db;
      vi.mocked(mockDb.select().from({}).where({}).limit).mockResolvedValue([{ phase: 'RENDER' }]);

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response', _getType: () => 'ai' }, { langgraph_node: 'render_worker' }];
      });

      await chatService.processMessage(sessionId, 'Test', {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      expect(mockGraph.stream).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ recursionLimit: 6 }),
      );
    });

    it('should use phase-specific recursionLimit for PAYMENT (maxTurns=2 → limit=4)', async () => {
      const sessionId = 'test-session';

      const mockDb = (await import('../../../src/db/index.js')).db;
      vi.mocked(mockDb.select().from({}).where({}).limit).mockResolvedValue([{ phase: 'PAYMENT' }]);

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response', _getType: () => 'ai' }, { langgraph_node: 'payment_worker' }];
      });

      await chatService.processMessage(sessionId, 'Test', {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      expect(mockGraph.stream).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ recursionLimit: 4 }),
      );
    });
  });

  describe('emitter wiring', () => {
    it('should pass emitter in config when Socket.io is available', async () => {
      const mockIo = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
      mockGetSocketServer.mockReturnValue(mockIo);

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response', _getType: () => 'ai' }, { langgraph_node: 'intake_worker' }];
      });

      await chatService.processMessage('test-session', 'Test', {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      expect(mockGraph.stream).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          configurable: expect.objectContaining({
            emitter: expect.objectContaining({ emit: expect.any(Function) }),
          }),
        }),
      );
    });

    it('should pass null emitter when Socket.io is unavailable', async () => {
      mockGetSocketServer.mockReturnValue(null);

      const mockGraph = (chatService as unknown as { graph: { stream: ReturnType<typeof vi.fn> } }).graph;
      mockGraph.stream.mockImplementation(async function* () {
        yield [{ content: 'Response', _getType: () => 'ai' }, { langgraph_node: 'intake_worker' }];
      });

      await chatService.processMessage('test-session', 'Test', {
        onToken: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
      });

      expect(mockGraph.stream).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          configurable: expect.objectContaining({
            emitter: null,
          }),
        }),
      );
    });
  });
});
