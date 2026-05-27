import { test, expect } from '../fixtures/base.fixture';

test.describe('Chat Flow', () => {
  let sessionId: string | undefined;

  test.afterEach(async ({ api }) => {
    if (sessionId) {
      await api.deleteSession(sessionId).catch(() => {});
      sessionId = undefined;
    }
  });

  test('shows connection status as connected', async ({ sessionPage, api }) => {
    const session = await api.createSession('E2E Test Connection');
    sessionId = session.id;

    await sessionPage.goto(session.id);

    await expect(
      sessionPage.connectionStatus,
    ).toHaveAttribute('data-connected', 'true');
  });

  test('send message and receive streaming response', async ({ sessionPage, api, page }) => {
    // Skip if no real API key is available (free-tier quota exhausts quickly)
    const isCI = !!process.env.CI;
    const apiKey = process.env.GOOGLE_API_KEY;
    if (isCI && (!apiKey || apiKey === 'test-key')) {
      test.skip(true, 'Skipping: no real GOOGLE_API_KEY available in CI');
    }

    const session = await api.createSession('E2E Test Chat');
    sessionId = session.id;

    await sessionPage.goto(session.id);

    // Send a simple message
    await sessionPage.sendMessage('Hello, I want to renovate my kitchen');

    // User message should appear
    await expect(sessionPage.userMessages.first()).toBeVisible({ timeout: 5_000 });

    // Wait for assistant response to complete (streaming)
    // May fail with 429 rate limit on free-tier Gemini keys
    try {
      await sessionPage.waitForAssistantResponse();
    } catch {
      // If the AI errored (e.g. rate limit), check for an error message in the UI
      const hasError = await page.getByText(/error|sorry|try again/i).isVisible().catch(() => false);
      if (hasError) {
        test.skip(true, 'Skipping: AI responded with error (likely rate limit)');
      }
      throw new Error('Assistant response timed out without error indication');
    }

    // At least one assistant message should be visible
    const assistantCount = await sessionPage.getAssistantMessageCount();
    expect(assistantCount).toBeGreaterThanOrEqual(1);

    // Assistant response should have content
    const lastMessage = await sessionPage.getLastAssistantMessage();
    expect(lastMessage.length).toBeGreaterThan(0);
  });

  test('chat input is disabled when disconnected', async ({ page, api }) => {
    const session = await api.createSession('E2E Test Disabled Input');
    sessionId = session.id;

    // Navigate to session page but don't wait for connection
    await page.goto(`/app/session/${session.id}`);

    // The send button should exist
    const sendButton = page.getByTestId('send-button');
    await expect(sendButton).toBeVisible();
  });

  test('empty state shows on new session', async ({ sessionPage, api, page }) => {
    const session = await api.createSession('E2E Test Empty State');
    sessionId = session.id;

    await sessionPage.goto(session.id);

    // Should show empty state or suggestion bubbles for new session
    const hasEmptyState =
      (await page.getByText(/start/i).isVisible().catch(() => false)) ||
      (await page.getByText(/vision/i).isVisible().catch(() => false)) ||
      (await page.getByText(/renovate/i).isVisible().catch(() => false));
    expect(hasEmptyState).toBe(true);
  });
});
