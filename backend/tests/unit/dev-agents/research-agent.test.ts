import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (survive vi.mock hoisting) ────────────────────────────────

const { mockCreateAgent } = vi.hoisted(() => ({
  mockCreateAgent: vi.fn((opts: Record<string, unknown>) => opts),
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

vi.mock('langchain', () => ({
  createAgent: mockCreateAgent,
  toolCallLimitMiddleware: vi.fn(() => ({ name: 'tool_call_limit' })),
  modelCallLimitMiddleware: vi.fn(() => ({ name: 'model_call_limit' })),
  modelFallbackMiddleware: vi.fn(() => ({ name: 'model_fallback' })),
  createMiddleware: vi.fn((opts: Record<string, unknown>) => opts),
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
  });

  it('createResearchAgent returns an agent with name = DEV_AGENT_NAMES.RESEARCH', () => {
    const agent = createResearchAgent();
    expect(agent.name).toBe(DEV_AGENT_NAMES.RESEARCH);
    expect(agent.name).toBe('research-agent');
  });

  it('passes readOnlyTools (5 tools) to createAgent', () => {
    createResearchAgent();

    expect(mockCreateAgent).toHaveBeenCalledOnce();
    const callArgs = mockCreateAgent.mock.calls[0]?.[0] as {
      tools: unknown[];
    };
    expect(callArgs.tools).toHaveLength(5);
    expect(callArgs.tools).toBe(readOnlyTools);
  });

  it('passes RESEARCH_AGENT_PROMPT as systemPrompt', () => {
    createResearchAgent();

    const callArgs = mockCreateAgent.mock.calls[0]?.[0] as {
      systemPrompt: string;
    };
    expect(callArgs.systemPrompt).toBe(RESEARCH_AGENT_PROMPT);
  });

  it('passes DEV_AGENT_NAMES.RESEARCH as agent name', () => {
    createResearchAgent();

    const callArgs = mockCreateAgent.mock.calls[0]?.[0] as {
      name: string;
    };
    expect(callArgs.name).toBe(DEV_AGENT_NAMES.RESEARCH);
  });

  it('calls createDevModel for the model', () => {
    createResearchAgent();

    const callArgs = mockCreateAgent.mock.calls[0]?.[0] as {
      model: { modelName: string };
    };
    expect(callArgs.model).toEqual({ modelName: 'mock-model' });
  });

  it('includes middleware stack', () => {
    const agent = createResearchAgent();
    expect(agent.middleware).toBeDefined();
    expect(agent.middleware).toHaveLength(4);
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
