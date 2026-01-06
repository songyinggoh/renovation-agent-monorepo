# Production-Ready Backend Patterns Research

**Purpose**: Extract production-tested patterns from existing projects to enhance the renovation agent backend's reliability, observability, and maintainability.

**Source**: Lab Report Generator API (production application)

---

## 📋 Table of Contents

1. [Graceful Shutdown Management](#graceful-shutdown-management)
2. [Startup Validation Sequence](#startup-validation-sequence)
3. [API Documentation (Swagger/OpenAPI)](#api-documentation-swaggeropenapi)
4. [Request/Response Logging](#requestresponse-logging)
5. [Health Check Routes](#health-check-routes)
6. [Environment-Aware Initialization](#environment-aware-initialization)
7. [Test-Friendly Architecture](#test-friendly-architecture)
8. [Implementation Recommendations](#implementation-recommendations)

---

## 1. Graceful Shutdown Management

### Problem
Without proper shutdown handling:
- Database connections leak
- In-flight requests are abruptly terminated
- Socket.io connections drop without cleanup
- LangChain conversations aren't saved
- Resources aren't released properly

### Solution: ShutdownManager Pattern

**Features**:
- **Idempotent**: Safe to call multiple times (prevents race conditions)
- **Resource Registration**: Services register cleanup callbacks
- **Per-Resource Timeouts**: Each resource gets its own timeout
- **Error Isolation**: One resource failure doesn't cascade
- **Signal Handling**: Handles SIGTERM, SIGINT, SIGQUIT
- **Forced Shutdown**: Global timeout for unresponsive resources

**Implementation Pattern**:

```typescript
// utils/shutdown-manager.ts
export class ShutdownManager {
  private isShuttingDown = false; // Prevents duplicate shutdowns
  private resources: CleanupResource[] = [];
  private server: Server;
  private globalTimeout: number;

  constructor(server: Server, options: { timeout: number; logger: Logger }) {
    this.server = server;
    this.globalTimeout = options.timeout;
  }

  /**
   * Register a resource for cleanup during shutdown
   */
  registerResource(resource: {
    name: string;
    cleanup: () => Promise<void>;
    timeout: number;
  }): void {
    this.resources.push(resource);
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  registerSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGQUIT'];

    signals.forEach(signal => {
      process.on(signal, () => {
        logger.info(`${signal} received, initiating graceful shutdown...`);
        this.shutdown(signal);
      });
    });
  }

  /**
   * Perform graceful shutdown
   */
  private async shutdown(signal: string): Promise<void> {
    // Idempotent: prevent duplicate shutdowns
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress, ignoring duplicate signal');
      return;
    }
    this.isShuttingDown = true;

    logger.info('Graceful shutdown initiated', { signal });

    // Set global timeout for forced shutdown
    const forceShutdownTimer = setTimeout(() => {
      logger.error('Graceful shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, this.globalTimeout);

    try {
      // Step 1: Stop accepting new connections
      await this.closeServer();

      // Step 2: Cleanup registered resources
      await this.cleanupResources();

      // Step 3: Exit cleanly
      clearTimeout(forceShutdownTimer);
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      clearTimeout(forceShutdownTimer);
      logger.error('Graceful shutdown failed', error as Error);
      process.exit(1);
    }
  }

  private async closeServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          logger.error('Error closing server', err);
          reject(err);
        } else {
          logger.info('HTTP server closed');
          resolve();
        }
      });
    });
  }

  private async cleanupResources(): Promise<void> {
    for (const resource of this.resources) {
      try {
        logger.info(`Cleaning up ${resource.name}...`);

        // Race cleanup against per-resource timeout
        await Promise.race([
          resource.cleanup(),
          this.timeoutPromise(resource.timeout, resource.name),
        ]);

        logger.info(`✅ ${resource.name} cleaned up successfully`);
      } catch (error) {
        // Log but continue (error isolation)
        logger.error(`❌ Failed to cleanup ${resource.name}`, error as Error);
      }
    }
  }

  private timeoutPromise(ms: number, resourceName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${resourceName} cleanup timeout after ${ms}ms`));
      }, ms);
    });
  }
}
```

**Usage in server.ts**:

```typescript
const shutdownManager = new ShutdownManager(httpServer, {
  timeout: 10000, // 10 second global timeout
  logger,
});

// Register resources for cleanup
shutdownManager.registerResource({
  name: 'Database',
  cleanup: async () => await closeConnection(),
  timeout: 5000,
});

