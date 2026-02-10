# Coding Conventions

**Analysis Date:** 2026-02-09

## Naming Patterns

**Files:**
- Backend: `kebab-case.ts` (e.g., `chat.service.ts`, `error-handler.ts`, `shutdown-manager.ts`)
- Frontend: `kebab-case.tsx` for components, `kebab-case.ts` for utilities
- Tests: `*.test.ts` suffix (e.g., `message.service.test.ts`)
- Schemas: `*.schema.ts` suffix (e.g., `sessions.schema.ts`, `messages.schema.ts`)
- Configuration: `*.config.ts` or `*.config.js` (e.g., `vitest.config.ts`, `eslint.config.js`)

**Functions:**
- Backend: `camelCase` for functions, `PascalCase` for classes (e.g., `createChatModel()`, `class ChatService`)
- Frontend: `camelCase` for functions, `PascalCase` for React components (e.g., `function Button()`, `export const PhaseProgressBar`)
- Factory functions: `create*` prefix (e.g., `createChatModel()`, `createApp()`)
- Event handlers: `on*` or `handle*` prefix (e.g., `onToken()`, `handleSubmit()`)

**Variables:**
- Constants: `UPPER_SNAKE_CASE` for module-level constants (e.g., `RATE_LIMIT_MAX_TOKENS`, `DEFAULT_MODEL_CONFIG`, `RENOVATION_PHASES`)
- Regular variables: `camelCase` (e.g., `sessionId`, `userMessage`, `fullResponse`)
- Component props: `camelCase` (e.g., `variant`, `size`, `asChild`)

**Types:**
- Interfaces/Types: `PascalCase` (e.g., `interface StreamCallback`, `type RenovationPhase`)
- Enums: `PascalCase` for enum name, `UPPER_SNAKE_CASE` for values (not heavily used, prefer union types)
- Type inference: Drizzle `$inferSelect` and `$inferInsert` (e.g., `type RenovationSession = typeof renovationSessions.$inferSelect`)

## Code Style

**Formatting:**
- Tool: Prettier (implied by Next.js/shadcn, no explicit config file)
- Indentation: 2 spaces
- Semicolons: Yes (backend and frontend)
- Quotes: Single quotes for strings, double quotes in JSX attributes
- Trailing commas: Yes

**Linting:**
- Backend: ESLint 9.26.0 + typescript-eslint 8.52.0
  - Config: `backend/eslint.config.js` (flat config format)
  - Rules: `@eslint/js` recommended + `typescript-eslint` recommended
  - Ignores: `dist/`, `coverage/`
- Frontend: ESLint 9.39.2 + eslint-config-next 16.1.6
  - Config: `frontend/eslint.config.mjs` (flat config format)
  - Rules: Next.js core-web-vitals + TypeScript rules
  - Enforces: No `<img>` tags (use `<Image>`), React Hooks rules

## Import Organization

**Order:**
1. External dependencies (Node.js built-ins, npm packages)
2. LangChain imports (if applicable)
3. Internal modules (config, utils, types)
4. Relative imports (same directory)

**Example from `backend/src/services/chat.service.ts`:**
```typescript
// External (LangChain)
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage, SystemMessage, BaseMessage, ToolMessage, type AIMessageChunk } from '@langchain/core/messages';
import { StateGraph, START, END, MessagesAnnotation } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { eq } from 'drizzle-orm';

// Internal (config)
import { createStreamingModel } from '../config/gemini.js';
import { getSystemPrompt } from '../config/prompts.js';

// Internal (tools, utils)
import { renovationTools } from '../tools/index.js';
import { Logger } from '../utils/logger.js';

// Internal (services, db)
import { MessageService } from './message.service.js';
import { getCheckpointer } from './checkpointer.service.js';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { type ChatMessage } from '../db/schema/messages.schema.js';
```

**Path Aliases:**
- Frontend: `@/*` maps to root directory (e.g., `@/components/ui/button`, `@/lib/utils`)
- Backend: No path aliases, uses relative imports with `.js` extensions (ESM requirement)

**ESM Requirement (Backend):**
- All imports MUST include `.js` extension (even for `.ts` files) for ESM compatibility
- Example: `import { Logger } from '../utils/logger.js';` (not `.ts`)

## Error Handling

**Patterns:**
- **AppError class**: Custom error with statusCode for expected errors (`backend/src/utils/errors.ts`)
  - Example: `throw new AppError('Resource not found', 404);`
- **Global error middleware**: Catches all Express errors, logs with metadata, returns JSON (`backend/src/middleware/errorHandler.ts`)
- **Try-catch in services**: Catch errors, log with Logger, re-throw or return error response
- **Socket.io**: Emit `chat:error` event to client, log full error server-side
- **Async/await**: Always use try-catch for async operations, no floating promises

