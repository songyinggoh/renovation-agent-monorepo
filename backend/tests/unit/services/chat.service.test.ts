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
    it('should delegate to MessageService.getMessageHistory', async () => {
      const sessionId = 'test-session';
      const mockHistory = [
        { id: '1', content: 'Message 1' },
        { id: '2', content: 'Message 2' },
      ];

      vi.spyOn(mockMessageService, 'getMessageHistory').mockResolvedValue(mockHistory as Parameters<typeof mockMessageService.getMessageHistory>[1] extends Promise<infer U> ? U : never);

      const result = await chatService.getHistory(sessionId, 50);

      expect(mockMessageService.getMessageHistory).toHaveBeenCalledWith(sessionId, 50);
      expect(result).toEqual(mockHistory);
    });
  });
});
