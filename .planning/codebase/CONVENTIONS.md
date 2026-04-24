# Coding Conventions

**Analysis Date:** 2026-03-01

## Naming Patterns

**Files:**
- Use `kebab-case` for all files: `chat.service.ts`, `auth.middleware.ts`, `render.worker.ts`
- Suffix files by role: `.service.ts`, `.controller.ts`, `.middleware.ts`, `.worker.ts`, `.routes.ts`, `.schema.ts`, `.validators.ts`, `.tool.ts`
- Frontend hooks: `camelCase` starting with `use`: `useChat.ts`, `useRenderState.ts`
- Frontend components: `kebab-case.tsx`: `chat-input.tsx`, `phase-progress-bar.tsx`
- Test files: mirror source path with `.test.ts` suffix: `tests/unit/services/chat.service.test.ts`

**Functions:**
- Use `camelCase`: `createChatModel()`, `fetchWithAuth()`, `emitToSession()`
- Factory functions: prefix with `create` or `get`: `createApp()`, `getCheckpointer()`, `getRedisConnection()`
- Boolean helpers: prefix with `is`: `isAuthEnabled()`, `isEmailEnabled()`, `isPermanentError()`
- Event handlers: prefix with `on`: `onToken()`, `onComplete()`, `onError()`

**Variables:**
- Use `camelCase` for local variables and parameters
- Use `UPPER_SNAKE_CASE` for constants: `WORKER_PROFILES`, `MAX_REACT_ITERATIONS`, `RATE_LIMIT_MAX_TOKENS`
- Private class members: no prefix (TypeScript `private` keyword instead of `_` convention)

**Types:**
- Use `PascalCase` for interfaces, types, and classes: `ChatService`, `StreamCallback`, `TracedModel`
- Zod schemas: `camelCase` with `Schema` suffix: `chatUserMessageSchema`, `renderGenerateJobSchema`
- Inferred Zod types: `PascalCase` matching schema: `type ChatUserMessagePayload = z.infer<typeof chatUserMessageSchema>`

## Code Style

**Formatting:**
- No Prettier config file detected; rely on editor defaults and ESLint for formatting
- Indentation: 2 spaces (consistent across codebase)
- Semicolons: always used
- Quotes: single quotes for strings
- Trailing commas: used in multi-line constructs

**Linting:**
- Backend: ESLint 9 flat config (`backend/eslint.config.js`)
  - Extends: `@eslint/js` recommended + `typescript-eslint` recommended
  - Ignores: `dist/`, `coverage/`, `load-tests/`
- Frontend: ESLint with `eslint-config-next` (`frontend/eslint.config.mjs`)
  - Extends: `core-web-vitals` + `typescript`
- Pre-commit: Husky + lint-staged runs lint on staged files

**TypeScript Strictness:**
- Both backend and frontend use `"strict": true` in tsconfig
- Backend: `skipLibCheck: true`, `isolatedModules: true`, `esModuleInterop: true`
- Frontend: `noEmit: true` (Next.js handles compilation)

## Import Organization

**Order (backend):**
1. Node.js built-ins (if any)
2. OpenTelemetry / instrumentation (must be first in `server.ts`)
3. Third-party packages (`express`, `drizzle-orm`, `zod`, `@langchain/*`, etc.)
4. Shared types (`@renovation/shared-types`)
5. Internal config (`../config/*.js`)
6. Internal modules (`../services/*.js`, `../utils/*.js`, `../db/*.js`)

**Order (frontend):**
1. React/Next.js imports
2. Third-party packages (`socket.io-client`, `@tanstack/react-query`)
3. Internal imports via `@/*` alias (`@/lib/*`, `@/hooks/*`, `@/components/*`, `@/types/*`)

**Path Aliases:**
- Frontend: `@/*` maps to project root (configured in `frontend/tsconfig.json`)
- Backend: `@renovation/shared-types` maps to `../packages/shared-types/dist/index.d.ts`
- Backend internal: Use relative paths with `.js` extension for ESM compatibility:
  ```typescript
  import { Logger } from '../utils/logger.js';
  import { env } from '../config/env.js';
  ```

**ESM Import Rule (backend):**
- Backend uses ESM (`"type": "module"` in `package.json`)
- All internal imports MUST include `.js` extension (even for `.ts` source files):
  ```typescript
  // CORRECT
  import { ChatService } from './services/chat.service.js';
  // WRONG - will fail at runtime
  import { ChatService } from './services/chat.service';
  ```

## Error Handling

**Patterns:**
- Use typed error classes from `backend/src/utils/errors.ts`:
  ```typescript
  import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';

  // In service/controller:
  throw new NotFoundError('Session not found');
  throw new BadRequestError('Invalid room configuration');
  ```

- Wrap async route handlers with `asyncHandler`:
  ```typescript
  import { asyncHandler } from '../utils/async.js';

  export const getSession = asyncHandler(async (req: Request, res: Response) => {
    // errors automatically forwarded to errorHandler middleware
  });
  ```

