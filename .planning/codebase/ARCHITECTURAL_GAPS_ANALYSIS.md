# Architectural Gaps Analysis - Renovation Agent SaaS

**Analysis Date:** 2026-02-13
**Analyzed By:** System Architecture Specialist
**Project Phase:** Phase 2.1 (File Upload Pipeline) Complete

---

## Executive Summary

This analysis identifies 32 critical architectural gaps across 6 infrastructure domains for a production-ready AI-powered renovation planning SaaS. The system currently has:
- **Strong foundation**: Next.js 15 + Express, Drizzle ORM, LangChain ReAct agent, Socket.io streaming
- **Development-grade infrastructure**: Custom JSON logger, in-memory rate limiting, optional auth
- **Missing production essentials**: Error tracking, job queue, caching, observability stack, transactional email

**Critical Path for Production**: Phases 3-4 require job queue (renders/PDFs), error tracking, and caching before deployment.

---

## Cost Summary (Production Ready for 10k Users)

### Free Tier Services ($0/month)
- Sentry: 5k errors/month
- Resend: 3k emails/month
- Better Uptime: 10 monitors
- PostHog: 1M events/month
- LangSmith: 5k traces/month
- Redis (self-hosted), BullMQ, Supabase pgvector

### Paid Tier ($135/month)
- Sentry: $26/mo (50k events)
- Resend: $20/mo (50k emails)
- Better Uptime: $18/mo (50 monitors)
- Axiom: $25/mo (1TB logs)
- LangSmith: $39/mo (50k traces)
- Railway (staging): $7/mo

---

## 1. Missing Infrastructure

### 1.1 Job Queue / Background Processing ⭐ CRITICAL

**Status:** MISSING (Phase 3 blocker)

**Why It Matters:**
- Phase 3: AI image generation takes 10-60s per render (Express timeouts)
- Phase 3: PDF generation takes 2-5 minutes (Socket.io not designed for this)
- Current risk: Timeouts, memory leaks, poor UX

**Solution: BullMQ (Redis-based job queue)**

**Architecture:**
```
User Request → Express POST /api/renders
                    ↓
              Enqueue Job → BullMQ (Redis)
                    ↓
              Return 202 Accepted + job_id
                    ↓
         Worker Process (polls Redis)
                    ↓
    Gemini Vision API (10-60s) → Render image
                    ↓
         Supabase Storage Upload
                    ↓
         Database Update (status: ready)
                    ↓
         Socket.io emit → Frontend notification
```

**Implementation:**
```typescript
// backend/src/services/render-queue.service.ts
import { Queue, Worker } from 'bullmq';

const renderQueue = new Queue('room-renders', {
  connection: { host: 'localhost', port: 6379 }
});

// Enqueue job
await renderQueue.add('generate-render', {
  sessionId, roomId, stylePrompt, userId
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 }
});

// Worker (separate process)
const worker = new Worker('room-renders', async (job) => {
  const renderUrl = await generateRoomRender(job.data.stylePrompt);
  await db.update(roomAssets).set({ status: 'ready', url: renderUrl });
  io.to(`session:${sessionId}`).emit('render:complete', { renderUrl });
});
```

**Priority:** CRITICAL | **Phase:** 3 | **Cost:** Free (open source)

---

### 1.2 Caching Strategy (Redis) ⭐ HIGH

**Status:** Redis in docker-compose but unused

**Why It Matters:**
- Message history: DB query on EVERY user message (50-200ms waste)
- Style catalog: Same styles queried repeatedly
- Cost: Unnecessary DB load, slower response times

**Solution: Redis with 2-tier cache (Memory + Redis)**

```typescript
// backend/src/utils/cache.ts
import Redis from 'ioredis';
import NodeCache from 'node-cache';

const redis = new Redis(process.env.REDIS_URL);
const memoryCache = new NodeCache({ stdTTL: 300 });

export async function getWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 3600
): Promise<T> {
  // L1: Memory cache
  const memCached = memoryCache.get<T>(key);
  if (memCached) return memCached;

  // L2: Redis cache
  const redisCached = await redis.get(key);
  if (redisCached) {
    const parsed = JSON.parse(redisCached) as T;
    memoryCache.set(key, parsed);
    return parsed;
  }

  // L3: Database
  const fresh = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(fresh));
  memoryCache.set(key, fresh);
  return fresh;
}

// Usage:
const messages = await getWithCache(
  `messages:${sessionId}:recent`,
  () => messageService.getRecentMessages(sessionId, 20),
  300
);
```

