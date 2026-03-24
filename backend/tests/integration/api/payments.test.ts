import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { getApp, mockDbResolve } from './setup.js';
import { isPaymentsEnabled, env } from '../../../src/config/env.js';
import { getStripe } from '../../../src/config/stripe.js';
import { emitToSession } from '../../../src/utils/socket-emitter.js';

// ── Mocks ──

const mockStripe = {
  checkout: {
    sessions: {
      create: vi.fn(),
    },
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
};

vi.mock('../../../src/config/stripe.js', () => ({
  getStripe: vi.fn(() => mockStripe),
}));

vi.mock('../../../src/utils/socket-emitter.js', () => ({
  emitToSession: vi.fn(),
}));

let app: Application;

beforeAll(async () => {
  app = await getApp();
});

beforeEach(() => {
  vi.clearAllMocks();
  // Enable payments for these tests
  vi.mocked(isPaymentsEnabled).mockReturnValue(true);
  vi.mocked(env).STRIPE_WEBHOOK_SECRET = 'whsec_test';
  // Default db mock to empty
  mockDbResolve.mockResolvedValue([]);
});

describe('Payment Integration Tests', () => {
  const sessionId = 'test-session-id';
  const mockSession = {
    id: sessionId,
    phase: 'PAYMENT',
    isPaid: false,
    userId: 'test-user-id',
  };

  describe('POST /api/payments/checkout/:sessionId', () => {
    it('should create a checkout session and return the URL', async () => {
      mockDbResolve.mockResolvedValueOnce([mockSession]);
      
      const stripe = getStripe();
      vi.mocked(stripe.checkout.sessions.create).mockResolvedValueOnce({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/pay/cs_test_123',
      } as any);

      const res = await request(app)
        .post(`/api/payments/checkout/${sessionId}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://checkout.stripe.com/pay/cs_test_123');
      expect(res.body.checkoutSessionId).toBe('cs_test_123');
      
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          client_reference_id: sessionId,
          mode: 'payment',
        })
      );
    });

    it('should return 400 if session is already paid', async () => {
      mockDbResolve.mockResolvedValueOnce([{ ...mockSession, isPaid: true }]);

      const res = await request(app)
        .post(`/api/payments/checkout/${sessionId}`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Session is already paid');
    });

    it('should return 400 if session is not in PAYMENT phase', async () => {
      mockDbResolve.mockResolvedValueOnce([{ ...mockSession, phase: 'INTAKE' }]);

      const res = await request(app)
        .post(`/api/payments/checkout/${sessionId}`)
        .send();

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Session is not in PAYMENT phase');
    });

    it('should return 404 if session not found', async () => {
      mockDbResolve.mockResolvedValueOnce([]);

      const res = await request(app)
        .post(`/api/payments/checkout/${sessionId}`)
        .send();

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });

    it('should return dev-bypass when payments are disabled', async () => {
      vi.mocked(isPaymentsEnabled).mockReturnValue(false);

      const res = await request(app)
        .post(`/api/payments/checkout/${sessionId}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.devBypass).toBe(true);
      expect(res.body.url).toBeNull();
    });
  });

  describe('GET /api/payments/status/:sessionId', () => {
    it('should return payment status', async () => {
      mockDbResolve.mockResolvedValueOnce([{ isPaid: true, phase: 'COMPLETE' }]);

      const res = await request(app).get(`/api/payments/status/${sessionId}`);

      expect(res.status).toBe(200);
      expect(res.body.isPaid).toBe(true);
      expect(res.body.phase).toBe('COMPLETE');
    });

    it('should return 404 if session not found', async () => {
      mockDbResolve.mockResolvedValueOnce([]);

      const res = await request(app).get(`/api/payments/status/${sessionId}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Session not found');
    });
  });

  describe('POST /api/webhooks/stripe', () => {
    it('should verify signature and fulfill payment asynchronously', async () => {
      const stripe = getStripe();
      const mockEvent = {
        id: 'evt_test',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            client_reference_id: sessionId,
            payment_status: 'paid',
            payment_intent: 'pi_test_123',
          },
        },
      };

      vi.mocked(stripe.webhooks.constructEvent).mockReturnValue(mockEvent as any);
      
      // For fulfillPayment: 
      // 1. Select session status (idempotency check)
      // 2. Update session status
      mockDbResolve
        .mockResolvedValueOnce([{ isPaid: false }]) // idempotency check
        .mockResolvedValueOnce([{}]); // update

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 't=123,v1=abc')
        .send({ id: 'evt_test' });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
      
      // Wait for async processing (fulfillPayment)
      // Since fulfillPayment is called without await in handleStripeWebhook,
      // we might need a small delay or check mocks after some time.
      // But in integration tests with mocked DB, it usually runs fast.
      
      // We can use a small delay or vi.waitFor
      await vi.waitFor(() => {
        expect(mockDbResolve).toHaveBeenCalled(); 
        expect(emitToSession).toHaveBeenCalledWith(sessionId, 'payment:completed', expect.any(Object));
      });
    });

    it('should return 400 if signature is missing', async () => {
      const res = await request(app)
        .post('/api/webhooks/stripe')
        .send({ id: 'evt_test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing stripe-signature header');
    });

    it('should return 400 if signature verification fails', async () => {
      const stripe = getStripe();
      vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'invalid')
        .send({ id: 'evt_test' });

      expect(res.status).toBe(400);
      expect(res.text).toContain('Webhook Error: Invalid signature');
    });
  });

  describe('POST /api/payments/dev-complete/:sessionId', () => {
    it('should fulfill payment via dev bypass in non-production', async () => {
      // app.ts mounts this only if NODE_ENV !== 'production'
      // setup.ts sets env.NODE_ENV = 'test'
      
      mockDbResolve
        .mockResolvedValueOnce([{ isPaid: false }]) // idempotency
        .mockResolvedValueOnce([{}]); // update

      const res = await request(app)
        .post(`/api/payments/dev-complete/${sessionId}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.devBypass).toBe(true);
      expect(emitToSession).toHaveBeenCalledWith(sessionId, 'payment:completed', expect.any(Object));
    });

    it('should return 500 if session not found', async () => {
      mockDbResolve.mockResolvedValueOnce([]);

      const res = await request(app)
        .post(`/api/payments/dev-complete/${sessionId}`)
        .send();

      expect(res.status).toBe(500);
      expect(res.body.error).toBe(`Session ${sessionId} not found`);
    });
  });
});