- BullMQ workers distinguish error types:
  ```typescript
  import { UnrecoverableError } from 'bullmq';

  // Permanent failure (no retry):
  throw new UnrecoverableError('Content blocked by safety filters');
  // Retriable failure:
  throw new Error('Network timeout');
  ```

- Frontend API errors:
  ```typescript
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Request failed: ${response.status} ${errorBody}`);
  }
  ```

- Socket.io errors emit events (never crash):
  ```typescript
  socket.emit('chat:error', { sessionId, error: 'Human-readable message' });
  ```

## Logging

**Framework:** Custom structured JSON logger (`backend/src/utils/logger.ts`)

**Pattern:**
```typescript
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'MyService' });

// Info with metadata
logger.info('Processing request', { sessionId, userId, operation: 'create' });

// Warning with optional error
logger.warn('Rate limit approaching', undefined, { socketId, remaining: 2 });

// Error (error parameter is required)
logger.error('Database query failed', error as Error, { sessionId, query: 'select' });

// Debug
logger.debug('Cache hit', { key, ttl });
```

**Rules:**
- Never use `console.log` / `console.error` directly -- always use Logger
- Include `sessionId`, `socketId`, `userId` in metadata when available (MDC pattern)
- Never log secrets, tokens, or full message content
- Log content length instead of content: `contentLength: content.length`
- Frontend uses matching Logger class in `frontend/lib/logger.ts`

## Comments

**When to Comment:**
- JSDoc on all exported functions, classes, and interfaces
- Inline comments for non-obvious business logic or security decisions
- Step-by-step comments in complex flows (e.g., `// Step 1: Load message history`)
- ASCII section headers in large files (e.g., `server.ts` uses `// ===== STEP N: ... =====`)

**JSDoc Style:**
```typescript
/**
 * Process a user message through the ReAct agent and stream the response
 *
 * Phase IV: Wrapped in OTel spans tracking AI attributes from IA doc section 1.4.
 *
 * @param sessionId - The session ID for context and thread_id
 * @param userMessage - The user's message content
 * @param callback - Callbacks for streaming tokens and tool events
 */
```

## Function Design

**Size:** Keep functions focused on a single responsibility. Extract helpers when branching logic grows complex.

**Parameters:**
- Use object destructuring for 3+ parameters
- Use TypeScript interfaces for callback contracts (e.g., `StreamCallback`)
- Optional parameters use `?` syntax, not `| undefined`

**Return Values:**
- Use discriminated unions for results:
  ```typescript
  type Result<T> = { success: true; data: T } | { success: false; reason: string };
  ```
- Async functions return `Promise<void>` when no value needed
- Services return domain objects or throw typed errors (never return `null` for "not found")

## Module Design

**Exports:**
- Use named exports (not default) for services, controllers, utilities
- Exception: route files use `export default router`
- Barrel files: `backend/src/db/schema/index.ts`, `backend/src/tools/index.ts`, `frontend/components/renovation/index.ts`

**Class vs Function:**
- Services: Class-based (`ChatService`, `MessageService`, `RenderService`) -- instantiated once, hold dependencies
- Config: Factory functions (`createChatModel()`, `createApp()`) -- stateless creation
- Middleware: Plain functions (`authMiddleware`, `requestIdMiddleware`)
- Tools: `DynamicStructuredTool` instances (LangChain pattern)
- Workers: Factory function `startXxxWorker()` returning worker instance

**Dependency Injection:**
- Constructor injection for services that need other services:
  ```typescript
  class ChatService {
    private messageService: MessageService;
    constructor() {
      this.messageService = new MessageService();
    }
  }
  ```
- Module-level singletons for config and DB:
  ```typescript
  import { db } from '../db/index.js';
  import { env } from '../config/env.js';
  ```

## Validation Patterns

**Zod Schema Convention:**
```typescript
// Define schema
export const chatUserMessageSchema = z.object({
  sessionId: z.string().uuid({ message: 'Invalid session ID format' }),
  content: z.string().trim().min(1).max(10000),
  attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS).optional(),
});

// Infer type
export type ChatUserMessagePayload = z.infer<typeof chatUserMessageSchema>;

// Usage (Socket.io)
const result = chatUserMessageSchema.safeParse(data);
if (!result.success) { /* emit error */ }
const { sessionId, content } = result.data;

// Usage (HTTP middleware)
import { validate } from '../middleware/validate.js';
router.post('/', validate(createSessionSchema), controller.create);
```

## API Response Format

**Success responses:**
```typescript
// List endpoints wrap in named key:
res.json({ sessions: [...] });
res.json({ messages: [...] });

// Single item returns directly:
res.json(session);

// Create returns 201:
res.status(201).json(created);
```

**Error responses:**
```typescript
res.status(statusCode).json({
  success: false,
  error: 'Human-readable message',
  errorId: randomUUID(),  // for support/debugging
});
```

---

*Convention analysis: 2026-03-01*
