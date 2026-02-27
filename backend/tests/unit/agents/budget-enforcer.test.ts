import { describe, it, expect } from 'vitest';
import type { BudgetState, SessionBudget } from '../../../src/agents/types.js';

describe('budget-enforcer', () => {
  it('should export DEFAULT_SESSION_BUDGET with correct values', async () => {
    const { DEFAULT_SESSION_BUDGET } = await import('../../../src/agents/budget-enforcer.js');
    expect(DEFAULT_SESSION_BUDGET.hardCapUsd).toBe(5.0);
    expect(DEFAULT_SESSION_BUDGET.softCapUsd).toBe(3.0);
    expect(DEFAULT_SESSION_BUDGET.perPhaseCapUsd).toBe(2.0);
  });

  it('should allow dispatch when under budget', async () => {
    const { checkBudget } = await import('../../../src/agents/budget-enforcer.js');
    const budget: SessionBudget = { hardCapUsd: 1.0, softCapUsd: 0.8 };
    const state: BudgetState = { totalCostUsd: 0.5, byPhase: {}, warnings: [], exceeded: false };
    const result = checkBudget(state, budget);
    expect(result.allowed).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('should warn when soft cap exceeded', async () => {
    const { checkBudget } = await import('../../../src/agents/budget-enforcer.js');
    const budget: SessionBudget = { hardCapUsd: 1.0, softCapUsd: 0.8 };
    const state: BudgetState = { totalCostUsd: 0.85, byPhase: {}, warnings: [], exceeded: false };
    const result = checkBudget(state, budget);
    expect(result.allowed).toBe(true);
    expect(result.warning).toContain('soft cap');
  });

  it('should block when hard cap exceeded', async () => {
    const { checkBudget } = await import('../../../src/agents/budget-enforcer.js');
    const budget: SessionBudget = { hardCapUsd: 1.0, softCapUsd: 0.8 };
    const state: BudgetState = { totalCostUsd: 1.05, byPhase: {}, warnings: [], exceeded: false };
    const result = checkBudget(state, budget);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('hard cap');
  });

  it('should block phase when per-phase cap exceeded', async () => {
    const { checkBudget } = await import('../../../src/agents/budget-enforcer.js');
    const budget: SessionBudget = { hardCapUsd: 5.0, softCapUsd: 4.0, perPhaseCapUsd: 0.5 };
    const state: BudgetState = {
      totalCostUsd: 1.0,
      byPhase: { INTAKE: { costUsd: 0.6, invocations: 10 } },
      warnings: [],
      exceeded: false,
    };
    const result = checkBudget(state, budget, 'INTAKE');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('phase cap');
  });

  it('should allow phase under per-phase cap', async () => {
    const { checkBudget } = await import('../../../src/agents/budget-enforcer.js');
    const budget: SessionBudget = { hardCapUsd: 5.0, softCapUsd: 4.0, perPhaseCapUsd: 0.5 };
    const state: BudgetState = {
      totalCostUsd: 1.0,
      byPhase: { INTAKE: { costUsd: 0.3, invocations: 5 } },
      warnings: [],
      exceeded: false,
    };
    const result = checkBudget(state, budget, 'INTAKE');
    expect(result.allowed).toBe(true);
  });

  it('recordCost should update budget state correctly', async () => {
    const { recordCost, createInitialBudgetState } = await import('../../../src/agents/budget-enforcer.js');
    let state = createInitialBudgetState();
    state = recordCost(state, 'INTAKE', 0.05);
    state = recordCost(state, 'INTAKE', 0.03);
    state = recordCost(state, 'CHECKLIST', 0.10);
    expect(state.totalCostUsd).toBeCloseTo(0.18);
    expect(state.byPhase.INTAKE.costUsd).toBeCloseTo(0.08);
    expect(state.byPhase.INTAKE.invocations).toBe(2);
    expect(state.byPhase.CHECKLIST.costUsd).toBeCloseTo(0.10);
    expect(state.byPhase.CHECKLIST.invocations).toBe(1);
  });
});
