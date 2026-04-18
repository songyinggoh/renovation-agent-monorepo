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

  /**
   * Force a session into a specific phase via the dev-only phase override endpoint.
   * Only available when NODE_ENV !== 'production'.
   * Used by payment E2E tests to set up PAYMENT phase without running the AI agent.
   */
  async setSessionPhase(
    sessionId: string,
    phase: 'INTAKE' | 'CHECKLIST' | 'PLAN' | 'RENDER' | 'PAYMENT' | 'COMPLETE' | 'ITERATE',
  ): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/dev/sessions/${sessionId}/phase`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase }),
      },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Failed to set session phase to ${phase}: ${response.status} ${body}`,
      );
    }
  }

  /**
   * Trigger dev-complete payment bypass.
   * Sets isPaid=true and advances session to COMPLETE phase.
   * Emits payment:completed and session:phase_changed Socket.io events.
   * Only available when NODE_ENV !== 'production'.
   */
  async devCompletePayment(
    sessionId: string,
  ): Promise<{ devBypass: boolean; sessionId: string }> {
    const response = await fetch(
      `${this.baseUrl}/api/payments/dev-complete/${sessionId}`,
      { method: 'POST' },
    );
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Failed to dev-complete payment: ${response.status} ${body}`,
      );
    }
    return response.json();
  }

  /**
   * Poll GET /api/payments/status/:sessionId until isPaid is true or timeout.
   * Used after devCompletePayment to confirm the DB write propagated before
   * navigating to the session page.
   */
  async waitForPaymentStatus(
    sessionId: string,
    options: { isPaid?: boolean; timeoutMs?: number } = {},
  ): Promise<{ isPaid: boolean; phase: string }> {
    const { isPaid: expectedPaid = true, timeoutMs = 10_000 } = options;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const response = await fetch(
        `${this.baseUrl}/api/payments/status/${sessionId}`,
      );
      if (response.ok) {
        const data = (await response.json()) as { isPaid: boolean; phase: string };
        if (data.isPaid === expectedPaid) return data;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(
      `Timed out waiting for payment status isPaid=${String(expectedPaid)} on session ${sessionId}`,
    );
  }
}
