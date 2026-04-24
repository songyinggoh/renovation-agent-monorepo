/**
 * Payment controller unit tests
 *
 * Covers the four handler functions in payment.controller.ts:
 *   - handleGetPaymentStatus: success path, 404 for unknown session
 *   - handleCreateCheckout: 404 (session not found), dev-bypass (payments disabled),
 *     success (PAYMENT phase + unpaid + payments enabled)
 *   - handleStripeWebhook: 400 when payments not configured, 400 on invalid signature
 *   - handleDevComplete: success fulfillment, 500 when session not found
 *
 * NOT duplicated from payment-security.test.ts:
 *   - Phase gate 400 (INTAKE phase) — covered there
 *   - Already-paid 400 — covered there
 *   - Missing stripe-signature header — covered there
 *   - payment_status unpaid guard — covered there
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const {
  mockDbSelect,
  mockDbUpdate,
  mockGetStripe,
  mockCreateCheckoutSession,
  mockFulfillPayment,
  mockDevCompletePayment,
  mockGetPaymentStatus,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockGetStripe: vi.fn(),
  mockCreateCheckoutSession: vi.fn(),
  mockFulfillPayment: vi.fn(),
  mockDevCompletePayment: vi.fn(),
  mockGetPaymentStatus: vi.fn(),
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
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ eq: val })),
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

vi.mock('../../../src/config/stripe.js', () => ({
  getStripe: mockGetStripe,
}));

// isPaymentsEnabled starts as true; individual tests override with vi.mocked()
vi.mock('../../../src/config/env.js', () => ({
  env: {
    STRIPE_PRICE_AMOUNT_CENTS: 4900,
    FRONTEND_URL: 'http://localhost:3001',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    NODE_ENV: 'test',
  },
  isPaymentsEnabled: vi.fn(() => true),
}));

vi.mock('../../../src/utils/socket-emitter.js', () => ({
  emitToSession: vi.fn(),
}));

// Mock the service layer so controller tests stay unit-level
vi.mock('../../../src/services/payment.service.js', () => ({
  createCheckoutSession: mockCreateCheckoutSession,
  fulfillPayment: mockFulfillPayment,
  devCompletePayment: mockDevCompletePayment,
  getPaymentStatus: mockGetPaymentStatus,
  isPaymentsEnabled: vi.fn(() => true),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────
import {
  handleGetPaymentStatus,
  handleCreateCheckout,
  handleStripeWebhook,
  handleDevComplete,
} from '../../../src/controllers/payment.controller.js';
import { isPaymentsEnabled } from '../../../src/config/env.js';

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

function makeRes(): {
  res: Response;
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn().mockReturnThis();
  const send = vi.fn().mockReturnThis();
  const status = vi.fn().mockReturnValue({ json, send });
  const res = { json, status, send, set: vi.fn() } as unknown as Response;
  return { res, json, status, send };
}

/** Set up db.select().from().where().limit() chain */
function setupSelectChainWithLimit(returnValue: unknown[]) {
  const mockLimit = vi.fn().mockResolvedValue(returnValue);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbSelect.mockReturnValue({ from: mockFrom });
  return { mockLimit, mockWhere, mockFrom };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PaymentController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore payments as enabled by default
    vi.mocked(isPaymentsEnabled).mockReturnValue(true);
  });

  // ── handleGetPaymentStatus ──────────────────────────────────────────────────

  describe('handleGetPaymentStatus', () => {
    it('returns { isPaid, phase } with 200 for a known session', async () => {
      mockGetPaymentStatus.mockResolvedValue({ isPaid: true, phase: 'COMPLETE' });

      const req = makeReq({ params: { sessionId: 'session-abc' } });
      const { res, json, status } = makeRes();

      await handleGetPaymentStatus(req, res);

      expect(status).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({ isPaid: true, phase: 'COMPLETE' });
    });

    it('returns 404 when getPaymentStatus throws with statusCode 404', async () => {
      const notFound = Object.assign(new Error('Session not found'), { statusCode: 404 });
      mockGetPaymentStatus.mockRejectedValue(notFound);

      const req = makeReq({ params: { sessionId: 'nonexistent-id' } });
      const { res, status, json } = makeRes();

      await handleGetPaymentStatus(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Session not found' });
    });

    it('returns 500 when getPaymentStatus throws a generic error', async () => {
      mockGetPaymentStatus.mockRejectedValue(new Error('DB connection failed'));

      const req = makeReq({ params: { sessionId: 'session-abc' } });
      const { res, status, json } = makeRes();

      await handleGetPaymentStatus(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'DB connection failed' });
    });
  });

  // ── handleCreateCheckout ────────────────────────────────────────────────────

  describe('handleCreateCheckout', () => {
    it('returns dev-bypass response when isPaymentsEnabled() is false', async () => {
      vi.mocked(isPaymentsEnabled).mockReturnValue(false);

      const req = makeReq({ params: { sessionId: 'session-abc' } });
      const { res, json, status } = makeRes();

      await handleCreateCheckout(req, res);

      // Should NOT hit the DB at all — early return
      expect(mockDbSelect).not.toHaveBeenCalled();
      expect(status).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          url: null,
          devBypass: true,
        }),
      );
    });

    it('returns 404 when session does not exist in DB', async () => {
      // Session not found — DB returns empty array
      setupSelectChainWithLimit([]);

      const req = makeReq({ params: { sessionId: 'missing-session' } });
      const { res, status, json } = makeRes();

      await handleCreateCheckout(req, res);

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ error: 'Session not found' });
    });

    it('returns { url, checkoutSessionId } when session is in PAYMENT phase and payments are enabled', async () => {
      // Session in PAYMENT phase, not yet paid
      setupSelectChainWithLimit([{ phase: 'PAYMENT', isPaid: false }]);
      mockCreateCheckoutSession.mockResolvedValue({
        url: 'https://checkout.stripe.com/pay/cs_test_ok',
        checkoutSessionId: 'cs_test_ok',
      });

      const req = makeReq({
        params: { sessionId: 'session-abc' },
        user: { email: 'user@example.com' } as Express.User,
      });
      const { res, json, status } = makeRes();

      await handleCreateCheckout(req, res);

      expect(status).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({
        url: 'https://checkout.stripe.com/pay/cs_test_ok',
        checkoutSessionId: 'cs_test_ok',
      });
      expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
        'session-abc',
        'user@example.com',
      );
    });

    it('returns 500 when createCheckoutSession throws', async () => {
      setupSelectChainWithLimit([{ phase: 'PAYMENT', isPaid: false }]);
      mockCreateCheckoutSession.mockRejectedValue(new Error('Stripe API error'));

      const req = makeReq({ params: { sessionId: 'session-abc' } });
      const { res, status, json } = makeRes();

      await handleCreateCheckout(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Failed to create payment session' });
    });
  });

  // ── handleStripeWebhook ─────────────────────────────────────────────────────

  describe('handleStripeWebhook', () => {
    it('returns 400 when isPaymentsEnabled() is false', async () => {
      vi.mocked(isPaymentsEnabled).mockReturnValue(false);

      const req = makeReq({
        headers: { 'stripe-signature': 'valid-sig' },
        body: Buffer.from('{}'),
      });
      const { res, status, json } = makeRes();

      await handleStripeWebhook(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ error: 'Payments not configured' });
    });

    it('returns 400 when stripe.webhooks.constructEvent throws (invalid signature)', async () => {
      mockGetStripe.mockReturnValue({
        webhooks: {
          constructEvent: vi.fn().mockImplementation(() => {
            throw new Error('No signatures found matching the expected signature for payload');
          }),
        },
      });

      const req = makeReq({
        headers: { 'stripe-signature': 'bad-sig' },
        body: Buffer.from('{}'),
      });
      const { res, status, send } = makeRes();

      await handleStripeWebhook(req, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(send).toHaveBeenCalledWith(
        expect.stringContaining('Webhook Error:'),
      );
    });

    it('returns 200 { received: true } and processes checkout.session.completed asynchronously', async () => {
      const mockEvent = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            client_reference_id: 'session-abc',
            payment_status: 'paid',
            payment_intent: 'pi_test_xyz',
          },
        },
      };

      mockGetStripe.mockReturnValue({
        webhooks: {
          constructEvent: vi.fn().mockReturnValue(mockEvent),
        },
      });

      // fulfillPayment is called fire-and-forget; resolve it immediately
      mockFulfillPayment.mockResolvedValue(undefined);

      const req = makeReq({
        headers: { 'stripe-signature': 'valid-sig' },
        body: Buffer.from(JSON.stringify(mockEvent)),
      });
      const { res, json, status } = makeRes();

      await handleStripeWebhook(req, res);

      // The response must be sent before async processing
      expect(status).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({ received: true });
    });
  });

  // ── handleDevComplete ───────────────────────────────────────────────────────

  describe('handleDevComplete', () => {
    it('returns devBypass result when session exists and is unpaid', async () => {
      mockDevCompletePayment.mockResolvedValue({
        devBypass: true,
        warning: 'THIS ENDPOINT DOES NOT EXIST IN PRODUCTION',
        sessionId: 'session-abc',
      });

      const req = makeReq({ params: { sessionId: 'session-abc' } });
      const { res, json, status } = makeRes();

      await handleDevComplete(req, res);

      expect(status).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith({
        devBypass: true,
        warning: 'THIS ENDPOINT DOES NOT EXIST IN PRODUCTION',
        sessionId: 'session-abc',
      });
    });

    it('returns 500 when devCompletePayment throws (session not found)', async () => {
      mockDevCompletePayment.mockRejectedValue(new Error('Session session-xyz not found'));

      const req = makeReq({ params: { sessionId: 'session-xyz' } });
      const { res, status, json } = makeRes();

      await handleDevComplete(req, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({ error: 'Session session-xyz not found' });
    });
  });
});