**Priority:** HIGH | **Phase:** 3 | **Cost:** Free (existing Redis)

---

### 1.3 CDN / Image Optimization

**Status:** MISSING

**Why It Matters:**
- Phase 3: AI renders stored unoptimized (5-10MB each)
- User uploads: Full-resolution photos (slow page loads)

**Solution: Supabase Image Transformations + Vercel**

```typescript
// Supabase provides on-the-fly image transformations (free)
export function getOptimizedImageUrl(path: string, width = 800, quality = 80): string {
  return `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/${path}?width=${width}&quality=${quality}`;
}

// Next.js Image component (already optimized by Vercel)
<Image
  src={getOptimizedImageUrl(assetPath, 800)}
  width={800}
  height={600}
  alt="Room render"
/>
```

**Priority:** MEDIUM | **Phase:** 3 | **Cost:** Free

---

### 1.4 Database Connection Pooling (PgBouncer)

**Status:** Default pg pool (no explicit limits)

**Why It Matters:**
- Supabase free tier: 100 connections max
- 10 backend instances = 100 connections exhausted
- Risk: "too many connections" errors

**Solution: PgBouncer + Supabase Pooler**

```typescript
// Use Supabase's built-in pooler (transaction mode)
// .env.production
DATABASE_URL=postgresql://postgres:[password]@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true

// backend/src/db/index.ts
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 20, // Max connections per instance
  idleTimeoutMillis: 30000,
});
```

**Priority:** HIGH | **Phase:** 3-4 | **Cost:** Free (Supabase includes pooler)

---

## 2. Missing Observability Stack

### 2.1 Error Tracking ⭐ CRITICAL

**Status:** MISSING (only console.log JSON)

**Why It Matters:**
- No error aggregation or alerting
- Production errors go unnoticed until user reports
- AI errors (Gemini failures, tool errors) need immediate attention

**Solution: Sentry (Error Tracking + APM)**

```typescript
// backend/src/config/sentry.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  tracesSampleRate: 0.1,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app }),
  ],
});

// Express middleware
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());
// ... routes ...
app.use(Sentry.Handlers.errorHandler());

// Usage:
try {
  await chatService.processMessage(sessionId, message, callback);
} catch (error) {
  Sentry.captureException(error, {
    tags: { sessionId, phase },
  });
  throw error;
}
```

**LangChain Integration:**
```typescript
class SentryLangChainHandler extends CallbackHandler {
  async handleLLMError(error: Error) {
    Sentry.captureException(error, {
      tags: { component: 'langchain', type: 'llm_error' },
    });
  }
}
```

**Priority:** CRITICAL | **Phase:** 2.2-3 | **Cost:** Free (5k errors/mo), $26/mo for 50k

---

### 2.2 APM / Distributed Tracing

**Status:** MISSING

**Why It Matters:**
- Multi-service architecture: Express → Socket.io → LangChain → Gemini → PostgreSQL
- Can't identify which service is slow
- No visibility into AI response times

**Solution: Sentry Performance Monitoring (included with Sentry)**

```typescript
import { startSpan } from '@sentry/node';

async function processWithTracing(sessionId: string, message: string) {
  return await startSpan(
    { name: 'chat.process_message', op: 'ai.chat' },
    async (span) => {
      span?.setData('sessionId', sessionId);

      const result = await startSpan(
        { name: 'gemini.generate', op: 'ai.llm' },
        async () => await model.invoke(messages)
      );

      return result;
    }
  );
}
```

**Priority:** MEDIUM | **Phase:** 3 | **Cost:** Included with Sentry

---

### 2.3 Log Aggregation

**Status:** Custom JSON logger (console only)

**Why It Matters:**
- Distributed logs across multiple instances
- No search capability
- Container logs lost on restart

**Solution: Axiom (Serverless Log Aggregation)**

```typescript
// backend/src/utils/logger.ts
import { Axiom } from '@axiomhq/axiom-node';

const axiom = env.AXIOM_TOKEN ? new Axiom({ token: env.AXIOM_TOKEN }) : null;

export class Logger {
  private log(level: LogLevel, message: string, error?: Error, metadata?: LogMetadata) {
    const logObject = { timestamp: new Date().toISOString(), level, message, ...metadata };
    console.log(JSON.stringify(logObject)); // Keep for local dev

    // Ship to Axiom (async, non-blocking)
    if (axiom) {
      axiom.ingest('renovation-agent', [logObject]).catch(console.error);
    }
  }
}
```