shutdownManager.registerResource({
  name: 'Socket.io',
  cleanup: async () => {
    return new Promise(resolve => {
      io.close(() => {
        logger.info('Socket.io connections closed');
        resolve();
      });
    });
  },
  timeout: 3000,
});

// LangChain checkpoint saver (Phase 4)
shutdownManager.registerResource({
  name: 'LangChain Checkpointer',
  cleanup: async () => {
    // Ensure all conversations are saved to database
    await checkpointSaver.flush();
  },
  timeout: 5000,
});

// Register signal handlers
shutdownManager.registerSignalHandlers();
```

**Benefits for Renovation Agent**:
- ✅ Prevents conversation data loss (LangChain state saved)
- ✅ Graceful WebSocket disconnection (user sees clean disconnect)
- ✅ Database connections properly closed
- ✅ Works with container orchestration (Kubernetes, Docker Swarm)
- ✅ Handles multiple termination signals
- ✅ Production-ready with timeouts and error isolation

---

## 2. Startup Validation Sequence

### Problem
Server accepts traffic before dependencies are ready:
- Database migrations not applied
- External APIs unreachable
- Configuration invalid

### Solution: Fail-Fast Startup Validation

**Pattern**: Validate all critical dependencies before `server.listen()`

```typescript
async function startServer(): Promise<void> {
  try {
    logger.info('Starting Renovation Agent Backend...', {
      env: env.NODE_ENV,
      nodeVersion: process.version,
      pid: process.pid,
    });

    // STEP 1: Validate database connection
    logger.info('Validating database connection...');
    try {
      await testConnection(); // From db/index.ts
      logger.info('✅ Database connection validated');
    } catch (dbError) {
      const error = dbError instanceof Error ? dbError : new Error(String(dbError));
      logger.error('❌ Database connection failed', error);
      throw new Error(`Database connection failed: ${error.message}`);
    }

    // STEP 2: Validate Gemini API (optional in dev)
    if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
      logger.info('Validating Gemini API...');
      try {
        const testModel = createChatModel();
        await testModel.invoke('ping'); // Quick test call
        logger.info('✅ Gemini API validated');
      } catch (geminiError) {
        logger.error('❌ Gemini API validation failed', geminiError as Error);
        throw new Error('Gemini API is required in production');
      }
    }

    // STEP 3: Check for pending migrations (Drizzle)
    logger.info('Checking database migrations...');
    // TODO: Add migration check in Phase 1
    // const pendingMigrations = await checkPendingMigrations();
    // if (pendingMigrations.length > 0) {
    //   logger.warn('⚠️ Pending migrations detected', { count: pendingMigrations.length });
    // }

    // STEP 4: Initialize Socket.io
    logger.info('Initializing Socket.io...');
    const io = new SocketIOServer(httpServer, { /* config */ });
    setupSocketHandlers(io); // Phase 6
    logger.info('✅ Socket.io initialized');

    // STEP 5: Start HTTP server (only after all validations pass)
    httpServer.listen(env.PORT, () => {
      logger.info('🚀 Renovation Agent Backend started successfully', {
        port: env.PORT,
        env: env.NODE_ENV,
        pid: process.pid,
        endpoints: {
          health: `http://localhost:${env.PORT}/health`,
          api: `http://localhost:${env.PORT}/api`,
          socketPath: '/socket.io',
        },
      });
    });

    // Handle server listen errors
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

  } catch (error) {
    logger.error('❌ FATAL: Failed to start server', error as Error, {
      env: env.NODE_ENV,
      port: env.PORT,
    });
    process.exit(1);
  }
}
```

**Benefits**:
- ✅ Fail-fast: Issues discovered before accepting traffic
- ✅ Clear error messages for debugging
- ✅ Prevents cascading failures
- ✅ Production-ready health checks

---

## 3. API Documentation (Swagger/OpenAPI)

### Problem
- API contracts not documented
- Frontend devs need to read code
- Breaking changes not communicated
- No interactive testing UI

### Solution: Swagger/OpenAPI Integration

**Install Dependencies**:
```bash
npm install swagger-ui-express swagger-jsdoc
npm install --save-dev @types/swagger-ui-express @types/swagger-jsdoc
```

**Swagger Configuration** (`src/config/swagger.config.ts`):

```typescript
import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env.js';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Renovation Agent API',
      version: '1.0.0',
      description: 'AI-powered renovation planning assistant API',
      contact: {
        name: 'API Support',
        email: 'support@example.com',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Development server',
      },
      {
        url: 'https://api.renovationagent.com',
        description: 'Production server',
      },
    ],
    components: {
      schemas: {
        RenovationSession: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            phase: {
              type: 'string',
              enum: ['INTAKE', 'CHECKLIST', 'PLAN', 'RENDER', 'PAYMENT', 'COMPLETE', 'ITERATE'],
            },
            totalBudget: { type: 'number' },
            currency: { type: 'string', default: 'USD' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
          },
        },
      },
      // TODO Phase 8: Add security schemes for auth
      // securitySchemes: {
      //   bearerAuth: {
      //     type: 'http',
      //     scheme: 'bearer',
      //     bearerFormat: 'JWT',
      //   },
      // },
    },
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'], // JSDoc comments in these files
};

