import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (must be defined before any imports) ──────────────────────
const { mockDbSelect, mockDbUpdate, mockStripeCreate, mockEmitToSession } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockStripeCreate: vi.fn(),
  mockEmitToSession: vi.fn(),
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock database
vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ eq: val })),
}));

// Mock sessions schema
vi.mock('../../../src/db/schema/sessions.schema.js', () => ({
  renovationSessions: {
    id: 'renovation_sessions.id',
    isPaid: 'renovation_sessions.is_paid',
    phase: 'renovation_sessions.phase',
    stripePaymentIntentId: 'renovation_sessions.stripe_payment_intent_id',
    updatedAt: 'renovation_sessions.updated_at',
  },
}));

// Mock Stripe SDK
vi.mock('../../../src/config/stripe.js', () => ({
  getStripe: vi.fn(() => ({
    checkout: {
      sessions: {
        create: mockStripeCreate,
      },
    },
  })),
}));

// Mock env
vi.mock('../../../src/config/env.js', () => ({
  env: {
    STRIPE_PRICE_AMOUNT_CENTS: 4900,
    FRONTEND_URL: 'http://localhost:3001',
  },
  isPaymentsEnabled: vi.fn(() => true),
}));

// Mock socket emitter
vi.mock('../../../src/utils/socket-emitter.js', () => ({
  emitToSession: mockEmitToSession,
}));

import {
  fulfillPayment,
  createCheckoutSession,
  devCompletePayment,
} from '../../../src/services/payment.service.js';
import type Stripe from 'stripe';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal mock Stripe.Checkout.Session */
function makeMockStripeSession(overrides: Partial<{
  id: string;
  client_reference_id: string | null;
  metadata: Record<string, string> | null;
  payment_intent: string | null;
  payment_status: string;
}> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_abc123',
    client_reference_id: 'test-session-uuid',
    metadata: { renovationSessionId: 'test-session-uuid' },
    payment_intent: 'pi_test_xyz',
    payment_status: 'paid',
    ...overrides,
  } as unknown as Stripe.Checkout.Session;
}

/** Set up db.select().from().where() chain returning a single result */
function setupSelectChain(returnValue: unknown[]) {
  const mockWhere = vi.fn().mockResolvedValue(returnValue);
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbSelect.mockReturnValue({ from: mockFrom });
  return { mockWhere, mockFrom };
}

/** Set up db.update().set().where() chain */
function setupUpdateChain() {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbUpdate.mockReturnValue({ set: mockSet });
  return { mockSet, mockWhere };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── fulfillPayment ──────────────────────────────────────────────────────────

  describe('fulfillPayment', () => {
    it('idempotent skip: does NOT call db.update when session is already paid (SECURITY-CHECKLIST W5)', async () => {
      // Session already paid — idempotency guard should kick in
      setupSelectChain([{ isPaid: true }]);

      const session = makeMockStripeSession();
      await fulfillPayment(session);

      expect(mockDbUpdate).not.toHaveBeenCalled();
      expect(mockEmitToSession).not.toHaveBeenCalled();
    });

    it('successful fulfillment: updates isPaid=true, phase=COMPLETE, emits socket events', async () => {
      // Session not yet paid
      setupSelectChain([{ isPaid: false }]);
      const { mockSet } = setupUpdateChain();

      const session = makeMockStripeSession({
        client_reference_id: 'test-uuid',
        payment_intent: 'pi_test_live',
      });

      await fulfillPayment(session);

      // DB update called once with correct fields
      expect(mockDbUpdate).toHaveBeenCalledTimes(1);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          isPaid: true,
          stripePaymentIntentId: 'pi_test_live',
          phase: 'COMPLETE',
        }),
      );

      // Socket.io events emitted
      expect(mockEmitToSession).toHaveBeenCalledWith('test-uuid', 'payment:completed', expect.objectContaining({ sessionId: 'test-uuid' }));
      expect(mockEmitToSession).toHaveBeenCalledWith('test-uuid', 'session:phase_changed', expect.objectContaining({ phase: 'COMPLETE' }));
    });

    it('missing session ID: returns early without DB update when client_reference_id and metadata are both null', async () => {
      const session = makeMockStripeSession({
        client_reference_id: null,
        metadata: null,
      });

      await fulfillPayment(session);

      expect(mockDbSelect).not.toHaveBeenCalled();
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it('session not found in DB: returns early without DB update', async () => {
      // DB returns empty array — session not found
      setupSelectChain([]);

      const session = makeMockStripeSession({ client_reference_id: 'nonexistent-id' });
      await fulfillPayment(session);

      expect(mockDbUpdate).not.toHaveBeenCalled();
    });
  });

  // ── createCheckoutSession ───────────────────────────────────────────────────

  describe('createCheckoutSession', () => {
    it('returns url and checkoutSessionId from Stripe', async () => {
      mockStripeCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/pay/cs_test_123',
        id: 'cs_test_123',
      });

      const result = await createCheckoutSession('session-uuid', 'test@example.com');

      expect(result).toEqual({
        url: 'https://checkout.stripe.com/pay/cs_test_123',
        checkoutSessionId: 'cs_test_123',
      });
      expect(mockStripeCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          client_reference_id: 'session-uuid',
          customer_email: 'test@example.com',
        }),
      );
    });
  });

  // ── devCompletePayment ──────────────────────────────────────────────────────

  describe('devCompletePayment', () => {
    it('idempotency: returns { alreadyPaid: true } without DB update when session is already paid', async () => {
      setupSelectChain([{ isPaid: true }]);

      const result = await devCompletePayment('session-uuid');

      expect(result).toEqual({ alreadyPaid: true });
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it('successful bypass: updates isPaid=true and emits socket events', async () => {
      setupSelectChain([{ isPaid: false }]);
      const { mockSet } = setupUpdateChain();

      const result = await devCompletePayment('session-uuid');

      expect(mockDbUpdate).toHaveBeenCalledTimes(1);
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          isPaid: true,
          phase: 'COMPLETE',
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          devBypass: true,
          warning: 'THIS ENDPOINT DOES NOT EXIST IN PRODUCTION',
          sessionId: 'session-uuid',
        }),
      );
      expect(mockEmitToSession).toHaveBeenCalledWith('session-uuid', 'payment:completed', expect.any(Object));
    });
  });
});