**Priority:** LOW | **Phase:** 4+ | **Cost:** Free (500GB/mo), $25/mo for 1TB

---

### 2.4 Uptime Monitoring

**Status:** MISSING

**Why It Matters:**
- Health endpoints exist but no external monitoring
- No alerting when service is down

**Solution: Better Uptime**

```yaml
Monitors:
  1. Frontend: https://yourapp.vercel.app (expect 200)
  2. Backend Health: https://api.yourapp.com/health (expect 200)
  3. Backend Readiness: https://api.yourapp.com/health/ready (checks DB)
  4. WebSocket: wss://api.yourapp.com

Alert Channels:
  - Email: team@yourapp.com
  - Slack: #alerts
```

**Priority:** MEDIUM | **Phase:** 3 | **Cost:** Free (10 monitors), $18/mo for 50

---

### 2.5 AI-Specific Observability (LangSmith)

**Status:** MISSING

**Why It Matters:**
- No visibility into exact prompts sent to Gemini
- Can't track token usage/costs
- Hard to debug tool call failures

**Solution: LangSmith (LangChain official observability)**

```typescript
// Enable in production (backend/src/server.ts)
if (env.LANGCHAIN_TRACING_V2 === 'true') {
  process.env.LANGCHAIN_TRACING_V2 = 'true';
  process.env.LANGCHAIN_API_KEY = env.LANGCHAIN_API_KEY;
  process.env.LANGCHAIN_PROJECT = 'renovation-agent';
}

// Automatic tracing (no code changes needed)
// LangChain sends telemetry to LangSmith on every model.invoke() and tool execution
```

**Priority:** MEDIUM | **Phase:** 3 | **Cost:** Free (5k traces/mo), $39/mo for 50k

---

## 3. Missing Communication Layer

### 3.1 Transactional Email ⭐ HIGH

**Status:** MISSING

**Why It Matters:**
- Phase 3: No email when render is ready
- Phase 4: Payment receipts, invoice emails
- Phase 8: Welcome emails, password reset branding

**Solution: Resend (Modern Transactional Email)**

```typescript
// backend/src/services/email.service.ts
import { Resend } from 'resend';
import { RenderCompleteEmail } from '../emails/render-complete.js';

const resend = new Resend(env.RESEND_API_KEY);

export class EmailService {
  async sendRenderCompleteNotification(to: string, renderUrl: string, roomName: string) {
    await resend.emails.send({
      from: 'Renovation Agent <noreply@yourapp.com>',
      to,
      subject: `Your ${roomName} render is ready!`,
      react: RenderCompleteEmail({ renderUrl, roomName }),
    });
  }
}

// Email template (backend/src/emails/render-complete.tsx)
export function RenderCompleteEmail({ renderUrl, roomName }) {
  return (
    <Html>
      <Body>
        <Heading>Your {roomName} render is ready!</Heading>
        <Img src={renderUrl} alt={roomName} width="600" />
        <Link href={renderUrl}>View Full Render</Link>
      </Body>
    </Html>
  );
}
```

**Priority:** HIGH | **Phase:** 3 | **Cost:** Free (3k emails/mo), $20/mo for 50k

---

### 3.2 In-App Notifications

**Status:** Socket.io events only (ephemeral)

**Why It Matters:**
- Offline users miss notifications (browser closed during render)
- No persistent notification inbox

**Solution: Database-backed notifications + Socket.io**

```typescript
// backend/src/db/schema/notifications.schema.ts
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull(), // 'render_complete' | 'payment_success'
  title: text('title').notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// backend/src/services/notification.service.ts
export class NotificationService {
  async create(userId: string, type: string, title: string, message: string) {
    const [notification] = await db.insert(notifications).values({ userId, type, title, message }).returning();
    io.to(`user:${userId}`).emit('notification:new', notification);
    return notification;
  }
}
```

**Priority:** LOW | **Phase:** 4+ | **Cost:** Free (existing PostgreSQL)

---

## 4. Missing Security Layers

### 4.1 Rate Limiting (Distributed) ⭐ HIGH

