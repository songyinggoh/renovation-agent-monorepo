import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { getMessages } from '../../../src/controllers/message.controller.js';

// Mock the database pool
vi.mock('../../../src/db/index.js', () => ({
  pool: {
    query: vi.fn(),
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

// Import mocked pool after vi.mock
import { pool } from '../../../src/db/index.js';

describe('MessageController', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRes = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };
  });

  describe('getMessages', () => {
    it('should return messages for a valid session', async () => {
      const mockMessages = [
        { id: '1', session_id: 'session-1', role: 'user', content: 'Hello', created_at: '2026-01-01T00:00:00Z' },
        { id: '2', session_id: 'session-1', role: 'assistant', content: 'Hi!', created_at: '2026-01-01T00:01:00Z' },
      ];

      mockReq = {
        params: { sessionId: 'session-1' },
        query: {},
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: mockMessages });

      await getMessages(mockReq as Request, mockRes as Response);

      expect(pool.query).toHaveBeenCalledWith(
        'SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC LIMIT $2',
        ['session-1', 50]
      );
      expect(mockRes.json).toHaveBeenCalledWith({ messages: mockMessages });
    });

    it('should return empty array for session with no messages', async () => {
      mockReq = {
        params: { sessionId: 'empty-session' },
        query: {},
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

      await getMessages(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({ messages: [] });
    });

    it('should respect the limit query parameter', async () => {
      mockReq = {
        params: { sessionId: 'session-1' },
        query: { limit: '10' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

      await getMessages(mockReq as Request, mockRes as Response);

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['session-1', 10]
      );
    });

    it('should cap limit at 200', async () => {
      mockReq = {
        params: { sessionId: 'session-1' },
        query: { limit: '999' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      (pool.query as ReturnType<typeof vi.fn>).mockResolvedValue({ rows: [] });

      await getMessages(mockReq as Request, mockRes as Response);

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['session-1', 200]
      );
    });

    it('should return 500 on database error', async () => {
      mockReq = {
        params: { sessionId: 'session-1' },
        query: {},
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      (pool.query as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB connection lost'));

      await getMessages(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal Server Error',
        message: 'Failed to retrieve messages',
      });
    });
  });
});
