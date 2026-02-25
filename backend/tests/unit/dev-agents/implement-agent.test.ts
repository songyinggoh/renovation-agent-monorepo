import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (survive vi.mock hoisting) ────────────────────────────────

const { mockCreateReactAgent } = vi.hoisted(() => ({
  mockCreateReactAgent: vi.fn().mockReturnValue({
    name: 'implement-agent',
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

import { createImplementAgent } from '../../../src/dev-agents/implement/agent.js';
import { IMPLEMENT_AGENT_PROMPT } from '../../../src/dev-agents/implement/prompt.js';
import { devTools } from '../../../src/dev-agents/tools/index.js';
import { DEV_AGENT_NAMES } from '../../../src/dev-agents/types.js';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Implement Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateReactAgent.mockReturnValue({
      name: DEV_AGENT_NAMES.IMPLEMENT,
      tools: devTools,
    });
  });

  it('createImplementAgent returns an agent with name = DEV_AGENT_NAMES.IMPLEMENT', () => {
    const agent = createImplementAgent();
    expect(agent.name).toBe(DEV_AGENT_NAMES.IMPLEMENT);
    expect(agent.name).toBe('implement-agent');
  });

  it('passes devTools (10 tools) to createReactAgent', () => {
    createImplementAgent();

    expect(mockCreateReactAgent).toHaveBeenCalledOnce();
    const callArgs = mockCreateReactAgent.mock.calls[0]?.[0] as {
      tools: unknown[];
    };
    expect(callArgs.tools).toHaveLength(10);
    expect(callArgs.tools).toBe(devTools);
  });

  it('passes IMPLEMENT_AGENT_PROMPT to createReactAgent', () => {
    createImplementAgent();

    const callArgs = mockCreateReactAgent.mock.calls[0]?.[0] as {
      prompt: string;
    };
    expect(callArgs.prompt).toBe(IMPLEMENT_AGENT_PROMPT);
  });

  it('passes DEV_AGENT_NAMES.IMPLEMENT as agent name', () => {
    createImplementAgent();

    const callArgs = mockCreateReactAgent.mock.calls[0]?.[0] as {
      name: string;
    };
    expect(callArgs.name).toBe(DEV_AGENT_NAMES.IMPLEMENT);
  });

  it('calls createDevModel for the LLM', () => {
    createImplementAgent();

    const callArgs = mockCreateReactAgent.mock.calls[0]?.[0] as {
      llm: { modelName: string };
    };
    expect(callArgs.llm).toEqual({ modelName: 'mock-model' });
  });
});

describe('IMPLEMENT_AGENT_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof IMPLEMENT_AGENT_PROMPT).toBe('string');
    expect(IMPLEMENT_AGENT_PROMPT.length).toBeGreaterThan(0);
  });

  it('contains the branch safety guardrail: NEVER checkout main', () => {
    expect(IMPLEMENT_AGENT_PROMPT).toContain('NEVER checkout main');
  });

  it('mentions TDD: failing test', () => {
    expect(IMPLEMENT_AGENT_PROMPT.toLowerCase()).toContain('failing test');
  });

  it('mentions TDD: test first', () => {
    expect(IMPLEMENT_AGENT_PROMPT.toLowerCase()).toContain('test first');
  });

  it('mentions ESM .js extensions', () => {
    expect(IMPLEMENT_AGENT_PROMPT).toContain('.js');
    expect(IMPLEMENT_AGENT_PROMPT.toLowerCase()).toContain('esm');
  });

  it('mentions structured Logger (not console.log)', () => {
    expect(IMPLEMENT_AGENT_PROMPT).toContain('Logger');
    expect(IMPLEMENT_AGENT_PROMPT).toContain('console.log');
  });

  it('prohibits any types', () => {
    expect(IMPLEMENT_AGENT_PROMPT).toContain('any');
    expect(IMPLEMENT_AGENT_PROMPT.toLowerCase()).toContain('no `any` types');
  });

  it('mentions Zod for validation', () => {
    expect(IMPLEMENT_AGENT_PROMPT).toContain('Zod');
  });

  it('mentions vitest mock patterns', () => {
    expect(IMPLEMENT_AGENT_PROMPT).toContain('vi.mock');
  });

  it('mentions conventional commit format', () => {
    expect(IMPLEMENT_AGENT_PROMPT.toLowerCase()).toContain('conventional commit');
  });

  it('mentions git_commit tool', () => {
    expect(IMPLEMENT_AGENT_PROMPT).toContain('git_commit');
  });

  it('mentions dev-agent/ branch prefix requirement', () => {
    expect(IMPLEMENT_AGENT_PROMPT).toContain('dev-agent/');
  });
});
