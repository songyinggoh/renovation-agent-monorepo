import { test, expect } from '../fixtures/base.fixture';

test.describe('Session CRUD', () => {
  let createdSessionId: string | undefined;

  test.afterAll(async ({ api }) => {
    if (createdSessionId) {
      await api.deleteSession(createdSessionId).catch(() => {});
    }
  });

  test('create session from dashboard', async ({ dashboardPage, page }) => {
    await dashboardPage.goto();
    createdSessionId = await dashboardPage.createSession();

    // Should be on the session page
    expect(page.url()).toContain(`/app/session/${createdSessionId}`);
  });

  test('session appears in dashboard list', async ({ dashboardPage, api }) => {
    // Create a session via API for speed
    const session = await api.createSession('E2E Test Session List');
    createdSessionId = session.id;

    await dashboardPage.goto();

    // Wait for session list to load
    await expect(dashboardPage.sessionItems.first()).toBeVisible({ timeout: 10_000 });

    const count = await dashboardPage.getSessionCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('navigate to session from list', async ({ dashboardPage, page, api }) => {
    const session = await api.createSession('E2E Test Navigate');
    createdSessionId = session.id;

    await dashboardPage.goto();
    await expect(dashboardPage.sessionItems.first()).toBeVisible({ timeout: 10_000 });

    // Click the first session
    await dashboardPage.clickSession(0);

    // Should be on a session page
    expect(page.url()).toMatch(/\/app\/session\/.+/);
  });

  test('navigate back to dashboard from session', async ({ sessionPage, page, api }) => {
    const session = await api.createSession('E2E Test Back Navigation');
    createdSessionId = session.id;

    await sessionPage.goto(session.id);
    await sessionPage.goBack();

    expect(page.url()).toContain('/app');
  });
});
