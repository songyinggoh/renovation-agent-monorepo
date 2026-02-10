import { Server } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { testConnection, closeConnection } from './db/index.js';
import { createChatModel } from './config/gemini.js';
import { Logger } from './utils/logger.js';
import { ShutdownManager } from './utils/shutdown-manager.js';
import { verifyToken } from './middleware/auth.middleware.js';
import { AuthenticatedSocket } from './types/socket.js';
import { ChatService, type StreamCallback } from './services/chat.service.js';
import { initializeCheckpointer, cleanupCheckpointer } from './services/checkpointer.service.js';


const logger = new Logger({ serviceName: 'Server' });

// Module-level variables for export and shutdown
let httpServer: Server;
let io: SocketIOServer;
let shutdownManager: ShutdownManager;

/**
 * Application startup sequence
 *
 * Validates external dependencies before accepting traffic.
 * Fails fast if critical services are unavailable.
 *
 * Startup order:
 * 1. Database connection validation
 * 2. Gemini API validation (production/staging only)
 * 3. Express app creation
 * 4. HTTP server creation
 * 5. Socket.io initialization
 * 6. HTTP server start
 * 7. Graceful shutdown setup
 */
async function startServer(): Promise<void> {
  try {
    logger.info('Starting Renovation Agent Backend...', {
      env: env.NODE_ENV,
      nodeVersion: process.version,
      pid: process.pid,
      port: env.PORT,
    });

    // ============================================
    // STEP 1: Validate Database Connection
    // ============================================
    logger.info('Validating database connection...');
    try {
      await testConnection();
      logger.info('✅ Database connection validated');
    } catch (dbError) {
      const error = dbError instanceof Error ? dbError : new Error(String(dbError));
      logger.error('❌ Database connection failed', error);
      if (env.NODE_ENV === 'production') {
        throw new Error(`Database connection failed: ${error.message}`);
      } else {
        logger.warn('Skipping fatal database error in development mode');
      }
    }

    // ============================================
    // STEP 1.5: Initialize LangGraph Checkpointer
    // ============================================
    logger.info('Initializing LangGraph checkpointer...');
    try {
      await initializeCheckpointer();
      logger.info('✅ LangGraph checkpointer initialized');
    } catch (checkpointerError) {
      const error = checkpointerError instanceof Error ? checkpointerError : new Error(String(checkpointerError));
      logger.error('❌ Checkpointer initialization failed', error);
      if (env.NODE_ENV === 'production') {
        throw new Error(`Checkpointer initialization failed: ${error.message}`);
      } else {
        logger.warn('Skipping fatal checkpointer error in development mode');
      }
    }

    // ============================================
    // STEP 2: Validate Gemini API (production only for now)
    // ============================================
    if (env.NODE_ENV === 'production') {
      logger.info('Validating Gemini API...');
      try {
        const testModel = createChatModel();
        // Quick ping to verify API key works
        await testModel.invoke([{ role: 'user', content: 'ping' }]);
        logger.info('✅ Gemini API validated');
      } catch (geminiError) {
        const error = geminiError instanceof Error ? geminiError : new Error(String(geminiError));
        logger.error('❌ Gemini API validation failed', error);
        throw new Error('Gemini API is required in production');
      }
    } else {
      logger.info('Skipping Gemini API validation in development/test mode');
    }

    // ============================================
    // STEP 3: Create Express App
    // ============================================
    logger.info('Initializing Express application...');
    const app = createApp();
    logger.info('✅ Express application initialized');

    // ============================================
    // STEP 4 & 6: Create and Start HTTP Server
    // ============================================
    // NOTE: In production, TLS termination is handled by the reverse proxy / load balancer.
    // The application listens on HTTP internally.
    httpServer = app.listen(env.PORT, () => {
      logger.info('🚀 Renovation Agent Backend started successfully', {
        port: env.PORT,
        env: env.NODE_ENV,
        pid: process.pid,
        endpoints: {
          health: `http://localhost:${env.PORT}/health`,
          api: `http://localhost:${env.PORT}/api`,
          docs: `http://localhost:${env.PORT}/api-docs`,
          socketPath: '/socket.io',
        },
      });
    });
    logger.info('✅ HTTP server created and listening');

    // ============================================
    // STEP 5: Setup Socket.io Server
    // ============================================
    logger.info('Initializing Socket.io...');
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: env.FRONTEND_URL,
        credentials: true,
        methods: ['GET', 'POST'],
      },
      // Connection settings
      pingTimeout: 60000, // 60 seconds
      pingInterval: 25000, // 25 seconds
      // Max payload size for images
      maxHttpBufferSize: 10e6, // 10 MB
    });

    // Socket.io Middleware for Authentication
    io.use(async (socket: Socket, next) => {
      try {
        const token = socket.handshake.auth.token as string | undefined;
        if (!token) {
          return next(new Error('Authentication error: Token required'));
        }

        const user = await verifyToken(token);
        // Attach user to socket for later use
        (socket as AuthenticatedSocket).user = user;
        next();
      } catch (err) {
        logger.error('Socket authentication failed', err as Error);
        next(new Error('Authentication error: Invalid token'));
      }
    });

    // ============================================
    // Rate Limiter (in-memory token bucket)
    // ============================================
    const RATE_LIMIT_MAX_TOKENS = 10;
    const RATE_LIMIT_REFILL_MS = 60_000; // 60 seconds
    const rateLimitBuckets = new Map<string, { tokens: number; lastRefill: number }>();

    function checkRateLimit(socketId: string): boolean {
      const now = Date.now();
      let bucket = rateLimitBuckets.get(socketId);

      if (!bucket) {
        bucket = { tokens: RATE_LIMIT_MAX_TOKENS, lastRefill: now };
        rateLimitBuckets.set(socketId, bucket);
      }

      // Refill tokens based on elapsed time
      const elapsed = now - bucket.lastRefill;
      if (elapsed >= RATE_LIMIT_REFILL_MS) {
        bucket.tokens = RATE_LIMIT_MAX_TOKENS;
        bucket.lastRefill = now;
      }

      if (bucket.tokens > 0) {
        bucket.tokens--;
        return true;
      }

      return false;
    }

    // Socket.io connection handler
    io.on('connection', (socket: Socket) => {
      const user = (socket as AuthenticatedSocket).user;
      logger.info('Client connected', {
        socketId: socket.id,
        userId: user?.id,
        transport: socket.conn.transport.name,
      });

      // Track transport upgrades
      socket.conn.on('upgrade', () => {
        logger.info('Client transport upgraded', {
          socketId: socket.id,
          transport: socket.conn.transport.name,
        });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('Client disconnected', {
          socketId: socket.id,
          reason,
        });
        rateLimitBuckets.delete(socket.id);
      });

      // Join Session Room
      socket.on('chat:join_session', (sessionId: string) => {
        if (!sessionId) {
          logger.warn('Client attempted to join session without ID', undefined, { socketId: socket.id });
          return;
        }

        const roomName = `session:${sessionId}`;
        socket.join(roomName);
        logger.info(`Socket ${socket.id} joined room ${roomName}`);

        // Notify client they have joined
        socket.emit('chat:session_joined', { sessionId });
      });

      // Handle User Message
      socket.on('chat:user_message', async (data: { sessionId: string; content: string }) => {
        const { sessionId, content } = data;
        if (!sessionId || !content) {
          logger.warn('Invalid message format', undefined, { socketId: socket.id });
          return;
        }

        // Rate limit check
        if (!checkRateLimit(socket.id)) {
          logger.warn('Rate limit exceeded', undefined, { socketId: socket.id, sessionId });
          socket.emit('chat:error', {
            sessionId,
            error: 'Rate limit exceeded. Please wait before sending more messages.',
          });
          return;
        }

        logger.info('Received user message', {
          socketId: socket.id,
          sessionId,
          contentLength: content.length
        });

        // Verify user is in the room
        const roomName = `session:${sessionId}`;
        if (!socket.rooms.has(roomName)) {
          logger.warn('User attempted to send message to room they are not in', undefined, { socketId: socket.id, roomName });
          socket.emit('chat:error', {
            sessionId,
            error: 'You must join a session before sending messages'
          });
          return;
        }

        // Acknowledge receipt
        socket.emit('chat:message_ack', {
          sessionId,
          status: 'received',
          timestamp: new Date().toISOString()
        });

        // Process message with ChatService (Phase 1.2: LangChain + Gemini integration)
        try {
          const chatService = new ChatService();

          const streamCallback: StreamCallback = {
            onToken: (token: string) => {
              socket.to(roomName).emit('chat:assistant_token', {
                sessionId,
                token,
                done: false,
              });
              socket.emit('chat:assistant_token', {
                sessionId,
                token,
                done: false,
              });
            },
            onComplete: (fullResponse: string) => {
              socket.to(roomName).emit('chat:assistant_token', {
                sessionId,
                token: '',
                done: true,
              });
              socket.emit('chat:assistant_token', {
                sessionId,
                token: '',
                done: true,
              });
              logger.info('AI response completed', {
                socketId: socket.id,
                sessionId,
                responseLength: fullResponse.length,
              });
            },
            onError: (error: Error) => {
              logger.error('Error processing message', error, { socketId: socket.id, sessionId });
              socket.emit('chat:error', {
                sessionId,
                error: 'Failed to process message. Please try again.',
              });
            },
            onToolCall: (toolName: string, input: string) => {
              logger.info('Agent calling tool', { socketId: socket.id, sessionId, toolName });
              socket.to(roomName).emit('chat:tool_call', { sessionId, toolName, input });
              socket.emit('chat:tool_call', { sessionId, toolName, input });
            },
            onToolResult: (toolName: string, result: string) => {
              logger.info('Tool returned result', { socketId: socket.id, sessionId, toolName });
              socket.to(roomName).emit('chat:tool_result', { sessionId, toolName, result });
              socket.emit('chat:tool_result', { sessionId, toolName, result });
            },
          };

          await chatService.processMessage(sessionId, content, streamCallback);
        } catch (error) {
          logger.error('Error initializing ChatService', error as Error, { socketId: socket.id, sessionId });
          socket.emit('chat:error', {
            sessionId,
            error: 'Failed to process message. Please try again.',
          });
        }
      });
    });

    // Store io instance globally for access in other modules
    // (In Phase 6, we'll create a proper Socket service)
    (global as Record<string, unknown>).io = io;

    logger.info('✅ Socket.io initialized');

    // ============================================
    // STEP 6: Handle Server Errors
    // ============================================
    // The server is already started in Step 4/6.
    // Here we just attach additional error handlers if needed.

    // Handle server listen errors (e.g., port already in use)
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${env.PORT} is already in use`, error, {
          port: env.PORT,
          suggestion: 'Try stopping the other process or change PORT in .env',
        });
        process.exit(1);
      } else {
        logger.error('❌ Server error', error);
        process.exit(1);
      }
    });

    // ============================================
    // STEP 7: Setup Graceful Shutdown
    // ============================================
    setupGracefulShutdown();

  } catch (error) {
    logger.error('❌ FATAL: Failed to start server', error as Error, {
      env: env.NODE_ENV,
      port: env.PORT,
    });

    // Exit with failure code (container orchestrator will restart)
    process.exit(1);
  }
}

/**
 * Setup graceful shutdown with ShutdownManager
 *
 * Resources are cleaned up in order:
 * 1. Socket.io connections
 * 2. Database connection pool
 *
 * Each resource has its own timeout to prevent blocking.
 * Idempotent - safe to call multiple times.
 */
function setupGracefulShutdown(): void {
  logger.info('Setting up graceful shutdown...');

  // Create shutdown manager
  shutdownManager = new ShutdownManager(httpServer, {
    timeout: parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10),
    logger,
  });

  // Register Socket.io cleanup
  shutdownManager.registerResource({
    name: 'Socket.io',
    cleanup: async () => {
      return new Promise<void>((resolve) => {
        io.close(() => {
          logger.info('Socket.io connections closed');
          resolve();
        });
      });
    },
    timeout: 3000, // 3 second timeout for Socket.io cleanup
  });

  // Register database cleanup
  shutdownManager.registerResource({
    name: 'Database',
    cleanup: async () => {
      await closeConnection();
    },
    timeout: 5000, // 5 second timeout for database cleanup
  });

  // LangGraph Checkpointer cleanup (Phase 1.3)
  shutdownManager.registerResource({
    name: 'LangGraph Checkpointer',
    cleanup: async () => {
      await cleanupCheckpointer();
    },
    timeout: 3000, // 3 second timeout for checkpointer cleanup
  });

  // Register signal handlers for graceful shutdown
  shutdownManager.registerSignalHandlers();

  logger.info('✅ Graceful shutdown configured');
}

// ============================================
// Start Server (only if not in test environment)
// ============================================
if (env.NODE_ENV !== 'test') {
  startServer();
}

// ============================================
// Exports for Testing
// ============================================
export { startServer, httpServer, io };
