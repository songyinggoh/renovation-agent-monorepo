/**
 * Phase 3.1 Render Pipeline Verification Script
 *
 * Runs 3 live tests against the backend with Gemini API:
 *   A. From-scratch render (prompt-only generation)
 *   B. Edit-existing render (reference image + prompt)
 *   C. Content policy rejection (safety filter trigger)
 *
 * Usage: npx tsx e2e/scripts/verify-render-pipeline.ts
 * Requires: backend running on localhost:3000 with Redis + BullMQ worker
 */

import { io, type Socket } from 'socket.io-client';

const API_BASE = process.env.API_BASE ?? 'http://localhost:3000';
const LONG_TIMEOUT_MS = 120_000;
const SHORT_TIMEOUT_MS = 60_000;
const HEALTH_POLL_INTERVAL_MS = 2_000;
const HEALTH_MAX_WAIT_MS = 30_000;

// A small public-domain image for edit_existing mode
const SAMPLE_IMAGE_URL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Golde33443.jpg/220px-Golde33443.jpg';

// ─── Helpers ────────────────────────────────────────────────────────

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

const results: TestResult[] = [];

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

function log(msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}

function logStep(msg: string) {
  log(`  -> ${msg}`);
}

/** Wait for a specific Socket.io event with a timeout. */
function waitForEvent<T>(
  socket: Socket,
  event: string,
  filter: (data: T) => boolean,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout waiting for ${label} (${timeoutMs}ms)`));
    }, timeoutMs);

    function handler(data: T) {
      if (filter(data)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(data);
      }
    }

    socket.on(event, handler);
  });
}

/** Collect all instances of an event matching a filter until a stopper resolves. */
function collectEvents<T>(
  socket: Socket,
  event: string,
  filter: (data: T) => boolean,
  stopper: Promise<unknown>,
): T[] {
  const collected: T[] = [];
  function handler(data: T) {
    if (filter(data)) collected.push(data);
  }
  socket.on(event, handler);
  stopper.finally(() => socket.off(event, handler));
  return collected;
}

// ─── Setup & Teardown ───────────────────────────────────────────────

async function waitForBackend(): Promise<void> {
  log('Waiting for backend health...');
  const deadline = Date.now() + HEALTH_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${API_BASE}/health/ready`);
      if (res.ok) {
        log('Backend is ready');
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }
  throw new Error(`Backend not ready after ${HEALTH_MAX_WAIT_MS}ms`);
}

async function createTestSession(): Promise<{ sessionId: string; roomId: string }> {
  log('Creating test session and room...');

  const session = await fetchJson<{ id: string }>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ title: `Render Verify ${Date.now()}`, totalBudget: 50000 }),
  });
  logStep(`Session created: ${session.id}`);

  const room = await fetchJson<{ id: string }>(`/api/sessions/${session.id}/rooms`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Kitchen', type: 'kitchen' }),
  });
  logStep(`Room created: ${room.id}`);

  return { sessionId: session.id, roomId: room.id };
}

function connectSocket(sessionId: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(API_BASE, {
      transports: ['websocket'],
      auth: {},
      reconnection: false,
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket.io connection timeout'));
    }, 10_000);

    socket.on('connect', () => {
      logStep(`Socket connected: ${socket.id}`);
      socket.emit('chat:join_session', { sessionId });

      // Give the server a moment to join the room
      setTimeout(() => {
        clearTimeout(timer);
        logStep(`Joined session room: session:${sessionId}`);
        resolve(socket);
      }, 500);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Socket connect error: ${err.message}`));
    });
  });
}

async function deleteSession(sessionId: string): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/sessions/${sessionId}`, { method: 'DELETE' });
    logStep(`Session ${sessionId} deleted`);
  } catch {
    logStep(`Warning: failed to delete session ${sessionId}`);
  }
}

// ─── Tests ──────────────────────────────────────────────────────────

