import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly createSessionButton: Locator;
  readonly sessionItems: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createSessionButton = page.getByTestId('create-session');
    this.sessionItems = page.getByTestId('session-item');
  }

  async goto() {
    await this.page.goto('/app');
    await this.page.waitForLoadState('networkidle');
  }

  async createSession(): Promise<string> {
    await this.createSessionButton.click();
    await this.page.waitForURL(/\/app\/session\/.+/);
    const url = this.page.url();
    const sessionId = url.split('/session/')[1]?.split('?')[0];
    if (!sessionId) {
      throw new Error(`Could not extract sessionId from URL: ${url}`);
    }
    return sessionId;
  }

  async getSessionCount(): Promise<number> {
    return this.sessionItems.count();
  }

  async clickSession(index: number) {
    await this.sessionItems.nth(index).click();
    await this.page.waitForURL(/\/app\/session\/.+/);
  }

  async expectEmptyState() {
    await expect(this.page.getByText('Your renovation journey starts here')).toBeVisible();
  }
}
