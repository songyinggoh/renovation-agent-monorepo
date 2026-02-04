# AGENTS.md

## Development Commands

### Backend (TypeScript/Express)
```bash
cd backend
npm run dev              # Development server with hot reload
npm run build            # TypeScript compilation
npm run start            # Production server
npm run lint             # ESLint
npm run prep             # Lint + build
npm run test:unit        # Vitest unit tests with coverage
npm run test:integration # Vitest integration tests
npm run test:watch       # Vitest watch mode
# Run single test: npm run test:unit -- --reporter=verbose path/to/test.test.ts
npm run db:generate      # Generate Drizzle migrations
npm run db:migrate       # Run Drizzle migrations
npm run db:studio        # Drizzle Studio GUI
```

### Frontend (Next.js/React)
```bash
cd frontend
npm run dev              # Development server on port 3001
npm run build            # Next.js production build
npm run start            # Production server on port 3001
npm run lint             # Next.js ESLint
npm run type-check       # TypeScript type checking (tsc --noEmit)
npm run test             # Vitest run
npm run test:watch       # Vitest watch mode
npm run test:ui          # Vitest UI
# Run single test: npm run test -- --reporter=verbose path/to/test.test.ts
```

### Root Commands
```bash
npm run dev              # Run both frontend and backend
npm run dev:frontend     # Frontend only
npm run dev:backend      # Backend only
docker-compose up        # Full stack with PostgreSQL
```

## Code Style Guidelines

### TypeScript Standards (Strict)

#### Type Safety
- **NO `any` types** - Use interfaces, types, or type assertions
- Always prefer explicit return types for functions
- Use `as unknown as Type` for complex type assertions if needed
- Strict TypeScript config enabled: `"strict": true`

#### Imports & Exports
```typescript
// ✅ Prefer named exports/imports
export { Logger, ErrorHandler };
import { Logger } from '../utils/logger.js';

// ✅ Use .js extensions for internal imports (ESM)
import { config } from '../config/env.js';

// ❌ Avoid default exports for utilities/classes
export default class Logger {} // Use named export instead
```

#### Naming Conventions
- Files: `kebab-case.ts` (e.g., `user-service.ts`)
- Classes: `PascalCase` (e.g., `UserService`)
- Functions/Variables: `camelCase` (e.g., `getUserById`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_ATTEMPTS`)
- Interfaces: `PascalCase` with `I` prefix optional (e.g., `User` or `IUser`)

#### Error Handling
```typescript
// ✅ Always use structured Logger, never console.log
import { Logger } from "../utils/logger.js";
const log = new Logger({ serviceName: "MyService" });

try {
  await operation();
  log.info("Operation completed", { userId, operation: "create" });
} catch (error) {
  log.error("Operation failed", error as Error, { userId, operation: "create" });
  throw error; // Re-throw with context preserved
}
```

#### Function Patterns
```typescript
// ✅ Prefer explicit return types
async function getUserById(id: string): Promise<User | null> {
  // implementation
}

// ✅ Use Zod for validation
import { z } from 'zod';
const UserSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
});
```

### React/Next.js Standards

#### Component Structure
```typescript
// ✅ Use proper TypeScript typing
interface ButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export function Button({ children, onClick, variant = 'primary' }: ButtonProps) {
  return (
    <button className={cn('button', variant)} onClick={onClick}>
      {children}
    </button>
  );
}
```

#### Hooks Usage
- Custom hooks use `use` prefix: `useChat`, `useAuth`
- Extract complex logic into custom hooks
- Use TanStack Query for server state
- Use React Hook Form for form handling

#### Styling
- Use Tailwind CSS classes
- Use `cn()` utility for conditional classes
- Follow shadcn/ui component patterns
- No inline styles unless absolutely necessary

### Database Patterns (Drizzle/PostgreSQL)

#### Schema Definition
```typescript
// ✅ Use explicit types and constraints
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

#### Queries
```typescript
// ✅ Type-safe queries with Drizzle
const user = await db
  .select()
  .from(users)
  .where(eq(users.email, email))
  .limit(1);
```

### Testing Standards

#### Backend (Vitest)
```typescript
// ✅ Test file naming: *.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { UserService } from '../services/user-service.js';

describe('UserService', () => {
  let service: UserService;
  
  beforeEach(() => {
    service = new UserService();
  });

  it('should create user successfully', async () => {
    const result = await service.createUser({ email: 'test@example.com' });
    expect(result.email).toBe('test@example.com');
  });
});
```

#### Frontend (Vitest + Testing Library)
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../button';

it('should call onClick when clicked', () => {
  const handleClick = vi.fn();
  render(<Button onClick={handleClick}>Click me</Button>);
  
  fireEvent.click(screen.getByText('Click me'));
  expect(handleClick).toHaveBeenCalledTimes(1);
});
```

## Quality Gates (Must Pass Before Commit)

### Backend
```bash
npm run lint             # 0 ESLint errors
npm run build            # TypeScript compilation succeeds
npm run test:unit        # All tests pass, coverage ≥80%
```

### Frontend
```bash
npm run lint             # 0 ESLint errors
npm run type-check       # 0 TypeScript errors
npm run test             # All tests pass, coverage ≥80%
```

## Development Workflow

1. Always write tests before implementation (TDD)
2. Use `.js` extensions for internal imports (ESM compatibility)
3. Never log secrets or sensitive data
4. Follow conventional commits: `feat:`, `fix:`, `refactor:`, `test:`
5. Run quality gates before committing
6. Use structured logging with proper context (userId, sessionId, etc.)

## Environment Setup

- Backend requires: `NODE_ENV`, `PORT`, `DATABASE_URL`, `GOOGLE_API_KEY`
- Frontend runs on port 3001, Backend on port 3000
- Uses ESM modules (`"type": "module"` in backend)
- Node.js version defined in package.json engines
- PostgreSQL via Docker Compose for development