import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import type { RenovationPhase } from '@renovation/shared-types';
import type { BudgetState } from './types.js';
import { createInitialBudgetState } from './types.js';

/**
 * RenovationAnnotation defines the full state shape for the supervisor graph.
 *
 * - messages: Chat message history (uses LangGraph's built-in reducer for append/merge)
 * - currentPhase: Which renovation phase the session is in
 * - sessionId: The session UUID (set once at graph invocation)
 * - budgetState: Accumulated cost tracking across all phases
 * - phaseResult: Output from the last phase worker (for transition decisions)
 * - transitionRequested: Whether the phase worker wants to move to the next phase
 * - targetPhase: Which phase to transition to (if transitionRequested)
 */
export const RenovationAnnotation = Annotation.Root({
  // Inherit messages channel with built-in append reducer
  ...MessagesAnnotation.spec,

  // Session identity
  sessionId: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),

  // Phase routing
  currentPhase: Annotation<RenovationPhase>({ reducer: (_, b) => b, default: () => 'INTAKE' as RenovationPhase }),
  transitionRequested: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  targetPhase: Annotation<RenovationPhase | null>({ reducer: (_, b) => b, default: () => null }),

  // Budget tracking
  budgetState: Annotation<BudgetState>({ reducer: (_, b) => b, default: () => createInitialBudgetState() }),

  // Phase worker output
  phaseResult: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
});

export type RenovationState = typeof RenovationAnnotation.State;
