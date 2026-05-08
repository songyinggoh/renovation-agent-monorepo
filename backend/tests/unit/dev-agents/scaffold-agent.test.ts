import { describe, it, expect, vi } from 'vitest';

// Mock external dependencies before importing modules under test
vi.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: vi.fn(({ name, tools, prompt }: {
    name: string;
    tools: unknown[];
    prompt: string;
  }) => ({
    name,
    tools,
    prompt,
  })),
}));

vi.mock('../../../src/config/claude.js', () => ({
  createDevModel: vi.fn(() => ({ modelName: 'mock-claude' })),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { createScaffoldAgent } from '../../../src/dev-agents/scaffold/agent.js';
import { SCAFFOLD_AGENT_PROMPT } from '../../../src/dev-agents/scaffold/prompt.js';
import { DEV_AGENT_NAMES } from '../../../src/dev-agents/types.js';
import { writeTools } from '../../../src/dev-agents/tools/index.js';

// ── createScaffoldAgent ──────────────────────────────────────────────────────

describe('createScaffoldAgent', () => {
  it('returns an agent with the correct name', () => {
    // Arrange & Act
    const agent = createScaffoldAgent();

    // Assert
    expect(agent.name).toBe(DEV_AGENT_NAMES.SCAFFOLD);
  });

  it('returns an agent with name matching "scaffold-agent"', () => {
    // Arrange & Act
    const agent = createScaffoldAgent();

    // Assert
    expect(agent.name).toBe('scaffold-agent');
  });

  it('passes writeTools to the agent (8 tools)', () => {
    // Arrange & Act
    const agent = createScaffoldAgent();

    // Assert
    expect(agent.tools).toHaveLength(8);
    expect(agent.tools).toBe(writeTools);
  });

  it('passes the scaffold prompt to the agent', () => {
    // Arrange & Act
    const agent = createScaffoldAgent();

    // Assert
    expect(agent.prompt).toBe(SCAFFOLD_AGENT_PROMPT);
  });
});

// ── SCAFFOLD_AGENT_PROMPT ────────────────────────────────────────────────────

describe('SCAFFOLD_AGENT_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof SCAFFOLD_AGENT_PROMPT).toBe('string');
    expect(SCAFFOLD_AGENT_PROMPT.length).toBeGreaterThan(0);
  });

  it('instructs the agent to use codebase_search', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('codebase_search');
  });

  it('instructs the agent to use file_write', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('file_write');
  });

  it('instructs the agent to use file_read', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('file_read');
  });

  it('instructs the agent to use file_find', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('file_find');
  });

  it('instructs the agent to run lint', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('lint');
  });

  it('mentions ESM with .js extensions', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('.js');
    expect(SCAFFOLD_AGENT_PROMPT).toContain('ESM');
  });

  it('mentions structured Logger (not console.log)', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('Logger');
    expect(SCAFFOLD_AGENT_PROMPT).toContain('console.log');
  });

  it('mentions Zod schemas for validation', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('Zod');
  });

  it('mentions no any types', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('any');
  });

  it('mentions conventional commit messages', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('Conventional commit');
  });

  it('mentions Vitest testing patterns', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('Vitest');
    expect(SCAFFOLD_AGENT_PROMPT).toContain('vi.mock');
    expect(SCAFFOLD_AGENT_PROMPT).toContain('vi.fn');
  });

  it('mentions AAA pattern', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('AAA');
  });

  it('mentions bash_exec for running lint', () => {
    expect(SCAFFOLD_AGENT_PROMPT).toContain('bash_exec');
  });
});
