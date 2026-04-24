import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('langchain', () => ({
  createAgent: vi.fn((opts: Record<string, unknown>) => opts),
  toolCallLimitMiddleware: vi.fn(() => ({ name: 'tool_call_limit' })),
  modelCallLimitMiddleware: vi.fn(() => ({ name: 'model_call_limit' })),
  modelFallbackMiddleware: vi.fn(() => ({ name: 'model_fallback' })),
  createMiddleware: vi.fn((opts: Record<string, unknown>) => opts),
}));

vi.mock('../../../src/config/claude.js', () => ({
  createDevModel: vi.fn(() => ({ _type: 'mock-claude-model' })),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────

import { createAgent } from 'langchain';
import { createMigrationAgent } from '../../../src/dev-agents/migration/agent.js';
import { MIGRATION_AGENT_PROMPT } from '../../../src/dev-agents/migration/prompt.js';
import { writeTools } from '../../../src/dev-agents/tools/index.js';
import { DEV_AGENT_NAMES } from '../../../src/dev-agents/types.js';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('MigrationAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMigrationAgent', () => {
    it('returns an agent with the correct name', () => {
      const agent = createMigrationAgent();
      expect(agent.name).toBe(DEV_AGENT_NAMES.MIGRATION);
    });

    it('passes writeTools to createAgent', () => {
      createMigrationAgent();
      expect(createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: writeTools,
        }),
      );
    });

    it('uses the correct tool count (writeTools = 8)', () => {
      const agent = createMigrationAgent();
      const tools = agent.tools as unknown[];
      expect(tools).toHaveLength(8);
    });

    it('passes the migration prompt as systemPrompt', () => {
      createMigrationAgent();
      expect(createAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: MIGRATION_AGENT_PROMPT,
        }),
      );
    });

    it('calls createAgent exactly once', () => {
      createMigrationAgent();
      expect(createAgent).toHaveBeenCalledTimes(1);
    });

    it('includes middleware stack', () => {
      const agent = createMigrationAgent();
      expect(agent.middleware).toBeDefined();
      expect(agent.middleware).toHaveLength(4);
    });
  });

  describe('MIGRATION_AGENT_PROMPT', () => {
    it('is a non-empty string', () => {
      expect(typeof MIGRATION_AGENT_PROMPT).toBe('string');
      expect(MIGRATION_AGENT_PROMPT.length).toBeGreaterThan(0);
    });

    it('mentions "drizzle"', () => {
      expect(MIGRATION_AGENT_PROMPT.toLowerCase()).toContain('drizzle');
    });

    it('mentions "schema"', () => {
      expect(MIGRATION_AGENT_PROMPT.toLowerCase()).toContain('schema');
    });

    it('mentions "db:generate"', () => {
      expect(MIGRATION_AGENT_PROMPT).toContain('db:generate');
    });

    it('mentions "migration"', () => {
      expect(MIGRATION_AGENT_PROMPT.toLowerCase()).toContain('migration');
    });

    it('mentions ESM .js extensions', () => {
      expect(MIGRATION_AGENT_PROMPT).toContain('.js');
    });

    it('mentions JSONB validation', () => {
      expect(MIGRATION_AGENT_PROMPT.toLowerCase()).toContain('jsonb');
      expect(MIGRATION_AGENT_PROMPT.toLowerCase()).toContain('zod');
    });

    it('mentions AnyPgColumn for self-referencing FKs', () => {
      expect(MIGRATION_AGENT_PROMPT).toContain('AnyPgColumn');
    });

    it('mentions no any types', () => {
      expect(MIGRATION_AGENT_PROMPT.toLowerCase()).toContain('no `any` types');
    });

    it('describes the migration workflow', () => {
      expect(MIGRATION_AGENT_PROMPT).toContain('db:generate');
      expect(MIGRATION_AGENT_PROMPT).toContain('db:migrate');
    });
  });
});