**Example from `backend/src/services/chat.service.ts`:**
```typescript
try {
  await chatService.processMessage(sessionId, content, streamCallback);
} catch (error) {
  logger.error('Error initializing ChatService', error as Error, { socketId: socket.id, sessionId });
  socket.emit('chat:error', {
    sessionId,
    error: 'Failed to process message. Please try again.',
  });
}
```

## Logging

**Framework:** Custom Logger class (`backend/src/utils/logger.ts`)

**Patterns:**
- Initialize per-service: `const logger = new Logger({ serviceName: 'ServiceName' });`
- Log levels: `logger.debug()`, `logger.info()`, `logger.warn()`, `logger.error()`
- Always include metadata: `logger.info('Message', { key: value, ... });`
- Error logging: `logger.error('Error message', error as Error, { context });`
- MDC pattern: Include userId, sessionId, socketId in metadata for request tracing

**Example:**
```typescript
const logger = new Logger({ serviceName: 'ChatService' });

logger.info('Processing user message with ReAct agent', {
  sessionId,
  messageLength: userMessage.length,
});

logger.error('Error processing message with ReAct agent', error as Error, {
  sessionId,
});
```

**Output format:** Structured JSON to console (container compatible)

## Comments

**When to Comment:**
- Complex algorithms or non-obvious logic
- Phase-specific code (indicate which phase implements feature)
- TODOs for future phases (e.g., `// TODO Phase 4: Check LangChain agent readiness`)
- API contracts and interfaces (JSDoc for public methods)
- Configuration rationale (e.g., why certain timeouts or limits are set)

**JSDoc/TSDoc:**
- Used for public interfaces, service classes, and exported functions
- Includes @param, @returns, @throws where applicable
- Example from `backend/src/config/gemini.ts`:
```typescript
/**
 * Create a Gemini model instance for chat/conversation
 *
 * @param options - Optional model configuration overrides
 * @returns Configured ChatGoogleGenerativeAI instance
 */
export function createChatModel(options?: {
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
}): ChatGoogleGenerativeAI { ... }
```

**Inline comments:**
- Use for step-by-step explanations in complex functions
- Example from `backend/src/services/chat.service.ts`:
```typescript
// Step 1: Save user message to database
// Step 2: Get session phase and build phase-aware system prompt
// Step 3: Load message history from database for context
// Step 4: Build input messages with system prompt + history + new message
// Step 5: Stream response from ReAct agent
```

## Function Design

**Size:** Prefer small, focused functions (<100 lines). Services may be larger (ChatService is 323 lines but well-structured with helper methods)

**Parameters:**
- Use interfaces/types for multiple related parameters (e.g., `StreamCallback` interface)
- Destructure object parameters in function signature for clarity
- Example: `async processMessage(sessionId: string, userMessage: string, callback: StreamCallback): Promise<void>`

**Return Values:**
- Always specify return type explicitly (TypeScript strict mode enforced)
- Use `Promise<T>` for async functions
- Return type inference: Use Drizzle's `$inferSelect` and `$inferInsert` for database types
- Example: `async getHistory(sessionId: string, limit: number = 50): Promise<ChatMessage[]>`

## Module Design

**Exports:**
- Named exports preferred over default exports (aligns with ESM best practices)
- Exception: React components often use default export (Next.js pages require it)
- Export interfaces and types alongside implementations
- Example from `backend/src/tools/index.ts`:
```typescript
export { getStyleExamplesTool } from './get-style-examples.tool.js';
export const renovationTools = [getStyleExamplesTool, searchProductsTool, ...];
```

**Barrel Files:**
- Used for component libraries: `frontend/components/renovation/index.ts` exports all components
- Used for tool registry: `backend/src/tools/index.ts` exports all tools
- Pattern: Re-export individual modules for cleaner imports

**Example barrel file:**
```typescript
// frontend/components/renovation/index.ts
export { PhaseProgressBar } from './phase-progress-bar';
export { BudgetGauge } from './budget-gauge';
export { RoomCard } from './room-card';
// ... etc
```

## React/Frontend Specific

**Component Pattern:**
- Functional components with TypeScript
- Use `React.forwardRef` for ref forwarding (shadcn/ui pattern)
- Props interface: `ComponentNameProps extends HTMLAttributes<HTMLElement>`
- Example from `frontend/components/ui/button.tsx`:
```typescript
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";
```

**Component Variants:**
- Use `class-variance-authority` (CVA) for component variants
- Define variants with `cva()` function, extract type with `VariantProps<typeof variantFunction>`

**Styling:**
- Tailwind CSS utility classes
- Use `cn()` helper from `@/lib/utils` to merge class names
- Custom CSS variables in `globals.css` for design tokens

---

*Convention analysis: 2026-02-09*
