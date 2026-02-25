import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Renovation/i);
  });

  test('health endpoint returns 200', async ({ request }) => {
    const response = await request.get('http://localhost:3000/health');
    expect(response.ok()).toBe(true);

    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('readiness endpoint returns 200', async ({ request }) => {
    const response = await request.get('http://localhost:3000/health/ready');
    expect(response.ok()).toBe(true);
  });

  test('dashboard page loads', async ({ page }) => {
    await page.goto('/app');
    await page.waitForLoadState('networkidle');
    // Should see either the empty state or the session list
    const hasContent =
      (await page.getByText('Your renovation journey starts here').isVisible()) ||
      (await page.getByTestId('create-session').isVisible());
    expect(hasContent).toBe(true);
  });
});
