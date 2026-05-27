import type { Page } from '@playwright/test';

/**
 * Waits for the AI streaming response to complete.
 *
 * Detects the "done" state by monitoring when the typing indicator
 * disappears and the assistant message stabilizes.
 */
export async function waitForStreamComplete(
  page: Page,
  options: { timeout?: number } = {},
): Promise<void> {
  const { timeout = 45_000 } = options;

  // Wait for the typing indicator to disappear
  await page
    .locator('[data-testid="typing-indicator"]')
    .waitFor({ state: 'detached', timeout });
}

/**
 * Waits for a specific text to appear in the message list.
 * Useful for asserting tool call indicators or specific response content.
 */
export async function waitForMessageContaining(
  page: Page,
  text: string,
  timeout = 30_000,
): Promise<void> {
  await page
    .locator('[data-testid="message-list"]')
    .getByText(text)
    .first()
    .waitFor({ state: 'visible', timeout });
}

/**
 * Waits for at least N assistant messages to appear in the message list.
 */
export async function waitForAssistantMessages(
  page: Page,
  count: number,
  timeout = 45_000,
): Promise<void> {
  await page
    .locator('[data-role="assistant"]')
    .nth(count - 1)
    .waitFor({ state: 'visible', timeout });
}
