import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/config/gemini.js', () => ({
  createStreamingModel: vi.fn().mockReturnValue({
    bindTools: vi.fn().mockReturnValue({ invoke: vi.fn() }),
    traceAttributes: {},
  }),
}));

vi.mock('../../../src/config/redis.js', () => ({
  redis: { get: vi.fn().mockResolvedValue(null), status: 'ready' },
}));

const TEST_SESSION_ID = '00000000-0000-4000-8000-000000000001';

describe('worker-factory', () => {
  it('should export createPhaseWorker function', async () => {
    const { createPhaseWorker } = await import('../../../src/agents/worker-factory.js');
    expect(typeof createPhaseWorker).toBe('function');
  }, 15_000);

  it('should create a react-style worker for INTAKE', async () => {
    const { createPhaseWorker } = await import('../../../src/agents/worker-factory.js');
    const worker = createPhaseWorker('INTAKE');
    expect(worker).toBeDefined();
    expect(typeof worker).toBe('function');
  });

  it('should create a plan-act-style worker for CHECKLIST', async () => {
    const { createPhaseWorker } = await import('../../../src/agents/worker-factory.js');
    const worker = createPhaseWorker('CHECKLIST');
    expect(worker).toBeDefined();
    expect(typeof worker).toBe('function');
  });

  it('should create a deterministic-style worker for RENDER', async () => {
    const { createPhaseWorker } = await import('../../../src/agents/worker-factory.js');
    const worker = createPhaseWorker('RENDER');
    expect(worker).toBeDefined();
    expect(typeof worker).toBe('function');
  });

  it('should inject persona into system prompt', async () => {
    const { buildPhasePrompt } = await import('../../../src/agents/worker-factory.js');
    const prompt = buildPhasePrompt('INTAKE', TEST_SESSION_ID);
    expect(prompt).toContain('Renovation Intake Specialist');
    expect(prompt).toContain('renovation vision');
  });
});
