import { StateGraph, START, END } from '@langchain/langgraph';
import type { LangGraphRunnableConfig } from '@langchain/langgraph';
import type { RenovationPhase } from '@renovation/shared-types';
import { RenovationAnnotation, type RenovationState } from './state.js';
import { isPhaseEnabled } from './kill-switch.js';
import { checkBudget } from './budget-enforcer.js';
import { DEFAULT_SESSION_BUDGET } from './budget-enforcer.js';
import { getCheckpointer } from '../services/checkpointer.service.js';
import { createPhaseWorker } from './worker-factory.js';
import type { SessionBudget } from './types.js';
import type { AgentEventEmitter } from './agent-event-emitter.js';

/**
 * Configurable side-channel data passed via config.configurable.
 * Standard LangGraph pattern to avoid polluting graph state.
 */
export interface OrchestratorConfigurable {
  thread_id: string;
  sessionBudget?: SessionBudget;
  emitter?: AgentEventEmitter | null;
}

/**
 * Convert a phase name to its worker node name.
 */
export function routeByPhase(phase: RenovationPhase | string): string {
  return `${phase.toLowerCase()}_worker`;
}

/**
 * Supervisor node — deterministic routing based on currentPhase.
 * Performs budget check before routing to phase worker.
 */
export function supervisorNode(
  state: RenovationState,
  config?: LangGraphRunnableConfig,
): Partial<RenovationState> {
  const configurable = config?.configurable as OrchestratorConfigurable | undefined;
  const budget = configurable?.sessionBudget ?? DEFAULT_SESSION_BUDGET;
  const emitter = configurable?.emitter;
  const phase = state.currentPhase;

  // Budget check
  const budgetResult = checkBudget(state.budgetState, budget, phase);

  if (!budgetResult.allowed) {
    return {
      budgetState: {
        ...state.budgetState,
        exceeded: true,
      },
    };
  }

  if (budgetResult.warning) {
    emitter?.emit({
      type: 'agent:budget_warning',
      currentCostUsd: state.budgetState.totalCostUsd,
      limitUsd: budget.softCapUsd,
    });
    return {
      budgetState: {
        ...state.budgetState,
        warnings: [...state.budgetState.warnings, budgetResult.warning],
      },
    };
  }

  // Emit agent:start when budget is OK and we're about to dispatch
  emitter?.emit({
    type: 'agent:start',
    phase,
    sessionId: state.sessionId,
  });

  return {};
}

/**
 * Phase router — returns the worker node name based on currentPhase.
 * Checks budget exceeded and kill switch before routing.
 */
export async function phaseRouter(state: RenovationState): Promise<string> {
  // Budget exceeded — end immediately
  if (state.budgetState.exceeded) {
    return END;
  }

  const phase = state.currentPhase;

  // Kill switch check
  const enabled = await isPhaseEnabled(phase);
  if (!enabled) {
    return END;
  }

  return routeByPhase(phase);
}

/**
 * Transition check node — emits agent:complete and stores state for routing.
 */
export function transitionCheckNode(
  state: RenovationState,
  config?: LangGraphRunnableConfig,
): Partial<RenovationState> {
  const configurable = config?.configurable as OrchestratorConfigurable | undefined;
  const emitter = configurable?.emitter;

  emitter?.emit({
    type: 'agent:complete',
    phase: state.currentPhase,
    result: state.phaseResult,
  });

  return {};
}

/**
 * Transition router — decides whether to loop back to supervisor or end.
 */
export function transitionRouter(state: RenovationState): string {
  if (state.transitionRequested && state.targetPhase) {
    return 'supervisor';
  }
  return END;
}

/**
 * Create the supervisor graph.
 * Returns a compiled graph ready for .stream() or .invoke().
 */
export function createSupervisorGraph() {
  const workflow = new StateGraph(RenovationAnnotation)
    .addNode('supervisor', supervisorNode)
    .addNode('intake_worker', createPhaseWorker('INTAKE'))
    .addNode('checklist_worker', createPhaseWorker('CHECKLIST'))
    .addNode('plan_worker', createPhaseWorker('PLAN'))
    .addNode('render_worker', createPhaseWorker('RENDER'))
    .addNode('payment_worker', createPhaseWorker('PAYMENT'))
    .addNode('complete_worker', createPhaseWorker('COMPLETE'))
    .addNode('iterate_worker', createPhaseWorker('ITERATE'))
    .addNode('transition_check', transitionCheckNode)
    // START -> supervisor
    .addEdge(START, 'supervisor')
    // supervisor -> phase worker (conditional)
    .addConditionalEdges('supervisor', phaseRouter, {
      intake_worker: 'intake_worker',
      checklist_worker: 'checklist_worker',
      plan_worker: 'plan_worker',
      render_worker: 'render_worker',
      payment_worker: 'payment_worker',
      complete_worker: 'complete_worker',
      iterate_worker: 'iterate_worker',
      [END]: END,
    })
    // All workers -> transition_check
    .addEdge('intake_worker', 'transition_check')
    .addEdge('checklist_worker', 'transition_check')
    .addEdge('plan_worker', 'transition_check')
    .addEdge('render_worker', 'transition_check')
    .addEdge('payment_worker', 'transition_check')
    .addEdge('complete_worker', 'transition_check')
    .addEdge('iterate_worker', 'transition_check')
    // transition_check -> supervisor (loop) or END
    .addConditionalEdges('transition_check', transitionRouter, {
      supervisor: 'supervisor',
      [END]: END,
    });

  const checkpointer = getCheckpointer();
  return workflow.compile({ checkpointer });
}
