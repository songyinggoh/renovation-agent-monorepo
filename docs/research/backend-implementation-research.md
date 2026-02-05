# Backend Implementation Research Document
**Project**: Renovation Agent Monorepo
**Date**: 2026-01-06
**Updated**: 2026-01-06
**Purpose**: Comprehensive research and code examples for backend setup following architecture specifications

---

## 🎯 Implementation Strategy

**CORE-FIRST APPROACH**: This document follows a phased implementation strategy:

1. **Phases 1-7** (Weeks 1-4): Build core functionality (database, services, LangChain agent, Socket.io) **without authentication or payments**
2. **Phase 8** (Week 5): Layer in Supabase Auth
3. **Phase 9** (Week 6): Add Stripe payment integration
4. **Phase 10** (Week 7): Deploy to production

**Why?** Get the AI agent working and testable quickly. Add security and monetization layers once core value is proven.

---

## Table of Contents
1. [Current Backend State Analysis](#current-backend-state-analysis)
2. [Architecture Requirements](#architecture-requirements)
3. [Database Schema Design](#database-schema-design)
4. [Technology Stack & Dependencies](#technology-stack--dependencies)
5. [Folder Structure Implementation](#folder-structure-implementation)
6. [Core Infrastructure Setup (Phases 1-6)](#core-infrastructure-setup-phases-1-6)
7. [Agent/LangChain Integration (Phase 4) ⭐](#agentlangchain-integration-phase-4-)
8. [Service Layer Patterns (Phase 3)](#service-layer-patterns-phase-3)
9. [Socket.io Real-time Chat (Phase 6) ⭐](#socketio-real-time-chat-phase-6-)
10. [Error Handling & Logging](#error-handling--logging)
11. [Testing Strategy](#testing-strategy)
12. [Authentication Layer (Phase 8) 🔐](#authentication-layer-phase-8-)
13. [Payment Integration (Phase 9) 💳](#payment-integration-phase-9-)
14. [Implementation Checklist](#implementation-checklist)

---

## 1. Current Backend State Analysis

### 1.1 Existing Infrastructure
The backend currently has a basic Express.js + TypeScript setup with the following components:

**✅ Already Implemented:**
- Basic Express server (`src/app.ts`)
- Error handling middleware (`src/middleware/errorHandler.ts`)
- Custom error classes (`src/utils/errors.ts`)
- Structured logger (`src/utils/logger.ts`)
- Drizzle ORM configuration (`src/db/index.ts`, `src/config/drizzle.config.ts`)
- Async handler utility (`src/utils/async.ts`)
- DTO validation middleware (`src/middleware/validation/validate-dto.middleware.ts`)
- Basic user routes (example/boilerplate)

**🎯 High Priority (Phases 1-6):**
- Complete database schema (users, sessions, rooms, products, contractors, etc.)
- Socket.io setup for real-time communication ⭐
- LangChain v1 agent runtime ⭐
- Agent tools and middleware ⭐
- Domain services (intake, product, render, contractor, PDF)
- Phase-aware routing and state management
- WebSocket event handlers
- Complete API routes structure

**⏳ Lower Priority (Phases 8-9):**
- Supabase Auth integration (Phase 8)
- Stripe payment integration (Phase 9)

### 1.2 Current File Structure
```
backend/
├── src/
│   ├── app.ts                          # ✅ Basic Express setup
│   ├── config/
│   │   └── drizzle.config.ts           # ✅ Drizzle configuration
│   ├── db/
│   │   ├── index.ts                    # ✅ Database connection
│   │   ├── migrate.ts                  # ✅ Migration runner
│   │   ├── supabase-adapter.ts         # ✅ Supabase adapter
│   │   └── supabase-client.ts          # ✅ Supabase client
│   ├── middleware/
│   │   ├── errorHandler.ts             # ✅ Error handler
│   │   └── validation/
│   │       └── validate-dto.middleware.ts # ✅ DTO validation
│   ├── utils/
│   │   ├── async.ts                    # ✅ Async wrapper
│   │   ├── config.ts                   # ✅ Config utilities
│   │   ├── errors.ts                   # ✅ Custom errors
│   │   ├── logger.ts                   # ✅ Structured logger
│   │   └── http-errors.ts              # ✅ HTTP error utilities
│   └── [boilerplate user files]        # ⚠️ To be replaced/removed
└── package.json                        # ⚠️ Needs major updates
```

---

## 2. Architecture Requirements

### 2.1 System Architecture Overview

**Core Tech Stack (Phases 1-7):**
- **Runtime**: Node.js/TypeScript on Backend Container (GHCR)
- **Framework**: Express.js with Socket.io
- **Database**: Supabase Postgres with Drizzle ORM
- **AI/ML**:
  - LangChain v1 (agent framework) ⭐ PRIORITY
  - Google Gemini 2.5 Flash (chat + vision) ⭐ PRIORITY
  - Nano Banana (image generation)
- **Storage**:
  - Supabase Storage (user uploads, PDFs)
  - Supabase Storage (style images, renders)
- **Real-time**: Socket.io for streaming responses ⭐ PRIORITY

**Security & Monetization (Phases 8-9):**
- **Auth**: Supabase Auth (Google OAuth) - Phase 8
- **Payments**: Stripe (Checkout & Subscriptions) - Phase 9

### 2.2 Key Components

```
┌─────────────────────────────────────────────────────────┐
│               Next.js Frontend (Vercel)                 │
│        - Chat UI                                        │
│        - Dashboard                                      │
│        - Authentication (Phase 8)                       │
└────────────────┬────────────────────────────────────────┘
                 │ HTTP + WebSocket
                 │ (No auth required in Phases 1-7)
                 ▼
┌─────────────────────────────────────────────────────────┐
│           Backend Container (GHCR) Backend (This Project)              │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Express + Socket.io Gateway                    │   │
│  │  - REST API Routes (open access initially)     │   │
│  │  - WebSocket Event Handlers (open initially)   │   │
│  └─────────────────────┬───────────────────────────┘   │
│                        │                                │
│  ┌─────────────────────▼───────────────────────────┐   │
│  │  LangChain Agent Runtime ⭐ PHASE 4             │   │
│  │  - Coordinator Chain (phase routing)            │   │
│  │  - Phase-specific Chains                        │   │
│  │  - Tools (products, renders, contractors)       │   │
│  │  - Middleware (state, prompts, guardrails)      │   │
│  └─────────────────────┬───────────────────────────┘   │
│                        │                                │
│  ┌─────────────────────▼───────────────────────────┐   │
│  │  Domain Services (Phase 3)                      │   │
│  │  - IntakeService                                │   │
│  │  - ProductService                               │   │
│  │  - RenderService                                │   │
│  │  - ContractorService                            │   │
│  │  - ReportService (PDF)                          │   │
│  │  - BillingService (Phase 9)                     │   │
│  └─────────────────────┬───────────────────────────┘   │
└────────────────────────┼─────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Supabase    │ │   Stripe     │ │  Gemini API  │
│  Postgres    │ │  (Phase 9)   │ │  + Storage   │
│  + Storage   │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘
```

### 2.3 User Flow & Phase Management

**Application Phases:**
1. **INTAKE** - Upload photos, select styles, set budget
2. **CHECKLIST** - AI suggests items, user selects preferences
3. **PLAN** - AI creates BOM with Taobao products
4. **RENDER** - Generate room visualizations
5. **PAYMENT** - Stripe checkout gate (Phase 9)
6. **COMPLETE** - Deliver PDF report
7. **ITERATE** - Refinements and tweaks

**Phase State Storage:**
- `renovation_sessions.phase` (current phase)
- LangChain checkpointer (conversation history)
- LangGraph Store (long-term preferences)

---

## 3. Database Schema Design

### 3.1 Core Tables (Drizzle Schema)

**File**: `src/db/schema/users.ts`
```typescript
import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

// Simple user profiles (no auth required initially)
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name'),
  email: text('email'), // Can be optional initially
  avatarUrl: text('avatar_url'),
  stripeCustomerId: text('stripe_customer_id'), // For Phase 9
  defaultCurrency: text('default_currency').default('USD'),
  onboardingCompleted: boolean('onboarding_completed').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Subscriptions table (for Phase 9)
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  planCode: text('plan_code').notNull(), // e.g., 'FREE', 'PRO_MONTHLY'
  status: text('status').notNull(), // 'active', 'canceled', 'past_due'
  currentPeriodEnd: timestamp('current_period_end'),
  remainingCredits: integer('remaining_credits').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
```

**File**: `src/db/schema/sessions.ts`
```typescript
import { pgTable, uuid, text, timestamp, numeric, boolean, jsonb } from 'drizzle-orm/pg-core';
import { profiles } from './users';

export const renovationSessions = pgTable('renovation_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }), // Nullable initially
  title: text('title').notNull(),
  phase: text('phase').notNull().default('INTAKE'), // Phase enum
  totalBudget: numeric('total_budget', { precision: 10, scale: 2 }),
  currency: text('currency').default('USD'),
  isPaid: boolean('is_paid').default(false), // For Phase 9
  stripePaymentIntentId: text('stripe_payment_intent_id'), // For Phase 9
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => renovationSessions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  roomType: text('room_type').notNull(), // 'bedroom', 'living_room', 'kitchen'
  areaSqft: numeric('area_sqft', { precision: 8, scale: 2 }),
  style: text('style'), // 'wabi-sabi', 'japandi', 'brutalist'
  createdAt: timestamp('created_at').defaultNow(),
});

export const roomAssets = pgTable('room_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  assetType: text('asset_type').notNull(), // 'photo', 'floorplan', 'render'
  storagePath: text('storage_path').notNull(),
  source: text('source'), // 'user_upload', 'ai_generated'
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**File**: `src/db/schema/products.ts`
```typescript
import { pgTable, uuid, text, numeric, integer, timestamp } from 'drizzle-orm/pg-core';
import { rooms } from './sessions';

export const taobaoProducts = pgTable('taobao_products', {
  id: uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id').notNull().unique(),
  name: text('name').notNull(),
  styleTag: text('style_tag'), // 'wabi-sabi', 'japandi', etc.
  category: text('category').notNull(), // 'sofa', 'lighting', 'storage'
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('CNY'),
  rating: numeric('rating', { precision: 3, scale: 2 }),
  reviewsCount: integer('reviews_count').default(0),
  productUrl: text('product_url').notNull(),
  imageUrl: text('image_url'),
  lastSyncedAt: timestamp('last_synced_at').defaultNow(),
});

export const roomProductRecommendations = pgTable('room_product_recommendations', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').notNull().references(() => taobaoProducts.id),
  quantity: integer('quantity').default(1),
  totalPrice: numeric('total_price', { precision: 10, scale: 2 }),
  rationale: text('rationale'), // AI explanation for why this product was chosen
  createdAt: timestamp('created_at').defaultNow(),
});
```

**File**: `src/db/schema/messages.ts`
```typescript
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { renovationSessions, profiles } from './sessions';

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => renovationSessions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => profiles.id), // Nullable initially
  role: text('role').notNull(), // 'user', 'assistant', 'system', 'tool'
  content: text('content').notNull(),
  metadata: jsonb('metadata'), // Tool calls, images, etc.
  createdAt: timestamp('created_at').defaultNow(),
});

export const pdfReports = pgTable('pdf_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => renovationSessions.id, { onDelete: 'cascade' }),
  storagePath: text('storage_path').notNull(),
  status: text('status').notNull().default('pending'), // 'pending', 'generated', 'failed'
  createdAt: timestamp('created_at').defaultNow(),
});
```

**File**: `src/db/schema/contractors.ts`
```typescript
import { pgTable, uuid, text, numeric, integer, timestamp, jsonb, boolean } from 'drizzle-orm/pg-core';
import { renovationSessions } from './sessions';

export const contractors = pgTable('contractors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  location: text('location').notNull(),
  specialties: jsonb('specialties'), // ['kitchen', 'bathroom', 'full_renovation']
  budgetTier: text('budget_tier'), // 'budget', 'mid', 'premium'
  rating: numeric('rating', { precision: 3, scale: 2 }),
  reviewCount: integer('review_count').default(0),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  verified: boolean('verified').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const contractorLeads = pgTable('contractor_leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => renovationSessions.id),
  contractorId: uuid('contractor_id').notNull().references(() => contractors.id),
  status: text('status').default('pending'), // 'pending', 'contacted', 'declined'
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**File**: `src/db/schema/index.ts` (Barrel Export)
```typescript
export * from './users';
export * from './sessions';
export * from './products';
export * from './messages';
export * from './contractors';
```

### 3.2 Database Migrations

**File**: `drizzle.config.ts`
```typescript
import type { Config } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

export default {
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
} satisfies Config;
```

---

## 4. Technology Stack & Dependencies

### 4.1 Required NPM Packages

**File**: `backend/package.json` (Core Dependencies for Phases 1-7)
```json
{
  "name": "renovation-agent-backend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "lint": "eslint . --fix",
    "prep": "npm run lint && npm run build",
    "test:unit": "vitest run --config vitest.config.unit.ts",
    "test:integration": "vitest run --config vitest.config.integration.ts",
    "test:watch": "vitest watch"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.6.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.1",
    "drizzle-orm": "^0.29.3",
    "pg": "^8.11.3",
    "langchain": "^0.1.0",
    "@langchain/google-genai": "^0.0.8",
    "@langchain/langgraph": "^0.0.12",
    "@langchain/langgraph-checkpoint-postgres": "^0.0.3",
    "class-validator": "^0.14.1",
    "class-transformer": "^0.5.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.11.16",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/pg": "^8.11.0",
    "@typescript-eslint/eslint-plugin": "^6.21.0",
    "@typescript-eslint/parser": "^6.21.0",
    "drizzle-kit": "^0.20.10",
    "eslint": "^8.57.1",
    "tsx": "^4.19.2",
    "typescript": "^5.3.3",
    "vitest": "^1.2.0",
    "@vitest/coverage-v8": "^1.2.0",
    "testcontainers": "^10.5.0"
  }
}
```

**Note**: Add these packages in Phase 8-9:
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",  // Phase 8
    "stripe": "^14.14.0"                   // Phase 9
  }
}
```

### 4.2 Environment Variables

**File**: `backend/.env.example` (Phases 1-7)
```bash
# Server Configuration
NODE_ENV=development
PORT=3000

# Database (Supabase Postgres)
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# Google Gemini API (REQUIRED - Phase 1)
GOOGLE_API_KEY=[YOUR-GEMINI-KEY]

# Supabase Storage (for renders & style images)
Supabase Storage_PROJECT_ID=[YOUR-GCP-PROJECT]
Supabase Storage_BUCKET_NAME=renovation-renders
Supabase Storage_STYLE_BUCKET=renovation-styles

# Frontend URL (for CORS and redirects)
FRONTEND_URL=http://localhost:3001

# LangChain/LangSmith (optional, for debugging)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=[YOUR-LANGSMITH-KEY]
LANGCHAIN_PROJECT=renovation-agent

# ============================================
# PHASE 8: Authentication (add these later)
# ============================================
# NEXT_PUBLIC_SUPABASE_URL=https://[PROJECT-REF].supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=[ANON-KEY]
# SUPABASE_SERVICE_ROLE_KEY=[SERVICE-ROLE-KEY]

# ============================================
# PHASE 9: Payments (add these later)
# ============================================
# STRIPE_SECRET_KEY=sk_test_[YOUR-KEY]
# STRIPE_WEBHOOK_SECRET=whsec_[YOUR-SECRET]
# STRIPE_PUBLISHABLE_KEY=pk_test_[YOUR-KEY]
```

---

## 5. Folder Structure Implementation

### 5.1 Complete Backend Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── env.ts                      # Environment validation & export
│   │   └── gemini.ts                   # Google Gemini config (Phase 1)
│   │   # Add later:
│   │   # ├── supabase.ts               # Supabase server client (Phase 8)
│   │   # └── stripe.ts                 # Stripe client (Phase 9)
│   │
│   ├── db/
│   │   ├── schema/
│   │   │   ├── index.ts               # Barrel export
│   │   │   ├── users.ts               # User/profile schemas
│   │   │   ├── sessions.ts            # Renovation sessions & rooms
│   │   │   ├── products.ts            # Taobao products
│   │   │   ├── messages.ts            # Chat messages & PDFs
│   │   │   └── contractors.ts         # Contractor data
│   │   ├── index.ts                   # Database connection
│   │   ├── migrate.ts                 # Migration runner
│   │   └── seed.ts                    # Seed data (development)
│   │
│   ├── dtos/
│   │   ├── session.dto.ts             # Session DTOs
│   │   ├── chat.dto.ts                # Chat message DTOs
│   │   ├── product.dto.ts             # Product DTOs
│   │   └── contractor.dto.ts          # Contractor DTOs
│   │   # Add later:
│   │   # ├── auth.dto.ts              # Auth DTOs (Phase 8)
│   │   # └── payment.dto.ts           # Payment DTOs (Phase 9)
│   │
│   ├── models/
│   │   ├── user.model.ts              # User data access (basic)
│   │   ├── session.model.ts           # Session data access
│   │   ├── room.model.ts              # Room data access
│   │   ├── product.model.ts           # Product data access
│   │   ├── message.model.ts           # Message data access
│   │   └── contractor.model.ts        # Contractor data access
│   │
│   ├── services/
│   │   ├── chat.service.ts            # LangChain agent orchestration ⭐
│   │   ├── intake.service.ts          # Intake phase logic
│   │   ├── product.service.ts         # Product search & recommendations
│   │   ├── render.service.ts          # Image generation (Nano Banana)
│   │   ├── contractor.service.ts      # Contractor matching
│   │   ├── pdf.service.ts             # PDF report generation
│   │   └── file.service.ts            # Supabase Storage operations
│   │   # Add later:
│   │   # ├── auth.service.ts          # Supabase JWT verification (Phase 8)
│   │   # └── billing.service.ts       # Stripe integration (Phase 9)
│   │
│   ├── agents/                         # ⭐ PHASE 4 - CRITICAL
│   │   ├── coordinator.chain.ts       # Main agent coordinator
│   │   ├── intake.chain.ts            # Intake phase chain
│   │   ├── checklist.chain.ts         # Checklist phase chain
│   │   ├── planning.chain.ts          # Planning phase chain
│   │   ├── rendering.chain.ts         # Rendering phase chain
│   │   ├── iteration.chain.ts         # Iteration phase chain
│   │   ├── middleware/
│   │   │   ├── state.middleware.ts    # State extension
│   │   │   ├── phase-prompt.middleware.ts  # Phase-aware prompts
│   │   │   ├── guardrails.middleware.ts    # Safety & validation
│   │   │   └── summarization.middleware.ts # Memory management
│   │   └── tools/
│   │       ├── taobao.tool.ts         # Product search tool
│   │       ├── style.tool.ts          # Style examples tool
│   │       ├── render.tool.ts         # Image generation tool
│   │       ├── budget.tool.ts         # Budget validation tool
│   │       ├── contractor.tool.ts     # Contractor search tool
│   │       └── pdf.tool.ts            # PDF generation tool
│   │
│   ├── controllers/
│   │   ├── session.controller.ts      # Session CRUD (no auth initially)
│   │   ├── chat.controller.ts         # Chat endpoints (HTTP fallback)
│   │   └── health.controller.ts       # Health check
│   │   # Add later:
│   │   # ├── auth.controller.ts       # Auth endpoints (Phase 8)
│   │   # ├── payment.controller.ts    # Payment endpoints (Phase 9)
│   │   # └── webhook.controller.ts    # Stripe webhooks (Phase 9)
│   │
│   ├── routes/
│   │   ├── session.routes.ts          # Session routes
│   │   ├── chat.routes.ts             # Chat routes
│   │   └── index.ts                   # Route aggregator
│   │   # Add later:
│   │   # ├── auth.routes.ts           # Auth routes (Phase 8)
│   │   # ├── payment.routes.ts        # Payment routes (Phase 9)
│   │   # └── webhook.routes.ts        # Webhook routes (Phase 9)
│   │
│   ├── sockets/                        # ⭐ PHASE 6 - CRITICAL
│   │   └── chat.socket.ts             # Socket.io chat handlers (no auth initially)
│   │   # Add later:
│   │   # └── middleware/
│   │   #     └── auth.socket-middleware.ts  # Socket auth (Phase 8)
│   │
│   ├── middleware/
│   │   └── errorHandler.ts            # ✅ Already exists
│   │   # Add later:
│   │   # └── auth.middleware.ts       # Supabase JWT verification (Phase 8)
│   │
│   ├── utils/
│   │   ├── async.ts                   # ✅ Already exists
│   │   ├── config.ts                  # ✅ Already exists
│   │   ├── errors.ts                  # ✅ Already exists
│   │   ├── logger.ts                  # ✅ Already exists
│   │   └── validation.ts              # Zod/class-validator helpers
│   │
│   ├── app.ts                         # Express app setup (no auth middleware initially)
│   └── server.ts                      # Server entry point (with Socket.io)
│
├── drizzle/                           # Generated migrations
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── .env                               # Environment variables (gitignored)
├── .env.example                       # Example environment file
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── vitest.config.unit.ts
├── vitest.config.integration.ts
└── README.md
```

---

## 6. Core Infrastructure Setup (Phases 1-6)

### 6.1 Environment Configuration (Phase 1)

**File**: `src/config/env.ts`
```typescript
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Core schema (Phases 1-7) - Auth and Stripe optional
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  GOOGLE_API_KEY: z.string().min(1), // REQUIRED for Gemini
  FRONTEND_URL: z.string().url().default('http://localhost:3001'),
  Supabase Storage_BUCKET_NAME: z.string().optional(),
  LANGCHAIN_TRACING_V2: z.string().optional(),

  // Optional in Phases 1-7 (required in Phase 8)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Optional in Phases 1-7 (required in Phase 9)
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(e => e.path.join('.')).join(', ');
      throw new Error(`Missing or invalid environment variables: ${missingVars}`);
    }
    throw error;
  }
}

export const env = validateEnv();
```

### 6.2 Gemini API Configuration (Phase 1)

**File**: `src/config/gemini.ts`
```typescript
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { env } from './env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'GeminiConfig' });

export const createGeminiModel = (options?: {
  model?: string;
  temperature?: number;
}) => {
  const model = new ChatGoogleGenerativeAI({
    modelName: options?.model || 'gemini-2.5-flash',
    apiKey: env.GOOGLE_API_KEY,
    temperature: options?.temperature || 0.7,
  });

  logger.info('Gemini model created', {
    model: options?.model || 'gemini-2.5-flash',
  });

  return model;
};

// For image generation (Nano Banana)
export const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
```

### 6.3 Express App Setup (Phase 1)

**File**: `src/app.ts` (No auth middleware initially)
```typescript
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { Logger } from './utils/logger.js';

const logger = new Logger({ serviceName: 'App' });

export function createApp(): Application {
  const app: Application = express();

  // CORS configuration (open for testing in Phases 1-7)
  app.use(cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    });
  });

  // API routes (no auth required initially)
  app.use('/api', routes);

  // Error handling (must be last)
  app.use(errorHandler);

  logger.info('Express app configured (no auth in Phases 1-7)');

  return app;
}
```

### 6.4 Server Entry Point with Socket.io (Phase 1)

**File**: `src/server.ts`
```typescript
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { Logger } from './utils/logger.js';
import { setupChatSocket } from './sockets/chat.socket.js';

const logger = new Logger({ serviceName: 'Server' });

const app = createApp();
const httpServer = createServer(app);

// Socket.io setup (no auth required initially)
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: env.FRONTEND_URL,
    credentials: true,
  },
});

// Setup socket handlers (no auth in Phases 1-7)
setupChatSocket(io);

// Start server
const PORT = env.PORT;
httpServer.listen(PORT, () => {
  logger.info('Server started (open access for testing)', {
    port: PORT,
    environment: env.NODE_ENV,
    frontendUrl: env.FRONTEND_URL,
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
```

---

## 7. Agent/LangChain Integration (Phase 4) ⭐

This is the **core functionality** of the application. Build this thoroughly before adding auth/payments.

### 7.1 Agent State Schema

**File**: `src/agents/schemas/state.schema.ts`
```typescript
import { z } from 'zod';

export const PhaseEnum = z.enum([
  'INTAKE',
  'CHECKLIST',
  'PLAN',
  'RENDER',
  'PAYMENT',
  'COMPLETE',
  'ITERATE',
]);

export type Phase = z.infer<typeof PhaseEnum>;

export const RoomStateSchema = z.object({
  roomId: z.string().uuid(),
  name: z.string(),
  roomType: z.string(),
  style: z.string().optional(),
  areaSqft: z.number().optional(),
});

export const RenovationStateSchema = z.object({
  phase: PhaseEnum,
  sessionId: z.string().uuid(),
  userId: z.string().uuid().optional(), // Optional until Phase 8
  rooms: z.array(RoomStateSchema).optional(),
  budget: z.number().optional(),
  currency: z.string().default('USD'),
  selectedStyles: z.array(z.string()).optional(),
});

export type RenovationState = z.infer<typeof RenovationStateSchema>;
```

### 7.2 Phase-Aware Prompt Middleware

**File**: `src/agents/middleware/phase-prompt.middleware.ts`
```typescript
import { createMiddleware } from 'langchain';
import { RenovationState } from '../schemas/state.schema.js';
import { Logger } from '../../utils/logger.js';

const logger = new Logger({ serviceName: 'PhasePromptMiddleware' });

const PHASE_PROMPTS = {
  INTAKE: `You are in the INTAKE phase of a home renovation planning session.

Your goal is to gather:
1. Room photos and floor plans from the user
2. Their preferred design styles (wabi-sabi, japandi, brutalist, scandinavian)
3. Their overall budget and currency

Ask clear, friendly questions. Guide them through the upload process. Don't rush - make sure you have complete information before moving to the next phase.`,

  CHECKLIST: `You are in the CHECKLIST phase.

Based on the rooms and styles provided, suggest a comprehensive list of furniture and decor items for each room. For example:
- Bedroom: bed frame, mattress, nightstands, dresser, lighting, curtains, rug
- Living room: sofa, coffee table, TV stand, accent chairs, floor lamp, artwork

Ask the user to mark which items are must-haves vs nice-to-haves. This will help you stay within budget.`,

  PLAN: `You are in the PLAN phase.

Using the Taobao product database:
1. Search for specific products that match their style preferences
2. Build a Bill of Materials (BOM) for each room
3. Ensure the total cost stays within their budget
4. Provide rationale for each product choice

Use the \`search_products\` and \`check_budget\` tools to make informed recommendations.`,

  RENDER: `You are in the RENDER phase.

Time to visualize the design! Use the \`generate_render\` tool to create photorealistic images of each room with the selected furniture and style.

You can either:
- Edit the user's uploaded photos to show the new design
- Generate new images from scratch based on descriptions

Make the renders beautiful and accurate to the plan.`,

  PAYMENT: `You are in the PAYMENT phase.

The design is ready! Explain to the user that to download the full PDF report with high-res renders, shopping links, and contractor recommendations, they need to complete payment.

Do NOT pressure them - just explain what they'll receive.`,

  COMPLETE: `You are in the COMPLETE phase.

The PDF report has been generated and delivered. Answer any questions about:
- The products recommended
- How to purchase items
- Contractor options
- Next steps

You can also help them iterate on the design if they want changes.`,

  ITERATE: `You are in the ITERATE phase.

The user wants to refine the design. Listen to their feedback:
- "Make the sofa darker"
- "Find cheaper lighting options"
- "Add more plants"

Use tools to update products, regenerate renders, and create an updated plan.`,
};

export const phasePromptMiddleware = createMiddleware({
  name: 'PhasePrompt',

  wrapModelCall: async (request, handler) => {
    const state = request.state as RenovationState;
    const phaseInstruction = PHASE_PROMPTS[state.phase];

    logger.debug('Injecting phase prompt', { phase: state.phase });

    return handler({
      ...request,
      messages: [
        { role: 'system', content: phaseInstruction },
        ...request.messages,
      ],
    });
  },
});
```

### 7.3 Agent Tools - Product Search

**File**: `src/agents/tools/taobao.tool.ts`
```typescript
import { tool } from 'langchain/tools';
import { z } from 'zod';
import { ProductService } from '../../services/product.service.js';
import { Logger } from '../../utils/logger.js';

const logger = new Logger({ serviceName: 'TaobaoTool' });
const productService = new ProductService();

export const searchProductsTool = tool(
  async ({ style, category, maxPrice, limit }) => {
    logger.info('Searching products', { style, category, maxPrice, limit });

    const products = await productService.searchProducts({
      style,
      category,
      maxPrice,
      limit: limit || 10,
    });

    return JSON.stringify(products, null, 2);
  },
  {
    name: 'search_products',
    description: 'Search the Taobao product database for furniture and decor items matching style, category, and budget constraints.',
    schema: z.object({
      style: z.string().describe('Design style: wabi-sabi, japandi, brutalist, or scandinavian'),
      category: z.string().describe('Product category: sofa, lighting, storage, bed, etc.'),
      maxPrice: z.number().describe('Maximum price in CNY'),
      limit: z.number().optional().describe('Max number of results (default 10)'),
    }),
  }
);
```

### 7.4 Main Agent Setup

**File**: `src/agents/coordinator.chain.ts`
```typescript
import { createAgent, summarizationMiddleware } from 'langchain';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool } from 'pg';
import { env } from '../config/env.js';
import { createGeminiModel } from '../config/gemini.js';
import { stateExtensionMiddleware } from './middleware/state.middleware.js';
import { phasePromptMiddleware } from './middleware/phase-prompt.middleware.js';
import { guardrailMiddleware } from './middleware/guardrails.middleware.js';
import { searchProductsTool } from './tools/taobao.tool.js';
import { checkBudgetTool } from './tools/budget.tool.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'CoordinatorAgent' });

// Setup checkpointer for conversation memory
const pool = new Pool({ connectionString: env.DATABASE_URL });
const checkpointer = PostgresSaver.fromConnString(env.DATABASE_URL);

export const renovationAgent = createAgent({
  model: createGeminiModel(),
  tools: [
    searchProductsTool,
    checkBudgetTool,
    // Add more tools as they're implemented
  ],
  middleware: [
    stateExtensionMiddleware,
    phasePromptMiddleware,
    summarizationMiddleware({
      model: createGeminiModel({ model: 'gemini-2.5-flash' }),
      trigger: [{ messages: 40 }],
      keep: { messages: 10 },
    }),
    guardrailMiddleware,
  ],
  checkpointer,
});

logger.info('Renovation agent initialized (no auth required)');
```

---

## 8. Service Layer Patterns (Phase 3)

### 8.1 Product Service Example

**File**: `src/services/product.service.ts`
```typescript
import { db } from '../db/index.js';
import { taobaoProducts, roomProductRecommendations } from '../db/schema/products.js';
import { eq, and, lte, like } from 'drizzle-orm';
import { AppError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'ProductService' });

export class ProductService {
  async searchProducts(params: {
    style?: string;
    category?: string;
    maxPrice?: number;
    limit?: number;
  }) {
    try {
      logger.info('Searching products', params);

      let query = db.select().from(taobaoProducts);

      // Apply filters
      const conditions = [];

      if (params.style) {
        conditions.push(eq(taobaoProducts.styleTag, params.style));
      }

      if (params.category) {
        conditions.push(like(taobaoProducts.category, `%${params.category}%`));
      }

      if (params.maxPrice) {
        conditions.push(lte(taobaoProducts.price, params.maxPrice.toString()));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      // Apply limit
      query = query.limit(params.limit || 10);

      const products = await query;

      logger.info('Products found', { count: products.length, params });

      return products;
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Product search failed', err, params);
      throw new AppError('Failed to search products', 500, { cause: err });
    }
  }

  async saveRecommendations(params: {
    roomId: string;
    productId: string;
    quantity: number;
    totalPrice: number;
    rationale?: string;
  }) {
    try {
      const [recommendation] = await db
        .insert(roomProductRecommendations)
        .values(params)
        .returning();

      logger.info('Product recommendation saved', {
        recommendationId: recommendation.id,
        roomId: params.roomId,
      });

      return recommendation;
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Failed to save recommendation', err, params);
      throw new AppError('Failed to save product recommendation', 500, { cause: err });
    }
  }
}
```

---

## 9. Socket.io Real-time Chat (Phase 6) ⭐

### 9.1 Chat Socket Handler (No Auth Initially)

**File**: `src/sockets/chat.socket.ts`
```typescript
import { Server as SocketIOServer, Socket } from 'socket.io';
import { ChatService } from '../services/chat.service.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'ChatSocket' });
const chatService = new ChatService();

export function setupChatSocket(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    logger.info('Socket connected (no auth required)', {
      socketId: socket.id,
    });

    // Join a session room
    socket.on('chat:join_session', async ({ sessionId }: { sessionId: string }) => {
      try {
        socket.join(sessionId);
        logger.info('User joined session', { socketId: socket.id, sessionId });

        socket.emit('chat:joined', { sessionId });
      } catch (error: unknown) {
        const err = error as Error;
        logger.error('Failed to join session', err, { socketId: socket.id, sessionId });
        socket.emit('chat:error', { message: 'Failed to join session' });
      }
    });

    // Handle user message
    socket.on('chat:user_message', async (data: {
      sessionId: string;
      message: string;
    }) => {
      try {
        logger.info('Processing user message', {
          socketId: socket.id,
          sessionId: data.sessionId,
        });

        // Stream agent response
        const stream = await chatService.processMessage({
          sessionId: data.sessionId,
          message: data.message,
          userId: undefined, // No auth in Phases 1-7
        });

        for await (const chunk of stream) {
          socket.emit('chat:assistant_token', { token: chunk });
        }

        socket.emit('chat:assistant_complete');
      } catch (error: unknown) {
        const err = error as Error;
        logger.error('Chat processing failed', err, {
          socketId: socket.id,
          sessionId: data.sessionId,
        });
        socket.emit('chat:error', { message: 'Failed to process message' });
      }
    });

    socket.on('disconnect', () => {
      logger.info('Socket disconnected', { socketId: socket.id });
    });
  });

  logger.info('Chat socket handlers initialized (no auth required)');
}
```

---

## 10. Error Handling & Logging

### 10.1 Enhanced Error Classes

**File**: `src/utils/errors.ts` (Keep existing + add new)
```typescript
// Keep existing AppError, NotFoundError, EscalationError

export class ValidationError extends AppError {
  constructor(message: string, public errors?: Record<string, string[]>) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ConflictError';
  }
}
```

---

## 11. Testing Strategy

### 11.1 Unit Test Example

**File**: `tests/unit/services/product.service.test.ts`
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductService } from '../../../src/services/product.service.js';

describe('ProductService', () => {
  let productService: ProductService;

  beforeEach(() => {
    productService = new ProductService();
  });

  describe('searchProducts', () => {
    it('should search products by style and category', async () => {
      // Given
      const params = {
        style: 'wabi-sabi',
        category: 'sofa',
        maxPrice: 5000,
      };

      // When
      const products = await productService.searchProducts(params);

      // Then
      expect(products).toBeDefined();
      expect(Array.isArray(products)).toBe(true);
    });
  });
});
```

---

## 12. Authentication Layer (Phase 8) 🔐

**⏰ IMPLEMENT THIS LATER** - After core agent functionality is working.

### 12.1 Supabase Client Configuration

**File**: `src/config/supabase.ts` (Phase 8)
```typescript
import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'SupabaseConfig' });

// Server-side client with service role key
export const supabaseAdmin = createClient(
  env.SUPABASE_URL!,
  env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

logger.info('Supabase admin client initialized');
```

### 12.2 Auth Middleware

**File**: `src/middleware/auth.middleware.ts` (Phase 8)
```typescript
import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'AuthMiddleware' });

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
      };
    }
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Missing or invalid authorization header', 401);
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify JWT using Supabase
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      logger.warn('Invalid token', { error: error?.message });
      throw new AppError('Invalid or expired token', 401);
    }

    // Attach user to request
    req.user = {
      id: data.user.id,
      email: data.user.email,
    };

    logger.debug('User authenticated', {
      userId: data.user.id,
      email: data.user.email,
    });

    next();
  } catch (error: unknown) {
    if (error instanceof AppError) {
      next(error);
    } else {
      const err = error as Error;
      logger.error('Auth middleware error', err);
      next(new AppError('Authentication failed', 401, { cause: err }));
    }
  }
}
```

**Note**: Add this middleware to routes in Phase 8:
```typescript
// In src/app.ts
import { authMiddleware } from './middleware/auth.middleware.js';

// Protect routes (Phase 8)
app.use('/api/sessions', authMiddleware, sessionRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
```

---

## 13. Payment Integration (Phase 9) 💳

**⏰ IMPLEMENT THIS LATER** - After authentication is working.

### 13.1 Stripe Configuration

**File**: `src/config/stripe.ts` (Phase 9)
```typescript
import Stripe from 'stripe';
import { env } from './env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'StripeConfig' });

export const stripe = new Stripe(env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true,
});

logger.info('Stripe client initialized');

// Product/Price IDs (should match your Stripe dashboard)
export const STRIPE_PRODUCTS = {
  SINGLE_REPORT: {
    priceId: 'price_xxx', // Replace with actual price ID
    amount: 2900, // $29.00
  },
  PRO_MONTHLY: {
    priceId: 'price_yyy',
    amount: 4900, // $49.00/month
  },
} as const;
```

### 13.2 Billing Service

**File**: `src/services/billing.service.ts` (Phase 9)
```typescript
import { stripe, STRIPE_PRODUCTS } from '../config/stripe.js';
import { AppError } from '../utils/errors.js';
import { Logger } from '../utils/logger.js';
import { db } from '../db/index.js';
import { profiles, subscriptions } from '../db/schema/users.js';
import { renovationSessions } from '../db/schema/sessions.js';
import { eq } from 'drizzle-orm';

const logger = new Logger({ serviceName: 'BillingService' });

export class BillingService {
  /**
   * Create Stripe Checkout session for one-time payment
   */
  async createCheckoutSession(params: {
    userId: string;
    sessionId: string;
    mode: 'payment' | 'subscription';
    priceId: string;
  }) {
    try {
      logger.info('Creating Stripe checkout session', params);

      // Get or create Stripe customer
      const [profile] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, params.userId));

      if (!profile) {
        throw new AppError('User profile not found', 404);
      }

      let customerId = profile.stripeCustomerId;

      if (!customerId) {
        // Create Stripe customer
        const customer = await stripe.customers.create({
          email: profile.email || undefined,
          metadata: {
            supabase_user_id: params.userId,
          },
        });

        customerId = customer.id;

        // Save customer ID
        await db
          .update(profiles)
          .set({ stripeCustomerId: customerId })
          .where(eq(profiles.id, params.userId));

        logger.info('Stripe customer created', { customerId, userId: params.userId });
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: params.mode,
        payment_method_types: ['card'],
        line_items: [
          {
            price: params.priceId,
            quantity: 1,
          },
        ],
        success_url: `${process.env.FRONTEND_URL}/dashboard/sessions/${params.sessionId}?payment=success`,
        cancel_url: `${process.env.FRONTEND_URL}/dashboard/sessions/${params.sessionId}?payment=canceled`,
        metadata: {
          supabase_user_id: params.userId,
          renovation_session_id: params.sessionId,
        },
      });

      logger.info('Checkout session created', {
        checkoutSessionId: session.id,
        userId: params.userId,
      });

      return {
        url: session.url,
        sessionId: session.id,
      };
    } catch (error: unknown) {
      const err = error as Error;
      logger.error('Failed to create checkout session', err, params);
      throw new AppError('Checkout session creation failed', 500, { cause: err });
    }
  }
}
```

---

## 14. Implementation Checklist

### Phase 1: Database & Core Setup ✅
- [ ] Update `package.json` with core dependencies (no Stripe/Supabase Auth)
- [ ] Create `.env.example` (mark auth/stripe optional)
- [ ] Implement `src/config/env.ts` (Gemini required, auth/stripe optional)
- [ ] Create database schema files
- [ ] Generate and run Drizzle migrations
- [ ] Implement `src/config/gemini.ts`
- [ ] Setup database connection
- [ ] Update `src/app.ts` (no auth middleware)
- [ ] Create `src/server.ts` with Socket.io (no auth)

### Phase 2: Database Models & DTOs
- [ ] Create all DTO files with Zod validation
- [ ] Implement all model files
- [ ] Write unit tests for models
- [ ] Write integration tests with Testcontainers

### Phase 3: Domain Services
- [ ] Implement ProductService
- [ ] Implement ContractorService
- [ ] Implement FileService
- [ ] Implement PDFService
- [ ] Implement RenderService
- [ ] Implement IntakeService
- [ ] Write unit tests for all services

### Phase 4: LangChain Agent Setup ⭐ CRITICAL
- [ ] Define agent state schemas
- [ ] Implement state extension middleware
- [ ] Implement phase-aware prompt middleware
- [ ] Implement guardrails middleware
- [ ] Create all agent tools
- [ ] Setup PostgresSaver for memory
- [ ] Create coordinator agent
- [ ] Implement ChatService
- [ ] Test agent thoroughly

### Phase 5: API Routes & Controllers (No Auth)
- [ ] Implement session controller (no auth check)
- [ ] Implement chat controller
- [ ] Create all routes (open access)
- [ ] Write controller tests
- [ ] Write integration tests

### Phase 6: Socket.io Integration ⭐ CRITICAL
- [ ] Implement chat socket handlers (no auth)
- [ ] Test streaming responses
- [ ] Test with multiple concurrent users
- [ ] Build simple test UI (optional)

### Phase 7: Testing & QA
- [ ] Achieve >80% test coverage
- [ ] Run linter and fix issues
- [ ] Write E2E test for full agent flow
- [ ] Performance test agent
- [ ] Security audit (SQL injection, XSS)

### Phase 8: Authentication 🔐 (Week 5)
- [ ] Install Supabase packages
- [ ] Implement `src/config/supabase.ts`
- [ ] Update env.ts to require Supabase vars
- [ ] Implement auth middleware
- [ ] Implement socket auth middleware
- [ ] Add auth to all routes
- [ ] Update all tests with auth tokens

### Phase 9: Payment Integration 💳 (Week 6)
- [ ] Install Stripe package
- [ ] Implement `src/config/stripe.ts`
- [ ] Update env.ts to require Stripe vars
- [ ] Implement BillingService
- [ ] Create payment controllers and routes
- [ ] Implement webhook handler
- [ ] Add payment gate to PDF generation
- [ ] Test with Stripe CLI

### Phase 10: Deployment (Week 7)
- [ ] Create Dockerfile
- [ ] Setup Backend Container (GHCR) service
- [ ] Configure production environment
- [ ] Deploy and test
- [ ] Write documentation

---

## Conclusion

This research document provides a comprehensive blueprint for implementing the backend with a **core-first approach**:

1. **Weeks 1-3**: Build the AI agent and chat functionality (Phases 1-6)
2. **Week 4**: Test and polish core features (Phase 7)
3. **Week 5**: Layer in authentication (Phase 8)
4. **Week 6**: Add payment integration (Phase 9)
5. **Week 7**: Deploy to production (Phase 10)

**Benefits**:
- ✅ Faster validation of core value proposition
- ✅ Easier debugging without auth complexity
- ✅ Flexible to change auth/payment providers
- ✅ Team can focus on innovation first

**Next Steps:**
1. Begin Phase 1 (Database & Core Setup)
2. Focus on Phase 4 (LangChain Agent) - this is the heart
3. Get Phase 6 (Socket.io) working for real-time chat
4. Test thoroughly before adding auth/payments

**Status**: ✅ Ready to begin core implementation
**Strategy**: 🎯 Core functionality first, security & monetization later
**Last Updated**: 2026-01-06
