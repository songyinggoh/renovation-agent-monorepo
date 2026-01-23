import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { createServer, Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from '../../src/app.js';
import { verifyToken } from '../../src/middleware/auth.middleware.js';
import { AuthenticatedSocket } from '../../src/types/socket.js';

// Mock dependencies
vi.mock('../../src/middleware/auth.middleware.js', () => ({
  verifyToken: vi.fn(),
  authMiddleware: vi.fn((req, res, next) => next()),
}));

vi.mock('../../src/services/chat.service.js', () => ({
  ChatService: vi.fn().mockImplementation(() => ({
    processMessage: vi.fn().mockImplementation(async (sessionId, content, callbacks) => {
      // Simulate streaming response
      callbacks.onToken('Hello');
      callbacks.onToken(' ');
      callbacks.onToken('World');
      callbacks.onComplete('Hello World');
    }),
  })),
}));

vi.mock('../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('Socket.io Infrastructure - Phase 1.1', () => {
  let httpServer: HTTPServer;
  let io: SocketIOServer;
  let serverPort: number;
  let clientSocket: ClientSocket;

  beforeAll(() => {
    // Create test server
    const app = createApp();
    httpServer = createServer(app);

    io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    // Setup Socket.io middleware (mirrors production server.ts)
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token as string | undefined;
        if (!token) {
          return next(new Error('Authentication error: Token required'));
        }

        const user = await verifyToken(token);
        (socket as AuthenticatedSocket).user = user;
        next();
      } catch {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    // Setup event handlers (mirrors production server.ts)
    io.on('connection', (socket) => {
      socket.on('chat:join_session', (sessionId: string) => {
        if (!sessionId) return;
        const roomName = `session:${sessionId}`;
        socket.join(roomName);
        socket.emit('chat:session_joined', { sessionId });
      });

      socket.on('chat:user_message', async (data: { sessionId: string; content: string }) => {
        const { sessionId, content } = data;
        if (!sessionId || !content) return;

        const roomName = `session:${sessionId}`;
        if (!socket.rooms.has(roomName)) {
          socket.emit('chat:error', {
            sessionId,
            error: 'You must join a session before sending messages',
          });
          return;
        }

        socket.emit('chat:message_ack', {
          sessionId,
          status: 'received',
          timestamp: new Date().toISOString(),
        });

        // Simulate assistant response
        socket.emit('chat:assistant_token', {
          sessionId,
          token: 'Test response',
          done: false,
        });

        socket.emit('chat:assistant_token', {
          sessionId,
          token: '',
          done: true,
        });
      });
    });

    // Start server on random port
    return new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address();
        if (address && typeof address !== 'string') {
          serverPort = address.port;
        }
        resolve();
      });
    });
  });

  afterAll(() => {
    return new Promise<void>((resolve) => {
      io.close(() => {
        httpServer.close(() => {
          resolve();
        });
      });
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (clientSocket?.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Authentication', () => {
    it('should reject connection without token', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: {},
        transports: ['websocket'],
      });

      clientSocket.on('connect_error', (err) => {
        expect(err.message).toContain('Authentication error');
        done();
      });

      clientSocket.on('connect', () => {
        done(new Error('Should not connect without token'));
      });
    });

    it('should reject connection with invalid token', (done) => {
      vi.mocked(verifyToken).mockRejectedValue(new Error('Invalid token'));

      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'invalid-token' },
        transports: ['websocket'],
      });

      clientSocket.on('connect_error', (err) => {
        expect(err.message).toContain('Authentication error');
        expect(verifyToken).toHaveBeenCalledWith('invalid-token');
        done();
      });

      clientSocket.on('connect', () => {
        done(new Error('Should not connect with invalid token'));
      });
    });

    it('should accept connection with valid token', (done) => {
      vi.mocked(verifyToken).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      } as Parameters<typeof verifyToken> extends [string] ? ReturnType<typeof verifyToken> extends Promise<infer U> ? U : never : never);

      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'valid-token' },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        expect(verifyToken).toHaveBeenCalledWith('valid-token');
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (err) => {
        done(new Error(`Should connect with valid token: ${err.message}`));
      });
    });
  });

  describe('Room Management', () => {
    beforeEach(() => {
      vi.mocked(verifyToken).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      } as Parameters<typeof verifyToken> extends [string] ? ReturnType<typeof verifyToken> extends Promise<infer U> ? U : never : never);
    });

    it('should join session room and emit confirmation', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'valid-token' },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('chat:join_session', 'session-123');
      });

      clientSocket.on('chat:session_joined', (data) => {
        expect(data.sessionId).toBe('session-123');
        done();
      });
    });

    it('should allow multiple clients to join same session', (done) => {
      const client1 = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'valid-token' },
        transports: ['websocket'],
      });

      const client2 = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'valid-token' },
        transports: ['websocket'],
      });

      let joinedCount = 0;

      const checkBothJoined = () => {
        joinedCount++;
        if (joinedCount === 2) {
          client1.disconnect();
          client2.disconnect();
          done();
        }
      };

      client1.on('connect', () => {
        client1.emit('chat:join_session', 'session-456');
      });

      client2.on('connect', () => {
        client2.emit('chat:join_session', 'session-456');
      });

      client1.on('chat:session_joined', (data) => {
        expect(data.sessionId).toBe('session-456');
        checkBothJoined();
      });

      client2.on('chat:session_joined', (data) => {
        expect(data.sessionId).toBe('session-456');
        checkBothJoined();
      });
    });
  });

  describe('Message Flow', () => {
    beforeEach(() => {
      vi.mocked(verifyToken).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      } as Parameters<typeof verifyToken> extends [string] ? ReturnType<typeof verifyToken> extends Promise<infer U> ? U : never : never);
    });

    it('should acknowledge message receipt', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'valid-token' },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('chat:join_session', 'session-789');
      });

      clientSocket.on('chat:session_joined', () => {
        clientSocket.emit('chat:user_message', {
          sessionId: 'session-789',
          content: 'Hello, assistant!',
        });
      });

      clientSocket.on('chat:message_ack', (data) => {
        expect(data.sessionId).toBe('session-789');
        expect(data.status).toBe('received');
        expect(data.timestamp).toBeDefined();
        done();
      });
    });

    it('should reject messages from users not in room', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'valid-token' },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        // Don't join room, directly send message
        clientSocket.emit('chat:user_message', {
          sessionId: 'session-999',
          content: 'Unauthorized message',
        });
      });

      clientSocket.on('chat:error', (data) => {
        expect(data.sessionId).toBe('session-999');
        expect(data.error).toContain('must join a session');
        done();
      });

      clientSocket.on('chat:message_ack', () => {
        done(new Error('Should not acknowledge message from non-member'));
      });
    });

    it('should emit assistant tokens for streaming response', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'valid-token' },
        transports: ['websocket'],
      });

      const tokens: string[] = [];
      let doneReceived = false;

      clientSocket.on('connect', () => {
        clientSocket.emit('chat:join_session', 'session-stream');
      });

      clientSocket.on('chat:session_joined', () => {
        clientSocket.emit('chat:user_message', {
          sessionId: 'session-stream',
          content: 'Test streaming',
        });
      });

      clientSocket.on('chat:assistant_token', (data) => {
        if (!data.done) {
          tokens.push(data.token);
        } else {
          doneReceived = true;
          expect(tokens.length).toBeGreaterThan(0);
          expect(doneReceived).toBe(true);
          done();
        }
      });
    });
  });

  describe('Disconnection', () => {
    beforeEach(() => {
      vi.mocked(verifyToken).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      } as Parameters<typeof verifyToken> extends [string] ? ReturnType<typeof verifyToken> extends Promise<infer U> ? U : never : never);
    });

    it('should handle client disconnect', (done) => {
      clientSocket = ioClient(`http://localhost:${serverPort}`, {
        auth: { token: 'valid-token' },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        clientSocket.disconnect();
      });

      clientSocket.on('disconnect', (reason) => {
        expect(reason).toBe('io client disconnect');
        expect(clientSocket.connected).toBe(false);
        done();
      });
    });
  });
});
