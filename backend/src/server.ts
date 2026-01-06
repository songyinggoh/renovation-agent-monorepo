import { createServer, Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { testConnection, closeConnection } from './db/index.js';
import { createChatModel } from './config/gemini.js';
import { Logger } from './utils/logger.js';
import { ShutdownManager } from './utils/shutdown-manager.js';

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
      throw new Error(`Database connection failed: ${error.message}`);
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
    // STEP 4: Create HTTP Server
    // ============================================
    httpServer = createServer(app);
    logger.info('✅ HTTP server created');

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

    // Socket.io connection handler
    io.on('connection', (socket) => {
      logger.info('Client connected', {
        socketId: socket.id,
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
      });

      // TODO: Add chat message handlers in Phase 6
      // socket.on('chat:user_message', handleUserMessage);
      // socket.on('chat:image_upload', handleImageUpload);
    });

    // Store io instance globally for access in other modules
    // (In Phase 6, we'll create a proper Socket service)
    (global as Record<string, unknown>).io = io;

    logger.info('✅ Socket.io initialized');

    // ============================================
    // STEP 6: Start HTTP Server
    // ============================================
    httpServer.listen(env.PORT, () => {
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

  // TODO Phase 4: Add LangChain checkpoint saver cleanup
  // shutdownManager.registerResource({
  //   name: 'LangChain Checkpointer',
  //   cleanup: async () => {
  //     await checkpointSaver.flush();
  //   },
  //   timeout: 5000,
  // });

  // Register signal handlers for graceful shutdown
  shutdownManager.registerSignalHandlers();

  logger.info('✅ Graceful shutdown configured');
}

// ============================================
// Start Server (only if not in test environment)
// ============================================
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

// ============================================
// Exports for Testing
// ============================================
export { startServer, httpServer, io };