**Status:** PostgreSQL (HTTP) + In-memory (Socket.io)

**Issues:**
- Socket.io rate limits NOT shared across instances
- PostgreSQL adds DB load

**Solution: Redis-backed rate limiting**

```typescript
// backend/src/middleware/socket-rate-limit.middleware.ts
import { RateLimiterRedis } from 'rate-limiter-flexible';

const socketRateLimiter = new RateLimiterRedis({
  storeClient: redis,
  points: 20,
  duration: 60,
});

export async function socketRateLimitMiddleware(socket: Socket, next: (err?: Error) => void) {
  try {
    await socketRateLimiter.consume(socket.handshake.address);
    next();
  } catch (error) {
    socket.emit('chat:error', { error: 'Rate limit exceeded' });
    socket.disconnect();
  }
}
```

**Priority:** HIGH | **Phase:** 3 | **Cost:** Free (existing Redis)

---

### 4.2 CSRF Protection

**Status:** MISSING

**Why It Matters:**
- Phase 8+: When auth is enforced, CSRF becomes critical
- Supabase Auth uses httpOnly cookies (vulnerable)

**Solution: csurf middleware**

```typescript
import csrf from 'csurf';

export const csrfProtection = csrf({
  cookie: { httpOnly: true, secure: true, sameSite: 'strict' }
});

app.use(csrfProtection);

// Frontend includes CSRF token in requests
const { csrfToken } = await fetch('/api/csrf-token').then(r => r.json());
fetch('/api/sessions', {
  headers: { 'X-CSRF-Token': csrfToken }
});
```

**Priority:** MEDIUM | **Phase:** 8 | **Cost:** Free

---

### 4.3 Input Sanitization (Beyond Zod)

**Status:** Zod only (no XSS prevention)

**Why It Matters:**
- XSS risk: User input rendered in React
- Stored XSS: Chat messages displayed to other users
- AI prompt injection

**Solution: DOMPurify (client) + validator.js (server)**

```typescript
// Frontend: Sanitize before rendering
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a'],
  });
}

// Backend: Validate and sanitize
import validator from 'validator';

const messageSchema = z.object({
  content: z.string().transform(s => validator.escape(s)),
});

// Prompt injection detection
const PROMPT_INJECTION_PATTERNS = [
  /ignore previous instructions/i,
  /disregard.*above/i,
];

function detectPromptInjection(input: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}
```

**Priority:** MEDIUM | **Phase:** 3 | **Cost:** Free

---

### 4.4 Secrets Rotation

**Status:** Manual (.env files, no rotation)

**Solution: Doppler (Secrets Management)**

```yaml
# Centralized secret storage (not in .env)
# Automatic sync to deployment environments

Setup:
  1. Store secrets in Doppler dashboard
  2. Run locally: doppler run -- npm run dev
  3. Docker: entrypoint: ["doppler", "run", "--", "node", "dist/server.js"]
```

**Priority:** LOW | **Phase:** 5+ | **Cost:** Free (5 users)

---

### 4.5 Audit Logging

**Status:** MISSING

**Why It Matters:**
- Compliance: GDPR, SOC 2 require audit logs
- Stripe payments require audit trail

**Solution: Database-backed audit log**

```typescript
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id'),
  action: text('action').notNull(), // 'session.create', 'payment.process'
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**Priority:** LOW | **Phase:** 5+ | **Cost:** Free

---

## 5. Missing AI Infrastructure

### 5.1 Vector Database for RAG

**Status:** MISSING (no semantic search)

**Why It Matters:**
- Product search uses basic text matching
- Can't find similar design styles semantically
- Phase 5: Semantic product recommendations

**Solution: Supabase pgvector (PostgreSQL extension)**

```sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE product_recommendations
ADD COLUMN embedding vector(768);

CREATE INDEX ON product_recommendations
USING hnsw (embedding vector_cosine_ops);
```

```typescript
export class EmbeddingService {
  async generateEmbedding(text: string): Promise<number[]> {
    const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    return (await model.embedContent(text)).embedding.values;
  }

