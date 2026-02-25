import { ApiHelper } from './helpers/api-helper';

async function globalTeardown() {
  const api = new ApiHelper('http://localhost:3000');

  try {
    const { sessions } = await api.listSessions();
    const testSessions = sessions.filter((s) => s.title.startsWith('E2E Test'));

    for (const session of testSessions) {
      try {
        await api.deleteSession(session.id);
      } catch {
        // Best-effort cleanup
      }
    }

    if (testSessions.length > 0) {
      console.log(`Cleaned up ${testSessions.length} test session(s)`);
    }
  } catch {
    // Backend may already be shut down
  }
}

export default globalTeardown;
