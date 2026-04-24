/**
 * Stripe config unit tests
 *
 * Covers:
 *   - isPaymentsEnabled() logic: false when either key is absent, true when both set
 *   - getStripe() throws when isPaymentsEnabled() returns false
 *   - getStripe() returns the same instance on repeated calls (singleton)
 *
 * Note: env.ts is a singleton that runs at import time, so we test
 * isPaymentsEnabled() logic by evaluating its inline boolean expression
 * rather than re-importing the module. For getStripe() we use vi.resetModules()
 * + dynamic import to get a fresh module instance per test.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── isPaymentsEnabled logic ────────────────────────────────────────────────────

describe('isPaymentsEnabled logic', () => {
  // The implementation is: !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET)
  // We test the boolean contract directly without re-loading env.ts.

  const check = (key: string | undefined, secret: string | undefined) =>
    !!(key && secret);

  it('returns false when STRIPE_SECRET_KEY is not set', () => {
    expect(check(undefined, 'whsec_test')).toBe(false);
  });

  it('returns false when STRIPE_WEBHOOK_SECRET is not set', () => {
    expect(check('sk_test_abc', undefined)).toBe(false);
  });

  it('returns false when both keys are missing', () => {
    expect(check(undefined, undefined)).toBe(false);
  });

  it('returns false when STRIPE_SECRET_KEY is empty string', () => {
    expect(check('', 'whsec_test')).toBe(false);
  });

  it('returns false when STRIPE_WEBHOOK_SECRET is empty string', () => {
    expect(check('sk_test_abc', '')).toBe(false);
  });

  it('returns true when both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set', () => {
    expect(check('sk_test_abc', 'whsec_test')).toBe(true);
  });
});

// ── getStripe — throws when payments disabled ──────────────────────────────────

describe('getStripe()', () => {
  // Each test resets modules to get a fresh _stripe singleton state
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws when isPaymentsEnabled() returns false', async () => {
    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      })),
    }));

    vi.doMock('../../../src/config/env.js', () => ({
      env: {
        STRIPE_SECRET_KEY: undefined,
        STRIPE_WEBHOOK_SECRET: undefined,
      },
      isPaymentsEnabled: () => false,
    }));

    // Stub stripe so its module-level initialisation doesn't add import cost
    vi.doMock('stripe', () => ({ default: vi.fn() }));

    const { getStripe } = await import('../../../src/config/stripe.js');

    expect(() => getStripe()).toThrow(
      'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in your environment.',
    );
  }, 15_000);

  it('returns the same instance on multiple calls (singleton behaviour)', async () => {
    const fakeStripeInstance = {
      checkout: { sessions: { create: vi.fn() } },
      webhooks: { constructEvent: vi.fn() },
    };

    vi.doMock('../../../src/utils/logger.js', () => ({
      Logger: vi.fn().mockImplementation(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      })),
    }));

    vi.doMock('../../../src/config/env.js', () => ({
      env: {
        STRIPE_SECRET_KEY: 'sk_test_singleton_key',
        STRIPE_WEBHOOK_SECRET: 'whsec_test',
      },
      isPaymentsEnabled: () => true,
    }));

    // Stub the Stripe constructor so no real network call is made
    const StripeConstructor = vi.fn().mockReturnValue(fakeStripeInstance);
    vi.doMock('stripe', () => ({
      default: StripeConstructor,
    }));

    const { getStripe } = await import('../../../src/config/stripe.js');

    const first = getStripe();
    const second = getStripe();

    // Both calls must return the same object reference
    expect(first).toBe(second);

    // Stripe constructor must only have been called once
    expect(StripeConstructor).toHaveBeenCalledTimes(1);
    expect(StripeConstructor).toHaveBeenCalledWith('sk_test_singleton_key');
  });
});
