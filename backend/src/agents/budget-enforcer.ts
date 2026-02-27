import type { BudgetState, SessionBudget } from './types.js';

export { createInitialBudgetState } from './types.js';

/**
 * Default budget for a session when no custom budget is provided.
 */
export const DEFAULT_SESSION_BUDGET: SessionBudget = {
  hardCapUsd: 5.0,
  softCapUsd: 3.0,
  perPhaseCapUsd: 2.0,
};

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  warning?: string;
}

/**
 * Check whether a phase dispatch is within budget.
 * Returns { allowed, reason?, warning? }.
 */
export function checkBudget(
  state: BudgetState,
  budget: SessionBudget,
  phase?: string,
): BudgetCheckResult {
  // Hard cap — absolute stop
  if (state.totalCostUsd >= budget.hardCapUsd) {
    return {
      allowed: false,
      reason: `Budget hard cap exceeded: $${state.totalCostUsd.toFixed(4)} >= $${budget.hardCapUsd.toFixed(2)}`,
    };
  }

  // Per-phase cap
  if (phase && budget.perPhaseCapUsd) {
    const phaseCost = state.byPhase[phase]?.costUsd ?? 0;
    if (phaseCost >= budget.perPhaseCapUsd) {
      return {
        allowed: false,
        reason: `Phase ${phase} phase cap exceeded: $${phaseCost.toFixed(4)} >= $${budget.perPhaseCapUsd.toFixed(2)}`,
      };
    }
  }

  // Soft cap — warn but allow
  if (state.totalCostUsd >= budget.softCapUsd) {
    return {
      allowed: true,
      warning: `Budget soft cap exceeded: $${state.totalCostUsd.toFixed(4)} >= $${budget.softCapUsd.toFixed(2)}`,
    };
  }

  return { allowed: true };
}

/**
 * Immutably update budget state with a new cost entry.
 */
export function recordCost(state: BudgetState, phase: string, costUsd: number): BudgetState {
  const existing = state.byPhase[phase] ?? { costUsd: 0, invocations: 0 };
  return {
    ...state,
    totalCostUsd: state.totalCostUsd + costUsd,
    byPhase: {
      ...state.byPhase,
      [phase]: {
        costUsd: existing.costUsd + costUsd,
        invocations: existing.invocations + 1,
      },
    },
  };
}
