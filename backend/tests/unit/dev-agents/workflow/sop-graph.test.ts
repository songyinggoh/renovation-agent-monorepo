import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before imports

vi.mock('../../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../../src/utils/execFileNoThrow.js', () => ({
  execFileNoThrow: vi.fn(),
}));

vi.mock('../../../../src/services/checkpointer.service.js', () => ({
  getCheckpointer: vi.fn(() => ({ type: 'mock-checkpointer' })),
}));

// Mock all specialist agent factories
const mockInvoke = vi.fn();
const mockCompiledGraph = { name: 'mock-compiled-graph' };
const mockReactAgent = {
  graph: mockCompiledGraph,
  invoke: mockInvoke,
};

vi.mock('../../../../src/dev-agents/scaffold/agent.js', () => ({
  createScaffoldAgent: vi.fn(() => mockReactAgent),
}));
vi.mock('../../../../src/dev-agents/migration/agent.js', () => ({
  createMigrationAgent: vi.fn(() => mockReactAgent),
}));
vi.mock('../../../../src/dev-agents/test/agent.js', () => ({
  createTestAgent: vi.fn(() => mockReactAgent),
}));
vi.mock('../../../../src/dev-agents/review/agent.js', () => ({
  createReviewAgent: vi.fn(() => mockReactAgent),
}));
vi.mock('../../../../src/dev-agents/research/agent.js', () => ({
  createResearchAgent: vi.fn(() => mockReactAgent),
}));
vi.mock('../../../../src/dev-agents/implement/agent.js', () => ({
  createImplementAgent: vi.fn(() => mockReactAgent),
}));

vi.mock('../../../../src/dev-agents/guards.js', () => ({
  ensureDevBranch: vi.fn(() => Promise.resolve('dev-agent/test-task')),
}));

vi.mock('../../../../src/dev-agents/workflow/quality-gates.js', () => ({
  runQualityGates: vi.fn(() => Promise.resolve({ passed: true, output: 'all passed' })),
}));

import {
  SOPState,
  createSOPWorkflow,
  MAX_TEST_RETRIES,
} from '../../../../src/dev-agents/workflow/sop-graph.js';

describe('SOPState', () => {
  it('defines all required state fields', () => {
    expect(SOPState).toBeDefined();
    // SOPState is an Annotation.Root — it's an object with spec
    expect(SOPState.spec).toBeDefined();
  });
});

describe('MAX_TEST_RETRIES', () => {
  it('is 3', () => {
    expect(MAX_TEST_RETRIES).toBe(3);
  });
});

describe('createSOPWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a compiled graph', () => {
    const graph = createSOPWorkflow();
    expect(graph).toBeDefined();
    // CompiledStateGraph should have getGraph method
    expect(typeof graph.getGraph).toBe('function');
  });

  it('graph has the expected node names', () => {
    const graph = createSOPWorkflow();
    const drawable = graph.getGraph();
    const nodeIds = Object.keys(drawable.nodes);

    expect(nodeIds).toContain('ensure_branch');
    expect(nodeIds).toContain('research');
    expect(nodeIds).toContain('create_plan');
    expect(nodeIds).toContain('await_approval');
    expect(nodeIds).toContain('implement');
    expect(nodeIds).toContain('run_tests');
    expect(nodeIds).toContain('quality_gates');
    expect(nodeIds).toContain('review');
    expect(nodeIds).toContain('complete');
  });

  it('graph includes __start__ and __end__', () => {
    const graph = createSOPWorkflow();
    const drawable = graph.getGraph();
    const nodeIds = Object.keys(drawable.nodes);

    expect(nodeIds).toContain('__start__');
    expect(nodeIds).toContain('__end__');
  });
});
