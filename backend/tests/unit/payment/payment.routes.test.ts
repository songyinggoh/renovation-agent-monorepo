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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract the content of a router.post() or router.get() registration block.
 * Returns the substring from `router.METHOD(` to the closing `);`.
 */
function extractRouteBlock(src: string, method: 'post' | 'get', pathFragment: string): string {
  const searchStr = `router.${method}(`;
  let start = 0;
  while (start < src.length) {
    const idx = src.indexOf(searchStr, start);
    if (idx === -1) break;
    // Find the closing ');'
    const end = src.indexOf(');', idx);
    const block = src.slice(idx, end + 2);
    if (block.includes(pathFragment)) return block;
    start = idx + 1;
  }
  return '';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Payment routes — middleware chain (source-level audit)', () => {

  // ── POST /api/payments/checkout/:sessionId ──────────────────────────────────

  describe('POST /payments/checkout/:sessionId', () => {
    const checkoutBlock = extractRouteBlock(routesSrc, 'post', 'payments/checkout');

    it('the route registration exists in payment.routes.ts', () => {
      expect(checkoutBlock).not.toBe('');
    });

    it('applies checkoutLimiter', () => {
      expect(checkoutBlock).toContain('checkoutLimiter');
    });

    it('applies optionalAuthMiddleware', () => {
      expect(checkoutBlock).toContain('optionalAuthMiddleware');
    });

    it('applies verifySessionOwnership', () => {
      expect(checkoutBlock).toContain('verifySessionOwnership');
    });

    it('applies checkoutLimiter before optionalAuthMiddleware (rate-limit first)', () => {
      const limiterIdx = checkoutBlock.indexOf('checkoutLimiter');
      const authIdx = checkoutBlock.indexOf('optionalAuthMiddleware');
      expect(limiterIdx).toBeLessThan(authIdx);
    });

    it('applies optionalAuthMiddleware before verifySessionOwnership', () => {
      const authIdx = checkoutBlock.indexOf('optionalAuthMiddleware');
      const ownershipIdx = checkoutBlock.indexOf('verifySessionOwnership');
      expect(authIdx).toBeLessThan(ownershipIdx);
    });

    it('imports checkoutLimiter from rate-limit.middleware', () => {
      expect(routesSrc).toContain('rate-limit.middleware');
      expect(routesSrc).toContain('checkoutLimiter');
    });
  });

  // ── GET /api/payments/status/:sessionId ────────────────────────────────────

  describe('GET /payments/status/:sessionId', () => {
    const statusBlock = extractRouteBlock(routesSrc, 'get', 'payments/status');

    it('the route registration exists in payment.routes.ts', () => {
      expect(statusBlock).not.toBe('');
    });

    it('applies optionalAuthMiddleware', () => {
      expect(statusBlock).toContain('optionalAuthMiddleware');
    });

    it('applies verifySessionOwnership', () => {
      expect(statusBlock).toContain('verifySessionOwnership');
    });

    it('routes to handleGetPaymentStatus handler', () => {
      expect(statusBlock).toContain('handleGetPaymentStatus');
    });
  });

  // ── POST /api/webhooks/stripe (mounted in app.ts) ──────────────────────────

  describe('POST /api/webhooks/stripe (app.ts)', () => {
    it('is NOT registered as a router.post() call in payment.routes.ts', () => {
      // The webhook cannot appear as a router.post() route registration.
      // (It may appear in comments, but must not be an actual route call.)
      const allRouterPosts = routesSrc.split('router.post(');
      // First element is the code before any router.post — skip it
      const routeBlocks = allRouterPosts.slice(1);
      const anyBlockHasWebhook = routeBlocks.some((block) =>
        block.includes('/api/webhooks/stripe'),
      );
      expect(anyBlockHasWebhook).toBe(false);
    });

    it('is mounted directly via app.post() in app.ts', () => {
      expect(appSrc).toContain("'/api/webhooks/stripe'");
    });

    it('uses express.raw() for body parsing immediately before the handler (SECURITY-CHECKLIST W2)', () => {
      // Both express.raw and the webhook path must appear in the same app.post() block
      const appPostIdx = appSrc.indexOf("'/api/webhooks/stripe'");
      expect(appPostIdx).toBeGreaterThan(-1);

      // Find the app.post( call that contains this path
      const appPostStart = appSrc.lastIndexOf('app.post(', appPostIdx);
      const appPostEnd = appSrc.indexOf(');', appPostIdx);
      const webhookRegistration = appSrc.slice(appPostStart, appPostEnd + 2);

      expect(webhookRegistration).toContain('express.raw');
    });

    it('does not apply optionalAuthMiddleware or verifySessionOwnership to the webhook', () => {
      // Extract the app.post() block for the webhook route
      const webhookPathIdx = appSrc.indexOf("'/api/webhooks/stripe'");
      const blockStart = appSrc.lastIndexOf('app.post(', webhookPathIdx);
      const blockEnd = appSrc.indexOf(');', webhookPathIdx);
      const webhookBlock = appSrc.slice(blockStart, blockEnd + 2);

      expect(webhookBlock).not.toContain('optionalAuthMiddleware');
      expect(webhookBlock).not.toContain('verifySessionOwnership');
    });
  });

  // ── POST /api/payments/dev-complete/:sessionId (app.ts) ───────────────────

  describe('POST /api/payments/dev-complete/:sessionId (app.ts)', () => {
    it('is mounted only inside the NODE_ENV !== production guard (SECURITY-CHECKLIST B1)', () => {
      const nodeEnvIdx = appSrc.indexOf("NODE_ENV !== 'production'");
      const devCompleteIdx = appSrc.indexOf('dev-complete');

      expect(nodeEnvIdx).toBeGreaterThan(-1);
      expect(devCompleteIdx).toBeGreaterThan(-1);
      // dev-complete registration must come after the NODE_ENV guard
      expect(devCompleteIdx).toBeGreaterThan(nodeEnvIdx);
    });

    it('applies verifySessionOwnership to the dev-complete route (SECURITY-CHECKLIST B3)', () => {
      // Find the dev-complete app.post() block
      const devCompleteIdx = appSrc.indexOf("'dev-complete'");
      // If path uses template string, try alternate
      const altIdx = appSrc.indexOf('/dev-complete/');
      const blockIdx = devCompleteIdx !== -1 ? devCompleteIdx : altIdx;

      const blockStart = appSrc.lastIndexOf('app.post(', blockIdx);
      const blockEnd = appSrc.indexOf(');', blockIdx);
      const devBlock = appSrc.slice(blockStart, blockEnd + 2);

      expect(devBlock).toContain('verifySessionOwnership');
    });
  });
});