  async searchSimilarProducts(query: string) {
    const queryEmbedding = await this.generateEmbedding(query);
    return await db.execute(sql`
      SELECT *, 1 - (embedding <=> ${queryEmbedding}::vector) AS similarity
      FROM product_recommendations
      WHERE similarity > 0.7
      ORDER BY similarity DESC
      LIMIT 10
    `);
  }
}
```

**Priority:** MEDIUM | **Phase:** 4-5 | **Cost:** Free (Supabase includes pgvector)

---

### 5.2 Prompt Versioning

**Status:** Hardcoded (backend/src/config/prompts.ts)

**Why It Matters:**
- Can't A/B test prompts
- No rollback capability
- Non-engineers can't edit prompts

**Solution: Database-backed prompt templates**

```typescript
export const promptTemplates = pgTable('prompt_templates', {
  id: uuid('id').primaryKey(),
  phase: text('phase'),
  template: text('template').notNull(),
  version: integer('version').notNull(),
  isActive: boolean('is_active').default(false),
});

export class PromptService {
  async getActivePrompt(phase: string): Promise<string> {
    const [template] = await db.select()
      .from(promptTemplates)
      .where(eq(promptTemplates.phase, phase))
      .where(eq(promptTemplates.isActive, true))
      .orderBy(desc(promptTemplates.version))
      .limit(1);

    return template?.template || getSystemPrompt(phase);
  }
}
```

**Priority:** LOW | **Phase:** 5+ | **Cost:** Free

---

### 5.3 AI Response Caching

**Status:** MISSING

**Why It Matters:**
- Duplicate queries waste API calls
- Gemini costs: $0.15/1M input tokens, $0.60/1M output
- 100 users asking same question = 1 API call if cached

**Solution: Redis cache with prompt hashing**

```typescript
export class AICacheService {
  async getCachedResponse(prompt: string, phase: string): Promise<string | null> {
    const cacheKey = createHash('sha256').update(`${phase}:${prompt}`).digest('hex');
    return await redis.get(`ai_cache:${cacheKey}`);
  }

  async setCachedResponse(prompt: string, phase: string, response: string, ttl = 86400) {
    const cacheKey = createHash('sha256').update(`${phase}:${prompt}`).digest('hex');
    await redis.setex(`ai_cache:${cacheKey}`, ttl, response);
  }
}
```

**Priority:** LOW | **Phase:** 4+ | **Cost:** Free

---

### 5.4 Fallback Model Strategy

**Status:** Single model (Gemini 2.5 Flash)

**Why It Matters:**
- Gemini API downtime breaks entire chat
- Rate limits (15 RPM free tier)

**Solution: Cascading fallback**

```typescript
async function invokeWithFallback(messages: BaseMessage[]) {
  try {
    return await primaryModel.invoke(messages); // Gemini 2.5 Flash
  } catch (error) {
    logger.warn('Primary model failed, trying fallback');
    try {
      return await fallbackModel.invoke(messages); // Gemini 1.5 Pro
    } catch (fallbackError) {
      return await emergencyModel.invoke(messages); // GPT-3.5-turbo
    }
  }
}
```

**Priority:** LOW | **Phase:** 5+ | **Cost:** Minimal

---

### 5.5 Content Moderation

**Status:** MISSING

**Why It Matters:**
- User-generated content: Room descriptions, contractor reviews
- Spam prevention
- Compliance: GDPR, COPPA

**Solution: OpenAI Moderation API (Free)**

```typescript
import OpenAI from 'openai';

const openai = new OpenAI();

export class ModerationService {
  async checkContent(text: string): Promise<{ safe: boolean; categories: string[] }> {
    const response = await openai.moderations.create({ input: text });
    const result = response.results[0];

    return {
      safe: !result.flagged,
      categories: Object.entries(result.categories)
        .filter(([_, flagged]) => flagged)
        .map(([category]) => category),
    };
  }
}
```

**Priority:** LOW | **Phase:** 5+ | **Cost:** Free

---

## 6. Missing Developer Infrastructure

### 6.1 Feature Flags

**Status:** MISSING

**Why It Matters:**
- Gradual rollout: Enable renders for 10% of users first
- A/B testing
- Kill switch for broken features

**Solution: PostHog (Feature Flags + Analytics)**

```typescript
import { PostHog } from 'posthog-node';

export const posthog = new PostHog(env.POSTHOG_API_KEY);

