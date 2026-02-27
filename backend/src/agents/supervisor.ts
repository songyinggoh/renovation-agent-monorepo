import { StateGraph, START, END } from '@langchain/langgraph';
import type { RenovationPhase } from '@renovation/shared-types';
import { RenovationAnnotation, type RenovationState } from './state.js';
import { isPhaseEnabled } from './kill-switch.js';
import { getCheckpointer } from '../services/checkpointer.service.js';
import { createPhaseWorker } from './worker-factory.js';

/**
 * Convert a phase name to its worker node name.
 */
export function routeByPhase(phase: RenovationPhase | string): string {
  return `${phase.toLowerCase()}_worker`;
}

/**
 * Supervisor node — deterministic routing based on currentPhase.
 * No LLM call here; phase is known from the database.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function supervisorNode(state: RenovationState): Partial<RenovationState> {
  // Supervisor is a pass-through — routing is handled by conditional edges
  return {};
}

/**
 * Phase router — returns the worker node name based on currentPhase.
 * Checks kill switch before routing.
 */
async function phaseRouter(state: RenovationState): Promise<string> {
  const phase = state.currentPhase;

  // Kill switch check
  const enabled = await isPhaseEnabled(phase);
  if (!enabled) {
    return END;
  }

  return routeByPhase(phase);
}

/**
 * Transition check node — pass-through that stores state for routing.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function transitionCheckNode(state: RenovationState): Partial<RenovationState> {
  return {};
}

/**
 * Transition router — decides whether to loop back to supervisor or end.
 */
function transitionRouter(state: RenovationState): string {
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
