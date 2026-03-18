/**
 * Payment security tests
 *
 * Covers: phase gate, already-paid rejection, missing signature header,
 * payment_status unpaid guard, dev-complete production guard (404),
 * isPaid write-path audit, and entitlement gate on render.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  mockDbSelect,
  mockDbUpdate,
  mockDbInsert,
  mockGetStripe,
  mockEmitToSession,
  mockQueueAdd,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
  mockGetStripe: vi.fn(),
  mockEmitToSession: vi.fn(),
  mockQueueAdd: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: mockDbInsert,
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ eq: val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  gte: vi.fn((_col: unknown, val: unknown) => ({ gte: val })),
  sql: vi.fn((strings: TemplateStringsArray) => strings.join('')),
}));

vi.mock('../../../src/db/schema/sessions.schema.js', () => ({
  renovationSessions: {
    id: 'renovation_sessions.id',
    phase: 'renovation_sessions.phase',
    isPaid: 'renovation_sessions.is_paid',
    stripePaymentIntentId: 'renovation_sessions.stripe_payment_intent_id',
    updatedAt: 'renovation_sessions.updated_at',
  },
}));

vi.mock('../../../src/db/schema/assets.schema.js', () => ({
  roomAssets: {
    id: 'room_assets.id',
    sessionId: 'room_assets.session_id',
    roomId: 'room_assets.room_id',
    assetType: 'room_assets.asset_type',
    createdAt: 'room_assets.created_at',
    status: 'room_assets.status',
    metadata: 'room_assets.metadata',
    contentType: 'room_assets.content_type',
    fileSize: 'room_assets.file_size',
    updatedAt: 'room_assets.updated_at',
  },
}));

vi.mock('../../../src/db/schema/rooms.schema.js', () => ({
  renovationRooms: { id: 'renovation_rooms.id' },
}));

vi.mock('../../../src/config/stripe.js', () => ({
  getStripe: mockGetStripe,
}));

vi.mock('../../../src/config/env.js', () => ({
  env: {
    STRIPE_PRICE_AMOUNT_CENTS: 4900,
    FRONTEND_URL: 'http://localhost:3001',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    NODE_ENV: 'test',
  },
  isPaymentsEnabled: vi.fn(() => true),
  isStorageEnabled: vi.fn(() => false),
}));

vi.mock('../../../src/utils/socket-emitter.js', () => ({
  emitToSession: mockEmitToSession,
}));

vi.mock('../../../src/config/queue.js', () => ({
  getRenderQueue: vi.fn(() => ({ add: mockQueueAdd })),
}));

vi.mock('../../../src/config/redis.js', () => ({
  testRedisConnection: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: null,
}));

vi.mock('../../../src/services/asset.service.js', () => ({
  buildStoragePath: vi.fn(() => 'sessions/abc/rooms/def/renders/render.png'),
}));

// ── Imports (after mocks) ─────────────────────────────────────────────────────
import { handleCreateCheckout } from '../../../src/controllers/payment.controller.js';
import { RenderService } from '../../../src/services/render.service.js';
import type { Request, Response } from 'express';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    headers: {},
    body: Buffer.from('{}'),
    user: undefined,
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  const json = vi.fn().mockReturnThis();
  const send = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ json, send });
  const res = { json, status, send, set: vi.fn() } as unknown as Response;
  return { res, json, status, send };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Payment Security Controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Phase gate ──────────────────────────────────────────────────────────────

  describe('Phase gate — handleCreateCheckout (SECURITY-CHECKLIST E5)', () => {
    it('returns 400 when session is not in PAYMENT phase', async () => {
      // Session exists but is in INTAKE phase
      const mockLimit = vi.fn().mockResolvedValue([{ phase: 'INTAKE', isPaid: false }]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      mockDbSelect.mockReturnValue({ from: mockFrom });

      const req = makeReq({ params: { sessionId: 'test-session-id' } });
      const { res, status, json } = makeRes();

      await handleCreateCheckout(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Session is not in PAYMENT phase' }),
      );
    });

    it('returns 400 when session is already paid', async () => {
      // Session is in PAYMENT phase but already paid
      const mockLimit = vi.fn().mockResolvedValue([{ phase: 'PAYMENT', isPaid: true }]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      mockDbSelect.mockReturnValue({ from: mockFrom });

      const req = makeReq({ params: { sessionId: 'test-session-id' } });
      const { res, status, json } = makeRes();

      await handleCreateCheckout(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Session is already paid' }),
      );
    });
  });

  // ── Webhook signature ───────────────────────────────────────────────────────

  describe('Webhook — stripe-signature header (SECURITY-CHECKLIST W3)', () => {
    it('returns 400 when stripe-signature header is missing', async () => {
      // Lazily import handleStripeWebhook (after mocks)
      const { handleStripeWebhook } = await import('../../../src/controllers/payment.controller.js');

      const req = makeReq({
        headers: {}, // no stripe-signature
        body: Buffer.from('{}'),
      });
      const { res, status, json } = makeRes();

      await handleStripeWebhook(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Missing stripe-signature header' }),
      );
    });
  });

  // ── payment_status unpaid guard ─────────────────────────────────────────────

  describe('Webhook — payment_status unpaid check (SECURITY-CHECKLIST W6)', () => {
    it('does NOT call fulfillPayment when payment_status is unpaid', async () => {
      const { handleStripeWebhook } = await import('../../../src/controllers/payment.controller.js');

      // Build a minimal signed event with payment_status: 'unpaid'
      const checkoutSession = {
        id: 'cs_test_unpaid',
        object: 'checkout.session',
        client_reference_id: 'test-session-id',
        payment_status: 'unpaid',
        payment_intent: null,
        metadata: {},
      };
      const event = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: { object: checkoutSession },
      };

      // Mock stripe.webhooks.constructEvent to return our event
      mockGetStripe.mockReturnValue({
        webhooks: {
          constructEvent: vi.fn().mockReturnValue(event),
        },
      });

      const req = makeReq({
        headers: { 'stripe-signature': 'valid-sig' },
        body: Buffer.from(JSON.stringify(event)),
      });
      const { res } = makeRes();

      await handleStripeWebhook(req, res);

      // fulfillPayment should NOT have been called because payment_status is 'unpaid'
      // (We verify this by checking the DB was not touched for fulfillment)
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });
  });

  // ── Dev-complete production guard ───────────────────────────────────────────

  describe('Dev-complete production guard (SECURITY-CHECKLIST B1, B4)', () => {
    it('app.ts conditionally registers dev-complete only in non-production (source-level audit)', () => {
      // Static analysis: verify the app.ts source code gates dev-complete inside
      // a NODE_ENV !== 'production' block, NOT inside a handler-level check.
      // This is the B1 requirement: route registration-time gate, not handler-level.
      const appSrc = readFileSync(join(process.cwd(), 'src', 'app.ts'), 'utf8');

      // The dev-complete route must be registered inside a NODE_ENV !== 'production' block
      expect(appSrc).toContain("NODE_ENV !== 'production'");
      expect(appSrc).toContain('dev-complete');

      // The dev-complete route must NOT be registered outside the NODE_ENV check
      // Verify: the string 'dev-complete' appears AFTER 'NODE_ENV' in the file
      const nodeEnvIdx = appSrc.indexOf("NODE_ENV !== 'production'");
      const devCompleteIdx = appSrc.indexOf('dev-complete');
      expect(devCompleteIdx).toBeGreaterThan(nodeEnvIdx);
    });

    it('app.ts does NOT contain any handler-level production check for dev-complete (B1 negative)', () => {
      // Handler-level checks (inside the handler function body) are insufficient per B1.
      // The route must literally not exist in the routing table in production.
      // Verify the dev-complete handler does NOT do: if (env.NODE_ENV === 'production') return 404
      const controllerSrc = readFileSync(
        join(process.cwd(), 'src', 'controllers', 'payment.controller.ts'),
        'utf8',
      );

      // The controller should NOT have a production guard for dev-complete
      // (the gate is in app.ts, not in the handler)
      const hasHandlerLevelGate =
        controllerSrc.includes("NODE_ENV === 'production'") &&
        controllerSrc.includes('dev-complete');

      expect(hasHandlerLevelGate).toBe(false);
    });
  });

  // ── isPaid write path audit (SECURITY-CHECKLIST S3) ────────────────────────

  describe('isPaid write path audit (SECURITY-CHECKLIST S3)', () => {
    it('only payment.service.ts sets isPaid: true — no other source file', () => {
      const srcDir = join(process.cwd(), 'src');

      // Recursively collect all .ts files under src/
      function collectTsFiles(dir: string): string[] {
        const entries = readdirSync(dir, { withFileTypes: true });
        const files: string[] = [];
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            files.push(...collectTsFiles(fullPath));
          } else if (entry.name.endsWith('.ts')) {
            files.push(fullPath);
          }
        }
        return files;
      }

      const tsFiles = collectTsFiles(srcDir);

      // Find all files that set isPaid: true (or isPaid = true) in non-comment lines
      const violatingFiles: string[] = [];
      for (const filePath of tsFiles) {
        const content = readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        // Check each line: skip comment-only lines (// ...), look for actual assignments
        const hasWrite = lines.some((line) => {
          const trimmed = line.trimStart();
          // Skip comment lines
          if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
          // Match actual DB write patterns: isPaid: true (object literal), isPaid = true (assignment)
          return /isPaid\s*[:=]\s*true/.test(trimmed);
        });
        if (hasWrite) {
          violatingFiles.push(filePath);
        }
      }

      // Only payment.service.ts should set isPaid: true
      const nonPaymentViolators = violatingFiles.filter(
        (f) => !f.includes('payment.service.ts'),
      );

      expect(nonPaymentViolators).toEqual([]);
    });
  });

  // ── Entitlement gates ───────────────────────────────────────────────────────

  describe('Entitlement gates — requestRender (render.service.ts)', () => {
    let renderService: RenderService;

    beforeEach(() => {
      renderService = new RenderService();
    });

    it('throws "Payment required" when session is in PAYMENT phase and isPaid=false', async () => {
      // Session check: PAYMENT phase, unpaid
      const mockWhere = vi.fn().mockResolvedValue([{ phase: 'PAYMENT', isPaid: false }]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      mockDbSelect.mockReturnValue({ from: mockFrom });

      await expect(
        renderService.requestRender({
          sessionId: 'test-session-id',
          roomId: 'test-room-id',
          mode: 'from_scratch',
          prompt: 'A modern living room',
        }),
      ).rejects.toThrow('Payment required to generate renders in this phase');
    });

    it('allows render when session is in COMPLETE phase and isPaid=true', async () => {
      // Call 1: session check — COMPLETE + paid
      const mockWhere1 = vi.fn().mockResolvedValue([{ phase: 'COMPLETE', isPaid: true }]);
      const mockFrom1 = vi.fn().mockReturnValue({ where: mockWhere1 });

      // Call 2: room check — room found
      const mockWhere2 = vi.fn().mockResolvedValue([{ id: 'test-room-id', name: 'Living Room' }]);
      const mockFrom2 = vi.fn().mockReturnValue({ where: mockWhere2 });

      // Call 3: rate limit — under limit
      const mockWhere3 = vi.fn().mockResolvedValue([{ count: 0 }]);
      const mockFrom3 = vi.fn().mockReturnValue({ where: mockWhere3 });

      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: mockFrom1 };
        if (callCount === 2) return { from: mockFrom2 };
        return { from: mockFrom3 };
      });

      // Insert returns asset record
      const mockReturning = vi.fn().mockResolvedValue([{
        id: 'asset-uuid-1',
        sessionId: 'test-session-id',
        roomId: 'test-room-id',
        assetType: 'render',
        status: 'processing',
      }]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      mockDbInsert.mockReturnValue({ values: mockValues });

      // Queue adds job
      mockQueueAdd.mockResolvedValue({ id: 'job-123' });

      // Should NOT throw — paid + COMPLETE phase is allowed
      const result = await renderService.requestRender({
        sessionId: 'test-session-id',
        roomId: 'test-room-id',
        mode: 'from_scratch',
        prompt: 'A renovated living room',
      });

      expect(result.assetId).toBe('asset-uuid-1');
    });

    it('allows render during RENDER phase even when isPaid=false (free preview)', async () => {
      // Call 1: session check — RENDER + unpaid (free preview)
      const mockWhere1 = vi.fn().mockResolvedValue([{ phase: 'RENDER', isPaid: false }]);
      const mockFrom1 = vi.fn().mockReturnValue({ where: mockWhere1 });

      // Call 2: room check — room found
      const mockWhere2 = vi.fn().mockResolvedValue([{ id: 'test-room-id', name: 'Kitchen' }]);
      const mockFrom2 = vi.fn().mockReturnValue({ where: mockWhere2 });

      // Call 3: rate limit — under limit
      const mockWhere3 = vi.fn().mockResolvedValue([{ count: 1 }]);
      const mockFrom3 = vi.fn().mockReturnValue({ where: mockWhere3 });

      let callCount = 0;
      mockDbSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { from: mockFrom1 };
        if (callCount === 2) return { from: mockFrom2 };
        return { from: mockFrom3 };
      });

      const mockReturning = vi.fn().mockResolvedValue([{
        id: 'asset-preview-1',
        sessionId: 'test-session-id',
        roomId: 'test-room-id',
        assetType: 'render',
        status: 'processing',
      }]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      mockDbInsert.mockReturnValue({ values: mockValues });
      mockQueueAdd.mockResolvedValue({ id: 'job-preview' });

      // Should NOT throw — RENDER phase is free preview
      const result = await renderService.requestRender({
        sessionId: 'test-session-id',
        roomId: 'test-room-id',
        mode: 'from_scratch',
        prompt: 'A preview kitchen render',
      });

      expect(result.assetId).toBe('asset-preview-1');
    });
  });
});
