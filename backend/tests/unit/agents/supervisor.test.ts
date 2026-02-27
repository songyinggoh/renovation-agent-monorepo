import { describe, it, expect, vi } from 'vitest';
import { END } from '@langchain/langgraph';
import type { BudgetState } from '../../../src/agents/types.js';
import { createInitialBudgetState } from '../../../src/agents/types.js';

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

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
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

  describe('supervisorNode budget checks', () => {
    it('should set exceeded=true when budget hard cap exceeded', async () => {
      const { supervisorNode } = await import('../../../src/agents/supervisor.js');
      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: false,
        targetPhase: null,
        phaseResult: '',
        budgetState: {
          totalCostUsd: 6.0, // Exceeds hardCapUsd: 5.0
          byPhase: {},
          warnings: [],
          exceeded: false,
        },
      };

      const result = supervisorNode(state);
      expect(result.budgetState?.exceeded).toBe(true);
    });

    it('should add warning when budget soft cap exceeded', async () => {
      const { supervisorNode } = await import('../../../src/agents/supervisor.js');
      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: false,
        targetPhase: null,
        phaseResult: '',
        budgetState: {
          totalCostUsd: 3.5, // Between softCapUsd (3.0) and hardCapUsd (5.0)
          byPhase: {},
          warnings: [],
          exceeded: false,
        },
      };

      const result = supervisorNode(state);
      expect(result.budgetState?.warnings).toHaveLength(1);
      expect(result.budgetState?.warnings?.[0]).toContain('soft cap');
    });

    it('should pass through when under budget', async () => {
      const { supervisorNode } = await import('../../../src/agents/supervisor.js');
      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: false,
        targetPhase: null,
        phaseResult: '',
        budgetState: createInitialBudgetState(),
      };

      const result = supervisorNode(state);
      expect(result.budgetState).toBeUndefined();
    });
  });

  describe('phaseRouter budget checks', () => {
    it('should return END when budget exceeded', async () => {
      const { phaseRouter } = await import('../../../src/agents/supervisor.js');
      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: false,
        targetPhase: null,
        phaseResult: '',
        budgetState: {
          totalCostUsd: 6.0,
          byPhase: {},
          warnings: [],
          exceeded: true,
        } satisfies BudgetState,
      };

      const result = await phaseRouter(state);
      expect(result).toBe(END);
    });
  });

  describe('emitter integration', () => {
    it('supervisorNode should emit agent:start when budget OK', async () => {
      const { supervisorNode } = await import('../../../src/agents/supervisor.js');
      const mockEmit = vi.fn();
      const emitter = { emit: mockEmit };

      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: false,
        targetPhase: null,
        phaseResult: '',
        budgetState: createInitialBudgetState(),
      };

      supervisorNode(state, {
        configurable: { thread_id: 'test', emitter },
      } as never);

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'agent:start', phase: 'INTAKE', sessionId: 'test-session' }),
      );
    });

    it('transitionCheckNode should emit agent:complete', async () => {
      const { transitionCheckNode } = await import('../../../src/agents/supervisor.js');
      const mockEmit = vi.fn();
      const emitter = { emit: mockEmit };

      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: false,
        targetPhase: null,
        phaseResult: 'done',
        budgetState: createInitialBudgetState(),
      };

      transitionCheckNode(state, {
        configurable: { thread_id: 'test', emitter },
      } as never);

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'agent:complete', phase: 'INTAKE', result: 'done' }),
      );
    });

    it('should not throw when emitter is null', async () => {
      const { supervisorNode, transitionCheckNode } = await import('../../../src/agents/supervisor.js');

      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: false,
        targetPhase: null,
        phaseResult: '',
        budgetState: createInitialBudgetState(),
      };

      expect(() => supervisorNode(state, {
        configurable: { thread_id: 'test', emitter: null },
      } as never)).not.toThrow();

      expect(() => transitionCheckNode(state, {
        configurable: { thread_id: 'test', emitter: null },
      } as never)).not.toThrow();
    });
  });

  describe('phase transitions', () => {
    it('supervisorNode should apply transition (set currentPhase, clear flags)', async () => {
      const { supervisorNode } = await import('../../../src/agents/supervisor.js');

      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: true,
        targetPhase: 'CHECKLIST' as const,
        phaseResult: 'Intake complete',
        budgetState: createInitialBudgetState(),
      };

      const result = supervisorNode(state);

      expect(result.currentPhase).toBe('CHECKLIST');
      expect(result.transitionRequested).toBe(false);
      expect(result.targetPhase).toBeNull();
    });

    it('supervisorNode should emit agent:phase_transition on transition', async () => {
      const { supervisorNode } = await import('../../../src/agents/supervisor.js');
      const mockEmit = vi.fn();

      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: true,
        targetPhase: 'CHECKLIST' as const,
        phaseResult: 'Intake complete',
        budgetState: createInitialBudgetState(),
      };

      supervisorNode(state, {
        configurable: { thread_id: 'test', emitter: { emit: mockEmit } },
      } as never);

      expect(mockEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'agent:phase_transition',
          from: 'INTAKE',
          to: 'CHECKLIST',
        }),
      );
    });

    it('supervisorNode should skip transition when not requested', async () => {
      const { supervisorNode } = await import('../../../src/agents/supervisor.js');

      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: false,
        targetPhase: null,
        phaseResult: '',
        budgetState: createInitialBudgetState(),
      };

      const result = supervisorNode(state);

      expect(result.currentPhase).toBeUndefined();
      expect(result.transitionRequested).toBeUndefined();
    });

    it('transitionRouter should return supervisor for valid transition (INTAKE→CHECKLIST)', async () => {
      const { transitionRouter } = await import('../../../src/agents/supervisor.js');

      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: true,
        targetPhase: 'CHECKLIST' as const,
        phaseResult: '',
        budgetState: createInitialBudgetState(),
      };

      expect(transitionRouter(state)).toBe('supervisor');
    });

    it('transitionRouter should return END for invalid transition (INTAKE→RENDER)', async () => {
      const { transitionRouter } = await import('../../../src/agents/supervisor.js');

      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: true,
        targetPhase: 'RENDER' as const,
        phaseResult: '',
        budgetState: createInitialBudgetState(),
      };

      expect(transitionRouter(state)).toBe(END);
    });

    it('transitionRouter should return END when no transition requested', async () => {
      const { transitionRouter } = await import('../../../src/agents/supervisor.js');

      const state = {
        messages: [],
        sessionId: 'test-session',
        currentPhase: 'INTAKE' as const,
        transitionRequested: false,
        targetPhase: null,
        phaseResult: '',
        budgetState: createInitialBudgetState(),
      };

      expect(transitionRouter(state)).toBe(END);
    });
  });
});
