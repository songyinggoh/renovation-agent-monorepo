/**
 * Direct REST API helper for E2E test setup and teardown.
 * Bypasses the UI for speed — creates/deletes sessions programmatically.
 */
export class ApiHelper {
  constructor(private baseUrl: string) {}

  async createSession(title?: string): Promise<{ id: string }> {
    const response = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title ?? `E2E Test Session ${Date.now()}`,
        totalBudget: 50000,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async listSessions(): Promise<{ sessions: Array<{ id: string; title: string }> }> {
    const response = await fetch(`${this.baseUrl}/api/sessions`);
    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.status}`);
    }
    return response.json();
  }

  async deleteSession(sessionId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete session: ${response.status}`);
    }
  }

  async healthReady(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health/ready`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
