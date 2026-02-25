import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (survive vi.mock hoisting) ────────────────────────────────

const { mockCreateReactAgent } = vi.hoisted(() => ({
  mockCreateReactAgent: vi.fn().mockReturnValue({
    name: 'research-agent',
    tools: [],
  }),
}));

// ── Mocks (must come before imports) ─────────────────────────────────────────

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: mockCreateReactAgent,
}));

vi.mock('../../../src/config/claude.js', () => ({
  createDevModel: vi.fn().mockReturnValue({ modelName: 'mock-model' }),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { createResearchAgent } from '../../../src/dev-agents/research/agent.js';
import { RESEARCH_AGENT_PROMPT } from '../../../src/dev-agents/research/prompt.js';
import { readOnlyTools } from '../../../src/dev-agents/tools/index.js';
import { DEV_AGENT_NAMES } from '../../../src/dev-agents/types.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Research Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateReactAgent.mockReturnValue({
      name: DEV_AGENT_NAMES.RESEARCH,
      tools: readOnlyTools,
    });
  });

  it('createResearchAgent returns an agent with name = DEV_AGENT_NAMES.RESEARCH', () => {
    const agent = createResearchAgent();
    expect(agent.name).toBe(DEV_AGENT_NAMES.RESEARCH);
    expect(agent.name).toBe('research-agent');
  });

  it('passes readOnlyTools (5 tools) to createReactAgent', () => {
    createResearchAgent();

    expect(mockCreateReactAgent).toHaveBeenCalledOnce();
    const callArgs = mockCreateReactAgent.mock.calls[0]?.[0] as {
      tools: unknown[];
    };
    expect(callArgs.tools).toHaveLength(5);
    expect(callArgs.tools).toBe(readOnlyTools);
  });

  it('passes RESEARCH_AGENT_PROMPT to createReactAgent', () => {
    createResearchAgent();

    const callArgs = mockCreateReactAgent.mock.calls[0]?.[0] as {
      prompt: string;
    };
    expect(callArgs.prompt).toBe(RESEARCH_AGENT_PROMPT);
  });

  it('passes DEV_AGENT_NAMES.RESEARCH as agent name', () => {
    createResearchAgent();

    const callArgs = mockCreateReactAgent.mock.calls[0]?.[0] as {
      name: string;
    };
    expect(callArgs.name).toBe(DEV_AGENT_NAMES.RESEARCH);
  });

  it('calls createDevModel for the LLM', () => {
    createResearchAgent();

    const callArgs = mockCreateReactAgent.mock.calls[0]?.[0] as {
      llm: { modelName: string };
    };
    expect(callArgs.llm).toEqual({ modelName: 'mock-model' });
  });
});

describe('RESEARCH_AGENT_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof RESEARCH_AGENT_PROMPT).toBe('string');
    expect(RESEARCH_AGENT_PROMPT.length).toBeGreaterThan(0);
  });

  it('mentions codebase_search tool', () => {
    expect(RESEARCH_AGENT_PROMPT).toContain('codebase_search');
  });

  it('mentions problem statement in output format', () => {
    expect(RESEARCH_AGENT_PROMPT.toLowerCase()).toContain('problem statement');
  });

  it('mentions solution vectors in output format', () => {
    expect(RESEARCH_AGENT_PROMPT.toLowerCase()).toContain('solution vectors');
  });

  it('mentions file_find tool', () => {
    expect(RESEARCH_AGENT_PROMPT).toContain('file_find');
  });

  it('mentions file_read tool', () => {
    expect(RESEARCH_AGENT_PROMPT).toContain('file_read');
  });

  it('mentions read-only constraint', () => {
    expect(RESEARCH_AGENT_PROMPT).toContain('READ-ONLY');
  });

  it('mentions recommended approach in output format', () => {
    expect(RESEARCH_AGENT_PROMPT.toLowerCase()).toContain('recommended approach');
  });

  it('mentions files to modify in output format', () => {
    expect(RESEARCH_AGENT_PROMPT.toLowerCase()).toContain('files to modify');
  });
});
