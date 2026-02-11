import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { getMessages } from '../../../src/controllers/message.controller.js';

// Mock the database module (Drizzle ORM)
vi.mock('../../../src/db/index.js', () => ({
  db: {
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

import { db } from '../../../src/db/index.js';

// Helper to set up the Drizzle chain mock: db.select().from().where().orderBy().limit()
function mockDrizzleSelect(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
  return chain;
}

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
        { id: '1', sessionId: 'session-1', role: 'user', content: 'Hello', createdAt: new Date('2026-01-01T00:00:00Z') },
        { id: '2', sessionId: 'session-1', role: 'assistant', content: 'Hi!', createdAt: new Date('2026-01-01T00:01:00Z') },
      ];

      mockReq = {
        params: { sessionId: 'session-1' },
        query: {},
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const chain = mockDrizzleSelect(mockMessages);

      await getMessages(mockReq as Request, mockRes as Response);

      expect(db.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.where).toHaveBeenCalled();
      expect(chain.limit).toHaveBeenCalledWith(50);
      expect(mockRes.json).toHaveBeenCalledWith({ messages: mockMessages });
    });

    it('should return empty array for session with no messages', async () => {
      mockReq = {
        params: { sessionId: 'empty-session' },
        query: {},
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      mockDrizzleSelect([]);

      await getMessages(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({ messages: [] });
    });

    it('should respect the limit query parameter', async () => {
      mockReq = {
        params: { sessionId: 'session-1' },
        query: { limit: '10' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const chain = mockDrizzleSelect([]);

      await getMessages(mockReq as Request, mockRes as Response);

      expect(chain.limit).toHaveBeenCalledWith(10);
    });

    it('should cap limit at 200', async () => {
      mockReq = {
        params: { sessionId: 'session-1' },
        query: { limit: '999' },
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const chain = mockDrizzleSelect([]);

      await getMessages(mockReq as Request, mockRes as Response);

      expect(chain.limit).toHaveBeenCalledWith(200);
    });

    it('should forward database errors to Express error handler via next()', async () => {
      mockReq = {
        params: { sessionId: 'session-1' },
        query: {},
        user: { id: 'user-1', email: 'test@test.com' } as Request['user'],
      };

      const dbError = new Error('DB connection lost');
      const chain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockRejectedValue(dbError),
      };
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);

      const mockNext = vi.fn() as unknown as NextFunction;

      getMessages(mockReq as Request, mockRes as Response, mockNext);

      // asyncHandler's .catch(next) fires on the microtask queue
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockNext).toHaveBeenCalledWith(dbError);
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});
