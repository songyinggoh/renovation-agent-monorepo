import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted() so mock fns are available when vi.mock factories run (hoisted)
const {
  mockCreateDevModel,
  mockCreateDevReviewModel,
  mockCreateReactAgent,
} = vi.hoisted(() => ({
  mockCreateDevModel: vi.fn(() => ({ modelName: 'mock-sonnet' })),
  mockCreateDevReviewModel: vi.fn(() => ({ modelName: 'mock-opus' })),
  mockCreateReactAgent: vi.fn(
    (config: { llm: unknown; tools: unknown[]; name: string; prompt: string }) => ({
      name: config.name,
      tools: config.tools,
      llm: config.llm,
      prompt: config.prompt,
    })
  ),
}));

// Mock logger to prevent structured log output during tests
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock claude config to verify which model factory is called
vi.mock('../../../src/config/claude.js', () => ({
  createDevModel: mockCreateDevModel,
  createDevReviewModel: mockCreateDevReviewModel,
  CLAUDE_MODELS: {
    SONNET: 'claude-sonnet-4-20250514',
    OPUS: 'claude-opus-4-20250514',
  },
}));

// Mock createReactAgent to capture the config passed to it
vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: mockCreateReactAgent,
}));

import { createReviewAgent } from '../../../src/dev-agents/review/agent.js';
import { REVIEW_AGENT_PROMPT } from '../../../src/dev-agents/review/prompt.js';
import { readOnlyTools } from '../../../src/dev-agents/tools/index.js';
import { DEV_AGENT_NAMES } from '../../../src/dev-agents/types.js';

// ── Agent factory ────────────────────────────────────────────────────────────

describe('createReviewAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an object with name = DEV_AGENT_NAMES.REVIEW', () => {
    const agent = createReviewAgent();
    expect(agent.name).toBe(DEV_AGENT_NAMES.REVIEW);
    expect(agent.name).toBe('review-agent');
  });

  it('passes the correct tool count (readOnlyTools.length = 5)', () => {
    const agent = createReviewAgent();
    expect(agent.tools).toHaveLength(5);
    expect(agent.tools).toBe(readOnlyTools);
  });

  it('uses createDevReviewModel (Opus), not createDevModel (Sonnet)', () => {
    createReviewAgent();
    expect(mockCreateDevReviewModel).toHaveBeenCalledTimes(1);
    expect(mockCreateDevModel).not.toHaveBeenCalled();
  });

  it('passes REVIEW_AGENT_PROMPT to createReactAgent', () => {
    createReviewAgent();
    expect(mockCreateReactAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: REVIEW_AGENT_PROMPT,
      })
    );
  });

  it('passes all required config to createReactAgent', () => {
    createReviewAgent();
    expect(mockCreateReactAgent).toHaveBeenCalledWith({
      llm: { modelName: 'mock-opus' },
      tools: readOnlyTools,
      name: DEV_AGENT_NAMES.REVIEW,
      prompt: REVIEW_AGENT_PROMPT,
    });
  });
});

// ── Prompt content ───────────────────────────────────────────────────────────

describe('REVIEW_AGENT_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof REVIEW_AGENT_PROMPT).toBe('string');
    expect(REVIEW_AGENT_PROMPT.length).toBeGreaterThan(0);
  });

  it('contains READ-ONLY instruction', () => {
    expect(REVIEW_AGENT_PROMPT).toMatch(/READ-ONLY|read-only/);
  });

  it('mentions "any" types review criterion', () => {
    expect(REVIEW_AGENT_PROMPT).toContain('any');
    // Specifically check for the type safety standard
    expect(REVIEW_AGENT_PROMPT).toMatch(/[Nn]o\s+`any`\s+types/);
  });

  it('mentions Logger review criterion', () => {
    expect(REVIEW_AGENT_PROMPT).toContain('Logger');
  });

  it('mentions ESM review criterion', () => {
    expect(REVIEW_AGENT_PROMPT).toContain('ESM');
  });

  it('mentions .js extension requirement', () => {
    expect(REVIEW_AGENT_PROMPT).toContain('.js');
  });

  it('lists the allowed read-only tools', () => {
    expect(REVIEW_AGENT_PROMPT).toContain('file_read');
    expect(REVIEW_AGENT_PROMPT).toContain('codebase_search');
    expect(REVIEW_AGENT_PROMPT).toContain('file_find');
    expect(REVIEW_AGENT_PROMPT).toContain('git_status');
    expect(REVIEW_AGENT_PROMPT).toContain('git_diff');
  });

  it('lists the forbidden write tools', () => {
    expect(REVIEW_AGENT_PROMPT).toContain('file_write');
    expect(REVIEW_AGENT_PROMPT).toContain('file_edit');
    expect(REVIEW_AGENT_PROMPT).toContain('bash_exec');
    expect(REVIEW_AGENT_PROMPT).toContain('git_commit');
    expect(REVIEW_AGENT_PROMPT).toContain('git_branch');
  });

  it('includes structured report format with all required sections', () => {
    expect(REVIEW_AGENT_PROMPT).toContain('Critical');
    expect(REVIEW_AGENT_PROMPT).toContain('Important');
    expect(REVIEW_AGENT_PROMPT).toContain('Suggestions');
    expect(REVIEW_AGENT_PROMPT).toContain('What Was Done Well');
  });

  it('includes security review criteria', () => {
    expect(REVIEW_AGENT_PROMPT).toMatch(/command injection/i);
    expect(REVIEW_AGENT_PROMPT).toMatch(/SQL injection/i);
  });

  it('includes promise handling criteria', () => {
    expect(REVIEW_AGENT_PROMPT).toMatch(/floating promises/i);
  });

  it('includes conventional commits criteria', () => {
    expect(REVIEW_AGENT_PROMPT).toMatch(/Conventional Commits/i);
  });
});
