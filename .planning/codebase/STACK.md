# Technology Stack

**Analysis Date:** 2026-02-09

## Languages

**Primary:**
- TypeScript 5.3+ (backend) / 5.9+ (frontend) - Strict mode enabled across both applications

**Secondary:**
- JavaScript (ESM) - Limited to configuration files (eslint.config.js, vitest.config.ts)

## Runtime

**Environment:**
- Node.js 20+ (indicated by @types/node version)

**Package Manager:**
- pnpm 10.29.1 (workspace-based monorepo)
- Lockfile: pnpm-lock.yaml (present)

## Frameworks

**Core:**
- Next.js 16.1.6 (App Router) - Frontend application, runs on port 3001
- Express.js 4.22.1 (ESM modules) - Backend API, runs on port 3000
- React 19.2.4 - UI library with Server Components support

**AI/LangChain:**
- LangChain 1.2.7 - Core LangChain library
- @langchain/core 1.1.12 - LangChain core abstractions
- @langchain/google-genai 2.1.12 - Gemini AI integration
- @langchain/langgraph 1.0.13 - ReAct agent graph execution
- @langchain/langgraph-checkpoint-postgres 1.0.0 - Conversation persistence
- @google/generative-ai 0.24.1 - Direct Gemini API client

**Testing:**
- Vitest 3.0.5 (backend), 4.0.18 (frontend) - Unit and integration tests
- @vitest/coverage-v8 3.0.5 - Code coverage reporting
- @testing-library/react 16.3.2 - Component testing (frontend)
- testcontainers 11.11.0 - Docker-based integration tests (backend)

**Build/Dev:**
- tsx 4.19.2 - TypeScript execution and hot reload (backend dev)
- TypeScript 5.3.3 (backend) / 5.9.3 (frontend) - Compilation
- postcss 8.5.6 + autoprefixer 10.4.24 - CSS processing
- Tailwind CSS 3.4.19 - Utility-first styling
- concurrently 8.2.2 - Parallel script execution (root)

## Key Dependencies

**Critical:**
- Drizzle ORM 0.38.3 + drizzle-kit 0.31.8 - Type-safe PostgreSQL ORM with schema migrations
- Socket.io 4.8.1 (server) / socket.io-client 4.8.3 (client) - Real-time WebSocket communication for chat streaming
- @supabase/supabase-js 2.90.1 (backend), 2.94.1 (frontend) - Authentication and storage
- @supabase/ssr 0.8.0 - Server-side rendering support for Supabase (frontend)
- pg 8.13.1 - PostgreSQL driver for Drizzle

**Infrastructure:**
- Zod 3.24.1 (backend), 4.3.6 (frontend) - Runtime schema validation and type safety
- cors 2.8.5 - CORS middleware for Express
- dotenv 16.4.1 - Environment variable management
- class-transformer 0.5.1 + class-validator 0.14.1 - Data validation and transformation

**UI Components (Frontend):**
- @radix-ui/* packages - Headless UI primitives (dialog, separator, slot)
- class-variance-authority 0.7.1 - CVA for component variants (shadcn/ui pattern)
- clsx 2.1.1 + tailwind-merge 3.4.0 - Class name utilities
- lucide-react 0.542.0 - Icon library
- next-themes 0.4.6 - Dark mode support

**Data Fetching & Forms (Frontend):**
- @tanstack/react-query 5.90.20 - Server state management
- @tanstack/react-query-devtools 5.91.3 - Query debugging
- react-hook-form 7.71.1 + @hookform/resolvers 5.2.2 - Form management
- react-hot-toast 2.6.0 - Toast notifications

**File Upload (Frontend):**
- browser-image-compression 2.0.2 - Client-side image optimization
- react-dropzone 14.4.0 - Drag-and-drop file upload

**Payments (Optional - Phase 9):**
- stripe 18.5.0 - Stripe payment integration (frontend)

## Configuration

**Environment:**
- Zod-validated env schema (`backend/src/config/env.ts`)
- Required: NODE_ENV, PORT, DATABASE_URL, GOOGLE_API_KEY, FRONTEND_URL
- Optional (Phase 8+): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
- Optional (Phase 9+): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- Optional: LANGGRAPH_CHECKPOINTER (memory | postgres), SUPABASE_STORAGE_BUCKET

**Build:**
- `backend/tsconfig.json` - target: ESNext, module: NodeNext, strict: true
- `frontend/tsconfig.json` - target: ES2017, module: esnext, moduleResolution: bundler, strict: true
- `frontend/next.config.js` - Next.js configuration
- `frontend/tailwind.config.ts` - Tailwind CSS with custom design tokens
- `backend/drizzle.config.ts` - Drizzle migration configuration
- `vitest.config.ts` - Test configuration (80% coverage thresholds)

## Platform Requirements

**Development:**
- Node.js 20+
- PostgreSQL 15+ (via Docker Compose or local)
- pnpm 10.29.1+
- Google Gemini API key (GOOGLE_API_KEY)
- Optional: Supabase project (for auth/storage features)

**Production:**
- Docker Compose deployment (includes PostgreSQL, frontend, backend, Redis)
- Container-ready (TLS termination at reverse proxy / load balancer)
- Exposes ports: 3001 (frontend), 3000 (backend), 5432 (postgres), 6379 (redis)
- Environment: PostgreSQL database, Gemini API access

---

*Stack analysis: 2026-02-09*
