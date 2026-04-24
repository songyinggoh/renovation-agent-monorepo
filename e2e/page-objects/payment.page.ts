import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page object for the PaymentPanel component rendered inside a session page.
 *
 * PaymentPanel renders inside session-page-client.tsx when:
 *   - session.phase === 'PAYMENT', OR
 *   - session.phase === 'COMPLETE' AND URL has ?payment=success
 *
 * UI states covered:
 *   - default: "Pay Now" button visible
 *   - devBypass: "Skip Payment (Dev Mode)" button visible after clicking Pay Now
 *   - returningFromStripe: spinner + "Completing payment..." text
 *   - cancelled: yellow warning banner about cancelled payment
 *   - success: green card with "Payment complete!" text (isPaid=true)
 */
export class PaymentPage {
  readonly page: Page;

  // The outer card container for the payment panel
  readonly panel: Locator;

  // CTA buttons
  readonly payNowButton: Locator;
  readonly devCompleteButton: Locator;

  // State indicators
  readonly successCard: Locator;
  readonly completingSpinner: Locator;
  readonly cancelledBanner: Locator;
  readonly stripeBypassNotice: Locator;

  constructor(page: Page) {
    this.page = page;

    // PaymentPanel renders inside a bordered div with bg-muted/30
    // Use text content of known static labels to anchor locators
    this.panel = page.locator('[data-testid="payment-panel"]');

    // Buttons are identified by their stable visible text
    this.payNowButton = page.getByRole('button', { name: /pay now/i });
    this.devCompleteButton = page.getByRole('button', {
      name: /skip payment \(dev mode\)/i,
    });

    // Success state: green card with checkmark
    this.successCard = page.getByText('Payment complete!');

    // Return-from-Stripe spinner state
    this.completingSpinner = page.getByText('Completing payment...');

    // Cancelled banner
    this.cancelledBanner = page.getByText(
      /payment was cancelled/i,
    );

    // Dev bypass notice shown after clicking Pay Now when Stripe is not configured
    this.stripeBypassNotice = page.getByText(
      /stripe is not configured/i,
    );
  }

  /**
   * Navigate to a session page (standard path, no query params).
   * Waits for the connection status indicator before returning.
   */
  async gotoSession(sessionId: string) {
    await this.page.goto(`/app/session/${sessionId}`);
    await expect(
      this.page.getByTestId('connection-status'),
    ).toHaveAttribute('data-connected', 'true', { timeout: 15_000 });
  }

  /**
   * Navigate to the Stripe success return URL for a session.
   * This is the URL Stripe redirects to after a successful checkout.
   * The frontend shows a spinner while waiting for the payment:completed event.
   */
  async gotoSessionWithPaymentSuccess(sessionId: string) {
    await this.page.goto(`/app/session/${sessionId}?payment=success`);
    await expect(
      this.page.getByTestId('connection-status'),
    ).toHaveAttribute('data-connected', 'true', { timeout: 15_000 });
  }

  /**
   * Navigate to the Stripe cancelled return URL for a session.
   */
  async gotoSessionWithPaymentCancelled(sessionId: string) {
    await this.page.goto(`/app/session/${sessionId}?payment=cancelled`);
    await expect(
      this.page.getByTestId('connection-status'),
    ).toHaveAttribute('data-connected', 'true', { timeout: 15_000 });
  }

  /**
   * Assert the payment panel is visible in the default (unpaid) state.
   * Verifies the "Pay Now" button is present and enabled.
   */
  async expectDefaultState() {
    await expect(this.payNowButton).toBeVisible({ timeout: 5_000 });
    await expect(this.payNowButton).toBeEnabled();
  }

  /**
   * Assert the dev bypass state: Stripe bypass notice + "Skip Payment" button.
   * This appears after clicking Pay Now when Stripe is not configured.
   */
  async expectDevBypassState() {
    await expect(this.stripeBypassNotice).toBeVisible({ timeout: 5_000 });
    await expect(this.devCompleteButton).toBeVisible();
    await expect(this.devCompleteButton).toBeEnabled();
  }

  /**
   * Assert the returning-from-Stripe spinner state.
   * Shown when ?payment=success is in the URL but isPaid is still false.
   */
  async expectReturningFromStripeState() {
    await expect(this.completingSpinner).toBeVisible({ timeout: 5_000 });
  }

  /**
   * Assert the payment cancelled banner is visible.
   */
  async expectCancelledState() {
    await expect(this.cancelledBanner).toBeVisible({ timeout: 5_000 });
  }

  /**
   * Assert the success state: green card with "Payment complete!" text.
   */
  async expectSuccessState(timeout = 10_000) {
    await expect(this.successCard).toBeVisible({ timeout });
  }

  /**
   * Click "Pay Now" and wait for the UI to transition to dev bypass mode.
   * Assumes Stripe is not configured (devBypass response from backend).
   */
  async clickPayNowExpectingDevBypass() {
    await this.payNowButton.click();
    await this.expectDevBypassState();
  }

  /**
   * Click "Skip Payment (Dev Mode)" and wait for the mutation to fire.
   * The button shows "Processing..." while the API call is in flight.
   */
  async clickDevComplete() {
    await this.devCompleteButton.click();
    // Wait for the button to enter pending state then resolve
    // (it may be fast enough to skip the pending state entirely)
    await expect(this.devCompleteButton).toBeDisabled({ timeout: 3_000 }).catch(() => {
      // Button may already be gone (success transition) — that is also fine
    });
  }
}
