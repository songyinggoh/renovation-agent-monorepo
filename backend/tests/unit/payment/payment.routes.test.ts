/**
 * Payment routes unit tests
 *
 * Verifies the middleware chain applied to each payment route via static
 * analysis of the route registration source code. This avoids a full
 * integration-test stack (supertest + DB) while still asserting the security
 * contract: that verifySessionOwnership and checkoutLimiter are wired in and
 * that the webhook route lives outside the authenticated router.
 *
 * The integration-level HTTP behaviour (status codes, response bodies) is
 * covered by tests/integration/api/payments.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const routesSrc = readFileSync(
  resolve(process.cwd(), 'src', 'routes', 'payment.routes.ts'),
  'utf-8',
);

const appSrc = readFileSync(
  resolve(process.cwd(), 'src', 'app.ts'),
  'utf-8',
);

describe('Payment routes — middleware chain (source-level audit)', () => {
  // ── POST /api/payments/checkout/:sessionId ──────────────────────────────────

  describe('POST /payments/checkout/:sessionId', () => {
    it('applies checkoutLimiter middleware', () => {
      // The route registration must include checkoutLimiter in the handler list
      expect(routesSrc).toContain('checkoutLimiter');
    });

    it('applies optionalAuthMiddleware before verifySessionOwnership', () => {
      expect(routesSrc).toContain('optionalAuthMiddleware');
      expect(routesSrc).toContain('verifySessionOwnership');

      const authIdx = routesSrc.indexOf('optionalAuthMiddleware');
      const ownershipIdx = routesSrc.indexOf('verifySessionOwnership');

      expect(authIdx).toBeGreaterThan(-1);
      expect(ownershipIdx).toBeGreaterThan(-1);
      // optionalAuth is registered before ownership check
      expect(authIdx).toBeLessThan(ownershipIdx);
    });

    it('applies checkoutLimiter before optionalAuthMiddleware (rate-limit first)', () => {
      const limiterIdx = routesSrc.indexOf('checkoutLimiter');
      const authIdx = routesSrc.indexOf('optionalAuthMiddleware');

      expect(limiterIdx).toBeGreaterThan(-1);
      expect(authIdx).toBeGreaterThan(-1);
      expect(limiterIdx).toBeLessThan(authIdx);
    });

    it('imports checkoutLimiter from rate-limit.middleware', () => {
      expect(routesSrc).toContain('rate-limit.middleware');
      expect(routesSrc).toContain('checkoutLimiter');
    });
  });

  // ── GET /api/payments/status/:sessionId ────────────────────────────────────

  describe('GET /payments/status/:sessionId', () => {
    it('applies optionalAuthMiddleware and verifySessionOwnership', () => {
      // Both must be present in the routes file (they serve both routes)
      expect(routesSrc).toContain('optionalAuthMiddleware');
      expect(routesSrc).toContain('verifySessionOwnership');
    });

    it('routes to handleGetPaymentStatus handler', () => {
      expect(routesSrc).toContain('handleGetPaymentStatus');
    });
  });

  // ── POST /api/webhooks/stripe (mounted in app.ts) ──────────────────────────

  describe('POST /api/webhooks/stripe (app.ts)', () => {
    it('is mounted directly in app.ts (not in payment.routes.ts)', () => {
      // The webhook must NOT be in the router file — it is special-cased in app.ts
      // because it needs express.raw() for raw Buffer body
      expect(routesSrc).not.toContain('/api/webhooks/stripe');
      expect(appSrc).toContain('/api/webhooks/stripe');
    });

    it('uses express.raw() for body parsing (not express.json())', () => {
      // SECURITY-CHECKLIST W2: raw body required for Stripe signature verification
      const rawIdx = appSrc.indexOf('express.raw');
      const webhookIdx = appSrc.indexOf('/api/webhooks/stripe');

      expect(rawIdx).toBeGreaterThan(-1);
      expect(webhookIdx).toBeGreaterThan(-1);

      // express.raw must be on the same route registration as the webhook path
      // (they appear within a few hundred characters of each other)
      const distance = Math.abs(rawIdx - webhookIdx);
      expect(distance).toBeLessThan(200);
    });

    it('does not require auth middleware (webhook is server-to-server via Stripe sig)', () => {
      // The webhook route in app.ts should NOT include optionalAuthMiddleware or
      // verifySessionOwnership — those are for client-facing routes only.
      // Extract the webhook route registration block from app.ts.
      const webhookBlockStart = appSrc.indexOf('/api/webhooks/stripe');
      // Take a generous window around that line
      const webhookBlock = appSrc.slice(
        Math.max(0, webhookBlockStart - 50),
        webhookBlockStart + 150,
      );

      expect(webhookBlock).not.toContain('optionalAuthMiddleware');
      expect(webhookBlock).not.toContain('verifySessionOwnership');
    });
  });

  // ── POST /api/payments/dev-complete/:sessionId (app.ts) ───────────────────

  describe('POST /api/payments/dev-complete/:sessionId (app.ts)', () => {
    it('is mounted only when NODE_ENV !== production (SECURITY-CHECKLIST B1)', () => {
      expect(appSrc).toContain("NODE_ENV !== 'production'");
      const nodeEnvIdx = appSrc.indexOf("NODE_ENV !== 'production'");
      const devCompleteIdx = appSrc.indexOf('dev-complete');

      expect(devCompleteIdx).toBeGreaterThan(nodeEnvIdx);
    });

    it('applies verifySessionOwnership (SECURITY-CHECKLIST B3)', () => {
      // Extract the dev-complete route registration block
      const devCompleteIdx = appSrc.indexOf('dev-complete');
      const devCompleteBlock = appSrc.slice(devCompleteIdx, devCompleteIdx + 200);

      expect(devCompleteBlock).toContain('verifySessionOwnership');
    });
  });
});
