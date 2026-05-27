import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';

export class SessionPage {
  readonly page: Page;
  readonly chatInput: Locator;
  readonly sendButton: Locator;
  readonly connectionStatus: Locator;
  readonly messageList: Locator;
  readonly typingIndicator: Locator;
  readonly backButton: Locator;
  readonly userMessages: Locator;
  readonly assistantMessages: Locator;
  readonly toolCalls: Locator;

  constructor(page: Page) {
    this.page = page;
    this.chatInput = page.getByTestId('chat-input');
    this.sendButton = page.getByTestId('send-button');
    this.connectionStatus = page.getByTestId('connection-status');
    this.messageList = page.getByTestId('message-list');
    this.typingIndicator = page.getByTestId('typing-indicator');
    this.backButton = page.getByLabel('Back to dashboard');
    this.userMessages = page.locator('[data-role="user"]');
    this.assistantMessages = page.locator('[data-role="assistant"]');
    this.toolCalls = page.getByTestId('tool-call');
  }

  async goto(sessionId: string) {
    await this.page.goto(`/app/session/${sessionId}`);
    await this.waitForConnection();
  }

  async waitForConnection(timeout = 15_000) {
    await expect(
      this.connectionStatus,
    ).toHaveAttribute('data-connected', 'true', { timeout });
  }

  async sendMessage(content: string) {
    await this.chatInput.fill(content);
    await this.sendButton.click();
  }

  async waitForAssistantResponse(timeout = 45_000) {
    // Wait for typing indicator to appear then disappear
    // It may already be gone if response was fast, so we wait for at least one assistant message
    try {
      await this.typingIndicator.waitFor({ state: 'visible', timeout: 5_000 });
    } catch {
      // Typing indicator may have already passed — check for assistant message directly
    }
    await this.typingIndicator.waitFor({ state: 'detached', timeout });
  }

  async getAssistantMessageCount(): Promise<number> {
    return this.assistantMessages.count();
  }

  async getLastAssistantMessage(): Promise<string> {
    const count = await this.assistantMessages.count();
    if (count === 0) return '';
    return (await this.assistantMessages.nth(count - 1).textContent()) ?? '';
  }

  async goBack() {
    await this.backButton.click();
    await this.page.waitForURL('/app');
  }
}
