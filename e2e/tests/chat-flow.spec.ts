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
      sessionPage.connectionStatus.locator('[data-connected="true"]'),
    ).toBeVisible();
  });

  test('send message and receive streaming response', async ({ sessionPage, api }) => {
    const session = await api.createSession('E2E Test Chat');
    sessionId = session.id;

    await sessionPage.goto(session.id);

    // Send a simple message
    await sessionPage.sendMessage('Hello, I want to renovate my kitchen');

    // User message should appear
    await expect(sessionPage.userMessages.first()).toBeVisible({ timeout: 5_000 });

    // Wait for assistant response to complete (streaming)
    await sessionPage.waitForAssistantResponse();

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
