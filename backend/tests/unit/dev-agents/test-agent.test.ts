import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock references ────────────────────────────────────────────────

const { mockCreateAgent, mockModel } = vi.hoisted(() => {
  const mockCreateAgent = vi.fn((opts: Record<string, unknown>) => opts);
  const mockModel = { modelName: 'claude-sonnet-4-20250514' };
  return { mockCreateAgent, mockModel };
});

// ── Mocks (BEFORE imports) ─────────────────────────────────────────────────

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../src/config/env.js', () => ({
  env: {
    ANTHROPIC_API_KEY: 'test-key-for-unit-tests',
  },
}));

vi.mock('langchain', () => ({
  createAgent: mockCreateAgent,
  toolCallLimitMiddleware: vi.fn(() => ({ name: 'tool_call_limit' })),
  modelCallLimitMiddleware: vi.fn(() => ({ name: 'model_call_limit' })),
  modelFallbackMiddleware: vi.fn(() => ({ name: 'model_fallback' })),
  createMiddleware: vi.fn((opts: Record<string, unknown>) => opts),
}));

vi.mock('../../../src/config/claude.js', () => ({
  createDevModel: vi.fn().mockReturnValue(mockModel),
}));

// ── Imports (AFTER mocks) ──────────────────────────────────────────────────

import { createTestAgent } from '../../../src/dev-agents/test/agent.js';
import { TEST_AGENT_PROMPT } from '../../../src/dev-agents/test/prompt.js';
import { DEV_AGENT_NAMES } from '../../../src/dev-agents/types.js';
import { devTools } from '../../../src/dev-agents/tools/index.js';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Test Specialist Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createTestAgent', () => {
    it('returns an agent with the correct name', () => {
      const agent = createTestAgent();
      expect(agent.name).toBe(DEV_AGENT_NAMES.TEST);
    });

    it('calls createAgent with correct parameters', () => {
      createTestAgent();

      expect(mockCreateAgent).toHaveBeenCalledOnce();
      expect(mockCreateAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          model: mockModel,
          tools: devTools,
          name: DEV_AGENT_NAMES.TEST,
          systemPrompt: TEST_AGENT_PROMPT,
        }),
      );
    });

    it('passes all 10 dev tools', () => {
      createTestAgent();

      const callArgs = mockCreateAgent.mock.calls[0]?.[0] as
        | { tools: unknown[] }
        | undefined;
      expect(callArgs?.tools).toHaveLength(10);
    });

    it('includes middleware stack', () => {
      const agent = createTestAgent();
      expect(agent.middleware).toBeDefined();
      expect(agent.middleware).toHaveLength(4);
    });
  });

  describe('TEST_AGENT_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(typeof TEST_AGENT_PROMPT).toBe('string');
      expect(TEST_AGENT_PROMPT.length).toBeGreaterThan(0);
    });

    it('mentions vitest', () => {
      expect(TEST_AGENT_PROMPT.toLowerCase()).toContain('vitest');
    });

    it('mentions test:unit command', () => {
      expect(TEST_AGENT_PROMPT).toContain('test:unit');
    });

    it('mentions coverage requirement', () => {
      expect(TEST_AGENT_PROMPT.toLowerCase()).toContain('coverage');
    });

    it('mentions vi.mock', () => {
      expect(TEST_AGENT_PROMPT).toContain('vi.mock');
    });

    it('mentions AAA pattern', () => {
      expect(TEST_AGENT_PROMPT).toContain('AAA');
      expect(TEST_AGENT_PROMPT).toContain('Arrange');
      expect(TEST_AGENT_PROMPT).toContain('Act');
      expect(TEST_AGENT_PROMPT).toContain('Assert');
    });

    it('mentions ESM .js extensions for mock paths', () => {
      expect(TEST_AGENT_PROMPT).toContain('.js');
    });

    it('mentions bash_exec tool for running tests', () => {
      expect(TEST_AGENT_PROMPT).toContain('bash_exec');
    });

    it('mentions file_read tool for reading test files', () => {
      expect(TEST_AGENT_PROMPT).toContain('file_read');
    });

    it('mentions file_edit tool for fixing issues', () => {
      expect(TEST_AGENT_PROMPT).toContain('file_edit');
    });
  });

  describe('DEV_AGENT_NAMES.TEST', () => {
    it('equals "test-agent"', () => {
      expect(DEV_AGENT_NAMES.TEST).toBe('test-agent');
    });
  });
});
