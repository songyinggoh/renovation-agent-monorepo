import { describe, it, expect, vi } from 'vitest';

// Mock all external dependencies
vi.mock('../../../src/config/gemini.js', () => ({
  createStreamingModel: vi.fn().mockReturnValue({
    bindTools: vi.fn().mockReturnValue({ invoke: vi.fn() }),
    traceAttributes: {},
  }),
}));

vi.mock('../../../src/services/checkpointer.service.js', () => ({
  getCheckpointer: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../src/config/redis.js', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    status: 'ready',
  },
}));

vi.mock('../../../src/tools/index.js', () => ({
  renovationTools: [
    { name: 'save_intake_state' },
    { name: 'get_style_examples' },
    { name: 'search_products' },
    { name: 'save_checklist_state' },
    { name: 'save_product_recommendation' },
    { name: 'generate_render' },
    { name: 'save_renders_state' },
  ],
}));

vi.mock('../../../src/config/prompts.js', () => ({
  getSystemPrompt: vi.fn().mockReturnValue('You are a renovation assistant.'),
}));

describe('supervisor', () => {
  it('should export createSupervisorGraph function', async () => {
    const { createSupervisorGraph } = await import('../../../src/agents/supervisor.js');
    expect(typeof createSupervisorGraph).toBe('function');
  });

  it('should create a compiled graph', async () => {
    const { createSupervisorGraph } = await import('../../../src/agents/supervisor.js');
    const graph = createSupervisorGraph();
    expect(graph).toBeDefined();
    // LangGraph compiled graphs have getGraph() method
    expect(typeof graph.getGraph).toBe('function');
  });

  it('routeByPhase should return the correct worker node name', async () => {
    const { routeByPhase } = await import('../../../src/agents/supervisor.js');
    expect(routeByPhase('INTAKE')).toBe('intake_worker');
    expect(routeByPhase('CHECKLIST')).toBe('checklist_worker');
    expect(routeByPhase('RENDER')).toBe('render_worker');
  });
});
