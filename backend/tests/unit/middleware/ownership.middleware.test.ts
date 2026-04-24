import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import {
  verifySessionOwnership,
  verifyRoomOwnership,
} from '../../../src/middleware/ownership.middleware.js';
import { db } from '../../../src/db/index.js';

// Chain-mockable query builder
function createMockChain(result: Record<string, unknown>[] = []) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock('../../../src/db/schema/sessions.schema.js', () => ({
  renovationSessions: {
    id: 'sessions.id',
    userId: 'sessions.userId',
  },
}));

vi.mock('../../../src/db/schema/rooms.schema.js', () => ({
  renovationRooms: {
    id: 'rooms.id',
    sessionId: 'rooms.sessionId',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

function mockReqResNext(params: Record<string, string> = {}, userId?: string) {
  const req = {
    params,
    user: userId ? { id: userId } : undefined,
  } as unknown as Request;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next };
}

describe('ownership.middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifySessionOwnership', () => {
    it('should call next() when no sessionId param exists', async () => {
      const { req, res, next } = mockReqResNext({});

      await verifySessionOwnership(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 404 when session does not exist', async () => {
      const chain = createMockChain([]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext({ sessionId: 'abc-123' });

      await verifySessionOwnership(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Session not found' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow access to anonymous session (no userId on session)', async () => {
      const chain = createMockChain([{ id: 'sess-1', userId: null }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext(
        { sessionId: 'sess-1' },
        'user-999'
      );

      await verifySessionOwnership(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow access when session owner matches requester', async () => {
      const chain = createMockChain([{ id: 'sess-1', userId: 'user-123' }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext(
        { sessionId: 'sess-1' },
        'user-123'
      );

      await verifySessionOwnership(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 404 when session owner does not match requester', async () => {
      const chain = createMockChain([{ id: 'sess-1', userId: 'owner-A' }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext(
        { sessionId: 'sess-1' },
        'attacker-B'
      );

      await verifySessionOwnership(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Session not found' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow access when session has owner but requester is unauthenticated', async () => {
      // req.user is undefined — the condition `session.userId && req.user?.id` is false
      const chain = createMockChain([{ id: 'sess-1', userId: 'owner-A' }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext({ sessionId: 'sess-1' });

      await verifySessionOwnership(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should return 500 on database error', async () => {
      const chain = createMockChain();
      chain.limit.mockRejectedValue(new Error('DB connection lost'));
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext({ sessionId: 'sess-1' });

      await verifySessionOwnership(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('verifyRoomOwnership', () => {
    it('should call next() when no roomId param exists', async () => {
      const { req, res, next } = mockReqResNext({});

      await verifyRoomOwnership(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 404 when room does not exist', async () => {
      const chain = createMockChain([]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext({ roomId: 'room-404' });

      await verifyRoomOwnership(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Room not found' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow access to room with anonymous session', async () => {
      const chain = createMockChain([{ id: 'room-1', userId: null }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext(
        { roomId: 'room-1' },
        'user-999'
      );

      await verifyRoomOwnership(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow access when room session owner matches requester', async () => {
      const chain = createMockChain([{ id: 'room-1', userId: 'user-123' }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext(
        { roomId: 'room-1' },
        'user-123'
      );

      await verifyRoomOwnership(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 404 when room session owner does not match requester', async () => {
      const chain = createMockChain([{ id: 'room-1', userId: 'owner-A' }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext(
        { roomId: 'room-1' },
        'attacker-B'
      );

      await verifyRoomOwnership(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Room not found' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should allow access when room has owner but requester is unauthenticated', async () => {
      const chain = createMockChain([{ id: 'room-1', userId: 'owner-A' }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext({ roomId: 'room-1' });

      await verifyRoomOwnership(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should use innerJoin to look up room via parent session', async () => {
      const chain = createMockChain([{ id: 'room-1', userId: null }]);
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext({ roomId: 'room-1' });

      await verifyRoomOwnership(req, res, next);

      expect(chain.innerJoin).toHaveBeenCalledTimes(1);
    });

    it('should return 500 on database error', async () => {
      const chain = createMockChain();
      chain.limit.mockRejectedValue(new Error('DB timeout'));
      vi.mocked(db.select).mockReturnValue(chain as never);

      const { req, res, next } = mockReqResNext({ roomId: 'room-1' });

      await verifyRoomOwnership(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
