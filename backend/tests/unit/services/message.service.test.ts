import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { MessageService } from '../../../src/services/message.service.js';
import { db } from '../../../src/db/index.js';
import { chatMessages } from '../../../src/db/schema/messages.schema.js';

// Mock the database module
vi.mock('../../../src/db/index.js', () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

// Mock logger to suppress logs during tests
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('MessageService', () => {
  let messageService: MessageService;

  beforeEach(() => {
    messageService = new MessageService();
    vi.clearAllMocks();
  });

  describe('saveMessage', () => {
    it('should save a message and return the saved record', async () => {
      const mockMessage = {
        sessionId: 'test-session-id',
        userId: null,
        role: 'user',
        content: 'Hello, world!',
        type: 'text',
      };

      const mockSavedMessage = {
        id: 'generated-id',
        ...mockMessage,
        createdAt: new Date(),
      };

      // Mock the database insert chain
      const mockReturning = vi.fn().mockResolvedValue([mockSavedMessage]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      (db.insert as Mock).mockReturnValue({ values: mockValues });

      const result = await messageService.saveMessage(mockMessage);

      expect(db.insert).toHaveBeenCalledWith(chatMessages);
      expect(mockValues).toHaveBeenCalledWith(mockMessage);
      expect(mockReturning).toHaveBeenCalled();
      expect(result).toEqual(mockSavedMessage);
    });

    it('should throw error if no record is returned', async () => {
      const mockMessage = {
        sessionId: 'test-session-id',
        userId: null,
        role: 'user',
        content: 'Hello, world!',
        type: 'text',
      };

      // Mock empty response
      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      (db.insert as Mock).mockReturnValue({ values: mockValues });

      await expect(messageService.saveMessage(mockMessage)).rejects.toThrow(
        'Failed to save message: No record returned'
      );
    });
  });

  describe('getMessageHistory', () => {
    it('should fetch and return messages in chronological order', async () => {
      const mockMessages = [
        { id: '3', content: 'Third message', createdAt: new Date('2024-01-03') },
        { id: '2', content: 'Second message', createdAt: new Date('2024-01-02') },
        { id: '1', content: 'First message', createdAt: new Date('2024-01-01') },
      ];

      // Mock the database select chain
      const mockLimit = vi.fn().mockResolvedValue(mockMessages);
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await messageService.getMessageHistory('test-session-id', 50);

      // Should be reversed to chronological order
      expect(result).toEqual([
        { id: '1', content: 'First message', createdAt: new Date('2024-01-01') },
        { id: '2', content: 'Second message', createdAt: new Date('2024-01-02') },
        { id: '3', content: 'Third message', createdAt: new Date('2024-01-03') },
      ]);
    });
  });

  describe('getRecentMessages', () => {
    it('should fetch recent messages in chronological order', async () => {
      const mockMessages = [
        { id: '2', content: 'Second message', createdAt: new Date('2024-01-02') },
        { id: '1', content: 'First message', createdAt: new Date('2024-01-01') },
      ];

      const mockLimit = vi.fn().mockResolvedValue(mockMessages);
      const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await messageService.getRecentMessages('test-session-id', 10);

      expect(result).toEqual([
        { id: '1', content: 'First message', createdAt: new Date('2024-01-01') },
        { id: '2', content: 'Second message', createdAt: new Date('2024-01-02') },
      ]);
      expect(mockLimit).toHaveBeenCalledWith(10);
    });
  });

  describe('toLangChainMessages', () => {
    it('should convert database messages to LangChain format', () => {
      const mockMessages = [
        { id: '1', role: 'user', content: 'Hello', sessionId: 'test', userId: null, type: 'text', createdAt: new Date() },
        { id: '2', role: 'assistant', content: 'Hi there!', sessionId: 'test', userId: null, type: 'text', createdAt: new Date() },
        { id: '3', role: 'system', content: 'System message', sessionId: 'test', userId: null, type: 'text', createdAt: new Date() },
      ];

      const result = messageService.toLangChainMessages(mockMessages as Parameters<typeof messageService.toLangChainMessages>[0]);

      expect(result).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'system', content: 'System message' },
      ]);
    });
  });
});