async function testFromScratch(
  socket: Socket,
  sessionId: string,
  roomId: string,
): Promise<void> {
  log('TEST A: From-scratch render');
  const start = Date.now();

  const { assetId } = await fetchJson<{ assetId: string; jobId: string }>(
    `/api/rooms/${roomId}/renders`,
    {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        mode: 'from_scratch',
        prompt: 'Modern minimalist kitchen renovation with white marble countertops, light oak cabinets, and pendant lighting',
      }),
    },
  );
  logStep(`Render requested: assetId=${assetId}`);

  const matchAsset = (d: { assetId: string }) => d.assetId === assetId;

  // Collect progress events while waiting for completion
  const completePromise = waitForEvent<{
    assetId: string;
    roomId: string;
    sessionId: string;
    contentType: string;
    sizeBytes: number;
    model: string;
  }>(socket, 'render:complete', matchAsset, LONG_TIMEOUT_MS, 'render:complete');

  const progressEvents = collectEvents<{
    assetId: string;
    progress: number;
    stage: string;
    sessionId: string;
    roomId: string;
  }>(socket, 'render:progress', matchAsset, completePromise);

  // Also wait for started
  const startedPromise = waitForEvent<{ assetId: string; sessionId: string; roomId: string }>(
    socket,
    'render:started',
    matchAsset,
    LONG_TIMEOUT_MS,
    'render:started',
  );

  const startedData = await startedPromise;
  logStep('render:started received');

  // Validate started payload
  assert(startedData.sessionId === sessionId, `started.sessionId: expected ${sessionId}, got ${startedData.sessionId}`);
  assert(startedData.roomId === roomId, `started.roomId: expected ${roomId}, got ${startedData.roomId}`);
  assert(startedData.assetId === assetId, `started.assetId mismatch`);

  const completeData = await completePromise;
  logStep(`render:complete received (${progressEvents.length} progress events)`);

  // Validate complete payload
  assert(completeData.sessionId === sessionId, `complete.sessionId mismatch`);
  assert(completeData.roomId === roomId, `complete.roomId mismatch`);
  assert(typeof completeData.contentType === 'string' && completeData.contentType.length > 0, 'missing contentType');
  assert(typeof completeData.sizeBytes === 'number' && completeData.sizeBytes > 0, 'missing/zero sizeBytes');
  assert(typeof completeData.model === 'string' && completeData.model.length > 0, 'missing model');
  logStep(`Model: ${completeData.model}, Size: ${completeData.sizeBytes} bytes, Type: ${completeData.contentType}`);

  // Validate progress events include sessionId
  for (const p of progressEvents) {
    assert(p.sessionId === sessionId, `progress.sessionId mismatch at ${p.progress}%`);
    assert(p.roomId === roomId, `progress.roomId mismatch at ${p.progress}%`);
  }

  // Verify render appears in GET list with status ready
  const { renders } = await fetchJson<{ renders: Array<{ id: string; status: string }> }>(
    `/api/rooms/${roomId}/renders`,
  );
  const found = renders.find((r) => r.id === assetId);
  assert(found !== undefined, `Render ${assetId} not found in GET list`);
  assert(found.status === 'ready', `Render status: expected 'ready', got '${found.status}'`);
  logStep('GET /renders confirms status=ready');

  const elapsed = Date.now() - start;
  results.push({ name: 'A. From-scratch render', passed: true, durationMs: elapsed });
  log(`TEST A PASSED (${(elapsed / 1000).toFixed(1)}s)`);
}

async function testEditExisting(
  socket: Socket,
  sessionId: string,
  roomId: string,
): Promise<void> {
  log('TEST B: Edit-existing render (reference image)');
  const start = Date.now();

  const { assetId } = await fetchJson<{ assetId: string; jobId: string }>(
    `/api/rooms/${roomId}/renders`,
    {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        mode: 'edit_existing',
        baseImageUrl: SAMPLE_IMAGE_URL,
        prompt: 'Transform this room with modern Scandinavian style, keep the layout but update materials and colors',
      }),
    },
  );
  logStep(`Render requested (edit mode): assetId=${assetId}`);

  const matchAsset = (d: { assetId: string }) => d.assetId === assetId;

  const completePromise = waitForEvent<{
    assetId: string;
    roomId: string;
    sessionId: string;
    contentType: string;
    sizeBytes: number;
    model: string;
  }>(socket, 'render:complete', matchAsset, LONG_TIMEOUT_MS, 'render:complete (edit)');

  await waitForEvent<{ assetId: string }>(
    socket,
    'render:started',
    matchAsset,
    LONG_TIMEOUT_MS,
    'render:started (edit)',
  );
  logStep('render:started received');

  const completeData = await completePromise;
  logStep(`render:complete received — model=${completeData.model}, size=${completeData.sizeBytes}`);

  assert(completeData.sessionId === sessionId, 'complete.sessionId mismatch (edit)');
  assert(completeData.sizeBytes > 0, 'zero sizeBytes (edit)');

  // Verify in DB
  const { renders } = await fetchJson<{ renders: Array<{ id: string; status: string }> }>(
    `/api/rooms/${roomId}/renders`,
  );
  const found = renders.find((r) => r.id === assetId);
  assert(found !== undefined, 'Edit render not found in GET list');
  assert(found.status === 'ready', `Edit render status: expected 'ready', got '${found.status}'`);
  logStep('GET /renders confirms status=ready');

  const elapsed = Date.now() - start;
  results.push({ name: 'B. Edit-existing render', passed: true, durationMs: elapsed });
  log(`TEST B PASSED (${(elapsed / 1000).toFixed(1)}s)`);
}

