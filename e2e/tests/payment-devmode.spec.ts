/**
 * payment-devmode.spec.ts
 *
 * E2E tests for the Phase 4 payment flow in dev/test mode (no real Stripe).
 *
 * What is tested:
 *   1. Dev bypass flow: PAYMENT phase → Pay Now → devBypass response → Dev Mode button → dev-complete → COMPLETE
 *   2. PaymentPanel state transitions: default, dev-bypass, success
 *   3. Socket.io payment:completed event causes TanStack Query invalidation → success state renders
 *   4. Return URL handling: ?payment=success spinner while isPaid=false, then success once paid
 *   5. ?payment=cancelled shows the cancelled banner
 *
 * Setup strategy:
 *   - Create session via API (avoids UI overhead)
 *   - Use POST /api/dev/sessions/:id/phase to force PAYMENT phase (dev-only endpoint)
 *   - Use POST /api/payments/dev-complete/:id to fulfill payment in assertions
 *   - Clean up via api.deleteSession() in afterEach
 *
 * Preconditions (always true in CI test environment):
 *   - NODE_ENV=test (dev-complete and phase-override endpoints are mounted)
 *   - Stripe is NOT configured (STRIPE_SECRET_KEY absent) — checkout returns devBypass:true
 */

import { test, expect } from '../fixtures/base.fixture';

