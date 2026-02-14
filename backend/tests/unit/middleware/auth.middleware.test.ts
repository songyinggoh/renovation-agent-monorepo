import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { authMiddleware, optionalAuthMiddleware, verifyToken } from '../../../src/middleware/auth.middleware.js';
import * as envConfig from '../../../src/config/env.js';

// Mock the Supabase module
const mockGetUser = vi.fn();
vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: {
    auth: {
      getUser: () => mockGetUser(),
    },
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

describe('Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    nextFunction = vi.fn();
    vi.clearAllMocks();
  });

  describe('verifyToken', () => {
    it('should verify valid token and return user', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      const user = await verifyToken('valid-token');

      expect(user).toEqual(mockUser);
      expect(mockGetUser).toHaveBeenCalledTimes(1);
    });

    it('should throw error if token is invalid', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Invalid token'),
      });

      await expect(verifyToken('invalid-token')).rejects.toThrow('Invalid token');
    });

    it('should throw error if user is null', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      await expect(verifyToken('token')).rejects.toThrow('Invalid or expired token');
    });
  });

  describe('authMiddleware (required auth)', () => {
    it('should return 401 if no authorization header', async () => {
      await authMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should return 401 if authorization header does not start with Bearer', async () => {
      mockRequest.headers = { authorization: 'Basic abc123' };

      await authMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should attach user to request and call next() on valid token', async () => {
      const mockUser = { id: 'user-123', email: 'test@example.com' };
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      await authMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockRequest.user).toEqual(mockUser);
      expect(nextFunction).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return 401 if token verification fails', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Invalid token'),
      });

      await authMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuthMiddleware (conditional auth)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should skip auth and call next() when Supabase is not configured', async () => {
      // Mock isAuthEnabled to return false
      vi.spyOn(envConfig, 'isAuthEnabled').mockReturnValue(false);

      // No authorization header
      await optionalAuthMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
    });

    it('should skip auth even with token present when auth is disabled', async () => {
      // Mock isAuthEnabled to return false
      vi.spyOn(envConfig, 'isAuthEnabled').mockReturnValue(false);

      mockRequest.headers = { authorization: 'Bearer some-token' };

      await optionalAuthMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(nextFunction).toHaveBeenCalledTimes(1);
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
    });

    it('should require auth when Supabase is configured', async () => {
      // Mock isAuthEnabled to return true
      vi.spyOn(envConfig, 'isAuthEnabled').mockReturnValue(true);

      // No authorization header
      await optionalAuthMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('should verify token when auth is enabled and token is provided', async () => {
      // Mock isAuthEnabled to return true
      vi.spyOn(envConfig, 'isAuthEnabled').mockReturnValue(true);

      const mockUser = { id: 'user-123', email: 'test@example.com' };
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      mockGetUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      await optionalAuthMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockRequest.user).toEqual(mockUser);
      expect(nextFunction).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return 401 when auth is enabled but token is invalid', async () => {
      // Mock isAuthEnabled to return true
      vi.spyOn(envConfig, 'isAuthEnabled').mockReturnValue(true);

      mockRequest.headers = { authorization: 'Bearer invalid-token' };
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Invalid token'),
      });

      await optionalAuthMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });
  });
});