async function testContentPolicyRejection(
  socket: Socket,
  sessionId: string,
  roomId: string,
): Promise<void> {
  log('TEST C: Content policy rejection');
  const start = Date.now();

  const { assetId } = await fetchJson<{ assetId: string; jobId: string }>(
    `/api/rooms/${roomId}/renders`,
    {
      method: 'POST',
      body: JSON.stringify({
        sessionId,
        mode: 'from_scratch',
        // Prompt designed to trigger Gemini safety filters
        prompt: 'Generate a photorealistic image of dangerous weapons, explosives, and harmful devices in a residential setting',
      }),
    },
  );
  logStep(`Render requested (policy test): assetId=${assetId}`);

  const matchAsset = (d: { assetId: string }) => d.assetId === assetId;

  // We expect render:failed, NOT render:complete
  let gotComplete = false;
  const completeWatcher = (data: { assetId: string }) => {
    if (data.assetId === assetId) gotComplete = true;
  };
  socket.on('render:complete', completeWatcher);

  try {
    const failedData = await waitForEvent<{
      assetId: string;
      roomId: string;
      sessionId: string;
      error: string;
    }>(socket, 'render:failed', matchAsset, SHORT_TIMEOUT_MS, 'render:failed (policy)');

    logStep(`render:failed received: "${failedData.error}"`);

    assert(failedData.sessionId === sessionId, 'failed.sessionId mismatch');
    assert(failedData.roomId === roomId, 'failed.roomId mismatch');
    assert(
      failedData.error.toLowerCase().includes('content policy'),
      `Expected error to contain "content policy", got: "${failedData.error}"`,
    );

    // Wait a moment to confirm no render:complete follows
    await new Promise((r) => setTimeout(r, 2_000));
    assert(!gotComplete, 'Unexpected render:complete after content policy rejection');
    logStep('No render:complete followed (correct)');

    const elapsed = Date.now() - start;
    results.push({ name: 'C. Content policy rejection', passed: true, durationMs: elapsed });
    log(`TEST C PASSED (${(elapsed / 1000).toFixed(1)}s)`);
  } finally {
    socket.off('render:complete', completeWatcher);
  }
}

// ─── Assertion helper ───────────────────────────────────────────────

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Phase 3.1 Render Pipeline Verification ===\n');
  console.log(`Backend: ${API_BASE}`);
  console.log('');

  await waitForBackend();

  const { sessionId, roomId } = await createTestSession();
  let socket: Socket | undefined;

  try {
    socket = await connectSocket(sessionId);

    // Run tests sequentially (they share the same room)
    try {
      await testFromScratch(socket, sessionId, roomId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: 'A. From-scratch render', passed: false, durationMs: 0, error: msg });
      log(`TEST A FAILED: ${msg}`);
    }

    try {
      await testEditExisting(socket, sessionId, roomId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: 'B. Edit-existing render', passed: false, durationMs: 0, error: msg });
      log(`TEST B FAILED: ${msg}`);
    }

    try {
      await testContentPolicyRejection(socket, sessionId, roomId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: 'C. Content policy rejection', passed: false, durationMs: 0, error: msg });
      log(`TEST C FAILED: ${msg}`);
    }
  } finally {
    // Cleanup
    log('Cleaning up...');
    if (socket) socket.disconnect();
    await deleteSession(sessionId);
  }

  // ── Summary ──
  console.log('\n=== Summary ===\n');
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  for (const r of results) {
    const icon = r.passed ? 'PASS' : 'FAIL';
    const time = r.durationMs > 0 ? ` (${(r.durationMs / 1000).toFixed(1)}s)` : '';
    console.log(`  [${icon}] ${r.name}${time}`);
    if (r.error) console.log(`         ${r.error}`);
  }

  console.log(`\n  ${passed}/${total} tests passed\n`);

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