test.describe('Payment — Dev Mode Flow', () => {
  // Each test gets its own session to avoid cross-test state contamination.
  let sessionId: string | undefined;

  test.afterEach(async ({ api }) => {
    if (sessionId) {
      await api.deleteSession(sessionId).catch(() => {});
      sessionId = undefined;
    }
  });

  // ---------------------------------------------------------------------------
  // 1. PAYMENT PHASE — Dev bypass flow (end-to-end happy path)
  // ---------------------------------------------------------------------------

  test('pay now button visible when session is in PAYMENT phase', async ({
    paymentPage,
    api,
  }) => {
    const session = await api.createSession('E2E Test Payment Pay Now Button');
    sessionId = session.id;

    // Advance to PAYMENT phase via dev endpoint
    await api.setSessionPhase(sessionId, 'PAYMENT');

    await paymentPage.gotoSession(sessionId);

    // PaymentPanel should be visible with Pay Now CTA
    await paymentPage.expectDefaultState();

    // The panel title should be present
    await expect(
      paymentPage.page.getByText('Complete Your Renovation Plan'),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('clicking Pay Now shows dev bypass mode when Stripe is not configured', async ({
    paymentPage,
    api,
  }) => {
    const session = await api.createSession('E2E Test Payment Dev Bypass Reveal');
    sessionId = session.id;

    await api.setSessionPhase(sessionId, 'PAYMENT');
    await paymentPage.gotoSession(sessionId);

    // Click Pay Now — backend returns devBypass:true because Stripe is not configured
    await paymentPage.clickPayNowExpectingDevBypass();

    // Dev bypass UI: notice banner + Skip Payment button
    await expect(
      paymentPage.page.getByText(/stripe is not configured/i),
    ).toBeVisible();
    await expect(paymentPage.devCompleteButton).toBeVisible();
    await expect(paymentPage.devCompleteButton).toBeEnabled();

    // Pay Now button should no longer be the primary CTA
    await expect(paymentPage.payNowButton).not.toBeVisible();
  });

  test('full dev bypass flow: Pay Now → Skip Payment → success state', async ({
    paymentPage,
    api,
    page,
  }) => {
    // This test exercises the complete dev payment journey:
    //   PAYMENT phase → Pay Now (devBypass) → Skip Payment (dev-complete) → isPaid=true → success
    test.slow(); // AI-independent but involves Socket.io round-trip + 500ms invalidation delay

    const session = await api.createSession('E2E Test Payment Full Dev Bypass Flow');
    sessionId = session.id;

    await api.setSessionPhase(sessionId, 'PAYMENT');
    await paymentPage.gotoSession(sessionId);

    // Step 1: Click Pay Now → devBypass mode
    await paymentPage.clickPayNowExpectingDevBypass();

    // Step 2: Click Skip Payment (dev-complete)
    // This calls POST /api/payments/dev-complete/:id which:
    //   - Sets isPaid=true + phase=COMPLETE in DB
    //   - Emits payment:completed Socket.io event
    //   - Emits session:phase_changed Socket.io event
    await paymentPage.devCompleteButton.click();

    // Step 3: payment:completed → useSocketQuerySync delays 500ms → session re-fetched → isPaid=true
    // PaymentPanel re-renders with success state (green card)
    // Allow up to 8s for Socket.io event + invalidation delay + re-fetch + re-render
    await paymentPage.expectSuccessState(8_000);

    // Verify the success card content
    await expect(
      page.getByText('Your renovation plan is ready.'),
    ).toBeVisible();

    // The "Pay Now" and "Skip Payment" buttons should be gone
    await expect(paymentPage.payNowButton).not.toBeVisible();
    await expect(paymentPage.devCompleteButton).not.toBeVisible();
  });

  test('payment:completed Socket.io event invalidates session query and shows success', async ({
    paymentPage,
    api,
  }) => {
    // This test verifies the real-time path:
    //   dev-complete API → Socket.io payment:completed → useSocketQuerySync → TanStack invalidate
    // The session is already navigated to when dev-complete fires, so the
    // active Socket.io connection receives the event and updates the cache.
    test.slow();

    const session = await api.createSession('E2E Test Payment Socket Event');
    sessionId = session.id;

    await api.setSessionPhase(sessionId, 'PAYMENT');

    // Navigate FIRST — establishes the Socket.io connection and registers listeners
    await paymentPage.gotoSession(sessionId);

    // Verify panel is in default state (not yet paid)
    await paymentPage.expectDefaultState();

    // Trigger dev-complete via API while the page is open and connected
    // This emits payment:completed on the session's Socket.io room
    await api.devCompletePayment(sessionId);

    // useSocketQuerySync handles payment:completed → delayedInvalidate(sessionQueryKey, 500ms)
    // → session re-fetched → isPaid=true → PaymentPanel renders success state
    // Allow 6s: 500ms delay + network RTT + React re-render
    await paymentPage.expectSuccessState(6_000);
  });

  // ---------------------------------------------------------------------------
  // 2. RETURN URL HANDLING (?payment=success / ?payment=cancelled)
  // ---------------------------------------------------------------------------

  test('?payment=success with isPaid=false shows completing spinner', async ({
    paymentPage,
    api,
  }) => {
    // Simulates user returning from Stripe success_url BEFORE the webhook fires.
    // isPaid is still false, so the panel shows a spinner.
    const session = await api.createSession('E2E Test Payment Return Success Spinner');
    sessionId = session.id;

    // Session in PAYMENT phase but NOT yet paid (webhook hasn't fired)
    await api.setSessionPhase(sessionId, 'PAYMENT');

    await paymentPage.gotoSessionWithPaymentSuccess(sessionId);

    // Should show the "Completing payment..." spinner, not the Pay Now button
    await paymentPage.expectReturningFromStripeState();

    // Pay Now button must NOT be visible while in this intermediate state
    await expect(paymentPage.payNowButton).not.toBeVisible();
  });

  test('?payment=success transitions to success when isPaid becomes true', async ({
    paymentPage,
    api,
  }) => {
    // Full return URL flow:
    //   Navigate with ?payment=success (isPaid=false → spinner)
    //   → dev-complete fires → Socket.io payment:completed → isPaid=true → success card
    test.slow();

    const session = await api.createSession('E2E Test Payment Return URL Complete');
    sessionId = session.id;

    await api.setSessionPhase(sessionId, 'PAYMENT');

    // Navigate with ?payment=success — spinner state
    await paymentPage.gotoSessionWithPaymentSuccess(sessionId);
    await paymentPage.expectReturningFromStripeState();

    // Simulate webhook completing payment while user is on the page
    await api.devCompletePayment(sessionId);

    // Socket.io payment:completed → 500ms delay → session re-fetched → isPaid=true
    // Panel transitions: spinner → success card
    await paymentPage.expectSuccessState(8_000);
  });

  test('?payment=cancelled shows cancelled banner with retry option', async ({
    paymentPage,
    api,
    page,
  }) => {
    // Simulates user returning after abandoning the Stripe checkout.
    const session = await api.createSession('E2E Test Payment Cancelled Banner');
    sessionId = session.id;

    await api.setSessionPhase(sessionId, 'PAYMENT');
    await paymentPage.gotoSessionWithPaymentCancelled(sessionId);

    // Cancelled banner should be visible
    await paymentPage.expectCancelledState();

    // Pay Now button should still be present — user can retry
    await expect(paymentPage.payNowButton).toBeVisible({ timeout: 5_000 });
    await expect(paymentPage.payNowButton).toBeEnabled();

    // Descriptive text about the cancellation
    await expect(
      page.getByText(/you can try again/i),
    ).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 3. ALREADY PAID — idempotency guard
  // ---------------------------------------------------------------------------

  test('dev-complete is idempotent — calling twice does not error', async ({
    api,
  }) => {
    // Verifies devCompletePayment() returns alreadyPaid:true on a second call
    // rather than throwing. This guards against the case where Socket.io event
    // retries or test cleanup calls dev-complete on an already-fulfilled session.
    const session = await api.createSession('E2E Test Payment Idempotent');
    sessionId = session.id;

    await api.setSessionPhase(sessionId, 'PAYMENT');

    // First call should succeed
    const first = await api.devCompletePayment(sessionId);
    expect(first.devBypass).toBe(true);

    // Confirm isPaid via status endpoint
    const status = await api.waitForPaymentStatus(sessionId, { isPaid: true });
    expect(status.isPaid).toBe(true);
    expect(status.phase).toBe('COMPLETE');

    // Second call should return alreadyPaid (not throw)
    const response = await fetch(
      'http://localhost:3000/api/payments/dev-complete/' + sessionId,
      { method: 'POST' },
    );
    expect(response.ok).toBe(true);
    const second = (await response.json()) as { alreadyPaid?: boolean };
    expect(second.alreadyPaid).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 4. PAYMENT PANEL STATES — rendered UI assertions
  // ---------------------------------------------------------------------------

  test('payment panel shows descriptive copy about the renovation package', async ({
    paymentPage,
    api,
    page,
  }) => {
    const session = await api.createSession('E2E Test Payment Panel Copy');
    sessionId = session.id;

    await api.setSessionPhase(sessionId, 'PAYMENT');
    await paymentPage.gotoSession(sessionId);

    // Card title
    await expect(
      page.getByText('Complete Your Renovation Plan'),
    ).toBeVisible({ timeout: 5_000 });

    // Card description
    await expect(
      page.getByText(/unlock your full renovation package/i),
    ).toBeVisible();
  });

  test('pay now button shows loading state while checkout mutation is in flight', async ({
    paymentPage,
    api,
    page,
  }) => {
    // Intercept the checkout API request to introduce a delay so we can
    // assert the "Preparing checkout..." pending label while it is in flight.
    const session = await api.createSession('E2E Test Payment Button Loading');
    sessionId = session.id;

    await api.setSessionPhase(sessionId, 'PAYMENT');
    await paymentPage.gotoSession(sessionId);

    // Route intercept: hold the checkout request for 1s before responding
    await page.route('**/api/payments/checkout/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1_000));
      await route.continue();
    });

    // Click Pay Now — button should enter pending state
    await paymentPage.payNowButton.click();

    // While request is in flight, button should show loading label and be disabled
    await expect(
      page.getByRole('button', { name: /preparing checkout/i }),
    ).toBeVisible({ timeout: 3_000 });
    await expect(
      page.getByRole('button', { name: /preparing checkout/i }),
    ).toBeDisabled();

    // After intercept resolves, dev bypass mode should appear
    await paymentPage.expectDevBypassState();

    // Unregister the route intercept
    await page.unroute('**/api/payments/checkout/**');
  });

  test('success state shows after navigating to COMPLETE phase session that is paid', async ({
    paymentPage,
    api,
  }) => {
    // Verifies that when the user navigates directly to a session that is
    // already in COMPLETE phase with isPaid=true (e.g. after a page refresh),
    // the success state renders immediately without any Socket.io events.
    const session = await api.createSession('E2E Test Payment Already Paid On Load');
    sessionId = session.id;

    // Fast-path: complete payment via API before navigating
    await api.setSessionPhase(sessionId, 'PAYMENT');
    await api.devCompletePayment(sessionId);
    // Confirm DB write propagated before navigating
    await api.waitForPaymentStatus(sessionId, { isPaid: true });

    // Navigate with ?payment=success (matches showPayment condition for COMPLETE phase)
    await paymentPage.gotoSessionWithPaymentSuccess(sessionId);

    // isPaid=true on first load — should render success immediately
    await paymentPage.expectSuccessState(5_000);
  });
});