async function generateRender(sessionId: string) {
  const isEnabled = await posthog.isFeatureEnabled('ai-render-generation', sessionId);

  if (!isEnabled) {
    throw new Error('Render generation is currently disabled');
  }

  // Proceed
}
```

**Priority:** MEDIUM | **Phase:** 3 | **Cost:** Free (1M events/mo)

---

### 6.2 Staging / Preview Environments

**Status:** Vercel preview (frontend only)

**Why It Matters:**
- Can't test backend changes in production-like environment
- No staging database for migration testing

**Solution: Vercel Preview + Supabase Branch Databases**

```yaml
Workflow:
  1. Create PR → GitHub Actions creates Supabase branch database
  2. Run migrations on branch database
  3. Backend staging instance connects to branch database
  4. Frontend preview connects to backend staging
  5. Merge PR → Merge branch database to production
```

**Priority:** MEDIUM | **Phase:** 3 | **Cost:** $7/mo Railway staging

---

### 6.3 Load Testing

**Status:** MISSING

**Why It Matters:**
- How many concurrent users can system handle?
- Phase 3: Render generation is CPU-intensive

**Solution: k6 (Load Testing Framework)**

```javascript
// tests/load/chat-load-test.js
import http from 'k6/http';
import ws from 'k6/ws';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '5m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const session = http.post('https://api.yourapp.com/api/sessions', { title: 'Test' });

  ws.connect(`wss://api.yourapp.com?sessionId=${session.id}`, (socket) => {
    socket.send(JSON.stringify({ event: 'chat:user_message', data: { content: 'Hello' } }));
  });
}
```

**Priority:** MEDIUM | **Phase:** 3 | **Cost:** Free (open source)

---

## Implementation Roadmap

### Phase 2.2 (Immediate - 4 days, $0/month)
1. **Sentry** (Error Tracking) - 2 days - CRITICAL
2. **Redis** (Enable existing service) - 1 day
3. **Resend** (Email) - 1 day

### Phase 3 (11.5 days, $26/month)
1. **BullMQ** (Job Queue) - 3 days - CRITICAL
2. **Supabase Image Transformations** - 1 day
3. **Redis Caching** - 2 days
4. **PgBouncer** - 1 day
5. **PostHog** (Feature Flags) - 1 day
6. **Better Uptime** - 0.5 days
7. **LangSmith** - 1 day
8. **k6** - 1 day

### Phase 4 (10 days, $26/month)
1. **Stripe Webhooks** - 2 days - CRITICAL
2. **Audit Logging** - 2 days
3. **Database-backed notifications** - 2 days
4. **CSRF protection** - 1 day
5. **pgvector** - 2 days
6. **Input sanitization** - 1 day

### Phase 5+ (8.5 days, $51/month)
1. **Axiom** (Log aggregation) - 2 days
2. **Doppler** (Secrets) - 1 day
3. **Prompt versioning** - 2 days
4. **AI response caching** - 1 day
5. **Fallback model** - 1 day
6. **Content moderation** - 1 day
7. **Database branching** - 0.5 days

---

## Files to Create

### Infrastructure
- `backend/src/config/redis.ts`
- `backend/src/config/sentry.ts`
- `backend/src/config/posthog.ts`
- `backend/src/utils/cache.ts`
- `frontend/sentry.client.config.ts`
- `frontend/lib/posthog.ts`

### Services
- `backend/src/services/render-queue.service.ts`
- `backend/src/services/pdf-queue.service.ts`
- `backend/src/services/email.service.ts`
- `backend/src/services/embedding.service.ts`
- `backend/src/services/prompt.service.ts`
- `backend/src/services/ai-cache.service.ts`
- `backend/src/services/moderation.service.ts`
- `backend/src/services/notification.service.ts`
- `backend/src/services/audit.service.ts`

### Workers
- `backend/src/workers/render-worker.ts`
- `backend/src/workers/pdf-worker.ts`

### Middleware
- `backend/src/middleware/sentry.middleware.ts`
- `backend/src/middleware/socket-rate-limit.middleware.ts`
- `backend/src/middleware/csrf.middleware.ts`

### Schemas
- `backend/src/db/schema/notifications.schema.ts`
- `backend/src/db/schema/audit-logs.schema.ts`
- `backend/src/db/schema/prompts.schema.ts`

### Email Templates
- `backend/src/emails/render-complete.tsx`
- `backend/src/emails/payment-receipt.tsx`

### Tests
- `backend/tests/load/chat-load-test.js`
- `backend/tests/integration/queue.test.ts`

---

**End of Analysis**

*Review quarterly as infrastructure needs evolve.*