export const swaggerSpec = swaggerJsdoc(options);
```

**Integrate in app.ts**:

```typescript
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.config.js';

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Renovation Agent API Docs',
}));

// Swagger JSON endpoint (for external tools)
app.get('/api-docs.json', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});
```

**Document Routes with JSDoc** (example for Phase 5):

```typescript
/**
 * @swagger
 * /api/sessions:
 *   post:
 *     summary: Create a new renovation session
 *     tags: [Sessions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Kitchen Renovation"
 *               totalBudget:
 *                 type: number
 *                 example: 50000
 *     responses:
 *       201:
 *         description: Session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RenovationSession'
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', asyncHandler(sessionController.createSession));
```

**Benefits**:
- ✅ Interactive API testing UI
- ✅ Auto-generated documentation from code
- ✅ Frontend contract validation
- ✅ OpenAPI spec export for code generation
- ✅ Reduces onboarding time

**When to Implement**: Phase 5 (API Routes & Controllers)

---

## 4. Request/Response Logging

### Problem
- Can't trace requests in production
- No visibility into slow endpoints
- Hard to debug customer issues
- No request/response audit trail

### Solution: Request/Response Logging Middleware

**Implementation** (`src/middleware/requestLogger.middleware.ts`):

```typescript
import { Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'RequestLogger' });

/**
 * Request logging middleware
 * Logs all incoming requests with timing information
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const requestId = crypto.randomUUID(); // Unique ID per request

  // Attach request ID to request object for use in other middleware/controllers
  (req as Request & { requestId: string }).requestId = requestId;

  // Log incoming request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // Capture response using finish event
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('content-length'),
    });
  });

  next();
}

/**
 * Error logging middleware
 * Logs errors with full context
 */
export function errorLogger(err: Error, req: Request, res: Response, next: NextFunction): void {
  const requestId = (req as Request & { requestId?: string }).requestId;

  logger.error('Request error', err, {
    requestId,
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query,
    ip: req.ip,
  });

  next(err); // Pass to error handler
}
```

**Usage in app.ts**:

```typescript
import { requestLogger, errorLogger } from './middleware/requestLogger.middleware.js';

// Request logging (skip in test environment)
if (env.NODE_ENV !== 'test') {
  app.use(requestLogger);
}

// ... routes ...

// Error logging (before error handler)
app.use(errorLogger);
app.use(errorHandler);
```

**Benefits**:
- ✅ Request tracing with unique IDs
- ✅ Performance monitoring (duration tracking)
- ✅ Full request/response context in errors
- ✅ Production debugging capability
- ✅ Audit trail for compliance

**When to Implement**: Phase 5 (API Routes)

---

## 5. Health Check Routes

### Problem
- Container orchestrators can't determine service health
- No visibility into dependency status
- Manual testing required

### Solution: Comprehensive Health Checks

**Create Health Routes** (`src/routes/health.routes.ts`):

```typescript
import { Router, Request, Response } from 'express';
import { testConnection, getPoolStats } from '../db/index.js';
import { env, isAuthEnabled, isPaymentsEnabled } from '../config/env.js';
import { Logger } from '../utils/logger.js';

const router = Router();
const logger = new Logger({ serviceName: 'HealthCheck' });

/**
 * Basic health check
 * Used by load balancers and container orchestrators
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    version: '1.0.0',
  });
});

/**
 * Liveness probe
 * Returns 200 if server is running
 */
