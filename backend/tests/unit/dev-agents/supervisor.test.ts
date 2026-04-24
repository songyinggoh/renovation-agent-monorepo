import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all specialist agent factories — each returns an object with a .graph property
// that simulates a CompiledStateGraph (which is what createSupervisor expects)
const mockCompiledGraph = { name: 'mock-compiled-graph' };
const mockReactAgent = { graph: mockCompiledGraph };

vi.mock('../../../src/dev-agents/scaffold/agent.js', () => ({
  createScaffoldAgent: vi.fn(() => mockReactAgent),
}));
vi.mock('../../../src/dev-agents/migration/agent.js', () => ({
  createMigrationAgent: vi.fn(() => mockReactAgent),
}));
vi.mock('../../../src/dev-agents/test/agent.js', () => ({
  createTestAgent: vi.fn(() => mockReactAgent),
}));
vi.mock('../../../src/dev-agents/review/agent.js', () => ({
  createReviewAgent: vi.fn(() => mockReactAgent),
}));
vi.mock('../../../src/dev-agents/research/agent.js', () => ({
  createResearchAgent: vi.fn(() => mockReactAgent),
}));
vi.mock('../../../src/dev-agents/implement/agent.js', () => ({
  createImplementAgent: vi.fn(() => mockReactAgent),
}));

// Mock createSupervisor to return a mock StateGraph with .compile()
const mockCompile = vi.fn(() => ({ name: 'compiled-supervisor' }));
const mockStateGraph = { compile: mockCompile };

vi.mock('@langchain/langgraph-supervisor', () => ({
  createSupervisor: vi.fn(() => mockStateGraph),
}));

vi.mock('../../../src/config/claude.js', () => ({
  createDevModel: vi.fn(() => ({ modelName: 'mock-claude-supervisor' })),
}));

vi.mock('../../../src/services/checkpointer.service.js', () => ({
  getCheckpointer: vi.fn(() => ({ type: 'mock-checkpointer' })),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { createDevSupervisor, DEV_SUPERVISOR_PROMPT } from '../../../src/dev-agents/supervisor.js';
import { createSupervisor } from '@langchain/langgraph-supervisor';
import { DEV_AGENT_NAMES } from '../../../src/dev-agents/types.js';

describe('createDevSupervisor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createSupervisor with 6 specialist agents', () => {
    createDevSupervisor();
    expect(createSupervisor).toHaveBeenCalledTimes(1);

    const args = vi.mocked(createSupervisor).mock.calls[0][0];
    expect(args.agents).toHaveLength(6);
  });

  it('passes compiled graphs (agent.graph) not raw agents', () => {
    createDevSupervisor();
    const args = vi.mocked(createSupervisor).mock.calls[0][0];

    // Each agent entry should be the mockCompiledGraph (from agent.graph)
    for (const agent of args.agents) {
      expect(agent).toBe(mockCompiledGraph);
    }
  });

  it('uses last_message output mode', () => {
    createDevSupervisor();
    const args = vi.mocked(createSupervisor).mock.calls[0][0];
    expect(args.outputMode).toBe('last_message');
  });

  it('sets includeAgentName to inline for non-OpenAI models', () => {
    createDevSupervisor();
    const args = vi.mocked(createSupervisor).mock.calls[0][0];
    expect(args.includeAgentName).toBe('inline');
  });

  it('sets supervisorName from DEV_AGENT_NAMES', () => {
    createDevSupervisor();
    const args = vi.mocked(createSupervisor).mock.calls[0][0];
    expect(args.supervisorName).toBe(DEV_AGENT_NAMES.SUPERVISOR);
  });

  it('compiles the graph with the shared checkpointer', () => {
    createDevSupervisor();
    expect(mockCompile).toHaveBeenCalledTimes(1);
    expect(mockCompile).toHaveBeenCalledWith({
      checkpointer: { type: 'mock-checkpointer' },
    });
  });

  it('returns the compiled supervisor graph', () => {
    const result = createDevSupervisor();
    expect(result).toEqual({ name: 'compiled-supervisor' });
  });
});

describe('DEV_SUPERVISOR_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof DEV_SUPERVISOR_PROMPT).toBe('string');
    expect(DEV_SUPERVISOR_PROMPT.length).toBeGreaterThan(0);
  });

  it('mentions all 6 specialist agent names', () => {
    expect(DEV_SUPERVISOR_PROMPT).toContain('scaffold');
    expect(DEV_SUPERVISOR_PROMPT).toContain('migration');
    expect(DEV_SUPERVISOR_PROMPT).toContain('test');
    expect(DEV_SUPERVISOR_PROMPT).toContain('review');
    expect(DEV_SUPERVISOR_PROMPT).toContain('research');
    expect(DEV_SUPERVISOR_PROMPT).toContain('implement');
  });

  it('describes routing rules', () => {
    expect(DEV_SUPERVISOR_PROMPT).toContain('route');
  });

  it('instructs single agent per turn', () => {
    expect(DEV_SUPERVISOR_PROMPT.toLowerCase()).toContain('one');
  });
});
