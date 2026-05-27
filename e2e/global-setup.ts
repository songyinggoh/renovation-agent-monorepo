async function globalSetup() {
  const maxRetries = 30;
  const retryDelay = 1000;
  const backendUrl = 'http://localhost:3000/health/ready';

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(backendUrl);
      if (response.ok) {
        console.log(`Backend ready after ${i + 1} attempt(s)`);
        return;
      }
    } catch {
      // Server not up yet
    }
    await new Promise((r) => setTimeout(r, retryDelay));
  }

  throw new Error(`Backend did not become ready at ${backendUrl} within ${maxRetries}s`);
}

export default globalSetup;