router.get('/health/live', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness probe
 * Returns 200 only if all dependencies are healthy
 */
router.get('/health/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, { status: 'ok' | 'error'; message?: string }> = {};

  // Check database
  try {
    await testConnection();
    checks.database = { status: 'ok' };
  } catch (error) {
    checks.database = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Check feature flags
  checks.features = {
    status: 'ok',
    auth: isAuthEnabled() ? 'enabled' : 'disabled',
    payments: isPaymentsEnabled() ? 'enabled' : 'disabled',
  };

  // Determine overall status
  const allHealthy = Object.values(checks).every(c => c.status === 'ok');
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: allHealthy ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * Detailed status (for monitoring/debugging)
 * Includes connection pool stats, memory usage, etc.
 */
router.get('/health/status', async (_req: Request, res: Response) => {
  const poolStats = getPoolStats();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptime: process.uptime(),
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    database: {
      poolSize: poolStats.total,
      idleConnections: poolStats.idle,
      waitingRequests: poolStats.waiting,
    },
    features: {
      auth: isAuthEnabled(),
      payments: isPaymentsEnabled(),
    },
  });
});

export default router;
```

**Usage in app.ts**:

```typescript
import healthRoutes from './routes/health.routes.js';

app.use('/', healthRoutes);
```

**Kubernetes Integration Example**:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

**Benefits**:
- ✅ Kubernetes/Docker health checks
- ✅ Load balancer health monitoring
- ✅ Dependency status visibility
- ✅ Production debugging info
- ✅ Zero-downtime deployments

**When to Implement**: Phase 1 ✅ (Basic already done, enhance in Phase 5)

---

## 6. Environment-Aware Initialization

### Problem
- Same initialization logic for all environments
- Expensive services started in tests
- Development workflows slowed down

### Solution: Conditional Service Initialization

**Pattern**:

```typescript
// Gemini API validation (only in production/staging)
if (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging') {
  logger.info('Validating Gemini API...');
  await validateGeminiConnection();
} else {
  logger.info('Skipping Gemini validation in development/test mode');
}

// Request logging (skip in tests for cleaner output)
if (env.NODE_ENV !== 'test') {
  app.use(requestLogger);
}

// Start server (skip in tests - let test runner control lifecycle)
if (env.NODE_ENV !== 'test') {
  await startServer();
  shutdownManager.registerSignalHandlers();
}
```

**Benefits**:
- ✅ Faster test execution
- ✅ Lower costs in development (no AI API calls)
- ✅ Environment-specific behavior
- ✅ Better developer experience

---

## 7. Test-Friendly Architecture

### Problem
- Server auto-starts on import
- Can't control lifecycle in tests
- Port conflicts in CI/CD

### Solution: Conditional Start + Export Pattern

**Current server.ts (auto-starts)**:
```typescript
// ❌ BAD: Starts immediately on import
startServer();
```

**Test-Friendly Pattern**:
```typescript
// ✅ GOOD: Export functions, conditional start
export async function startServer(): Promise<void> {
  // ... startup logic
}

export function createServer(): Server {
  const app = createApp();
  return createServer(app);
}

// Only auto-start if not in test
if (process.env.NODE_ENV !== 'test') {
  startServer();
  shutdownManager.registerSignalHandlers();
}

// Export for tests
export { app, httpServer };
```

**Test Usage**:
```typescript
import { app, createServer } from '../src/server';
import request from 'supertest';

describe('Health Check', () => {
  it('should return 200', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
  });
});
```

**Benefits**:
- ✅ Tests don't auto-start server
- ✅ No port conflicts
- ✅ Faster test execution
- ✅ Better test isolation

**When to Implement**: Phase 7 (Testing)

---

## 8. Implementation Recommendations

### Phase 1 Enhancements (Immediate)
1. **Add ShutdownManager** - Critical for production
2. **Enhance Startup Validation** - Database + Gemini check
3. **Improve Health Checks** - Add `/health/ready` and `/health/status`
4. **Add Server Error Handler** - Port conflict detection

### Phase 5 Additions (API Routes)
1. **Add Swagger/OpenAPI** - API documentation
2. **Add Request Logger** - Tracing and performance monitoring
3. **Add Error Logger** - Enhanced error context

### Phase 7 Additions (Testing)
1. **Refactor server.ts** - Conditional start for tests
2. **Export app/server** - Test integration

---

## 📊 Priority Matrix

| Pattern | Impact | Effort | Priority | Phase |
|---------|--------|--------|----------|-------|
| ShutdownManager | High | Medium | **P0** | 1 |
| Startup Validation | High | Low | **P0** | 1 |
| Health Checks | High | Low | **P0** | 1 |
| Swagger/OpenAPI | Medium | Medium | **P1** | 5 |
| Request Logger | High | Low | **P1** | 5 |
| Test-Friendly Architecture | Medium | Low | **P2** | 7 |
| Environment-Aware Init | Low | Low | **P2** | 1 |

---

## 🎯 Next Steps

1. **Create ShutdownManager utility** (Phase 1)
2. **Enhance startup validation** (Phase 1)
3. **Expand health check routes** (Phase 1)
4. **Add Swagger in Phase 5**
5. **Add request logging in Phase 5**
6. **Refactor for tests in Phase 7**
