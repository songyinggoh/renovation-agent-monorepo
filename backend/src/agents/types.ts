import type { RenovationPhase } from '@renovation/shared-types';

// --- Orchestration ---

export const ORCHESTRATION_STYLES = ['react', 'plan-act', 'deterministic'] as const;
export type OrchestrationStyle = (typeof ORCHESTRATION_STYLES)[number];

// --- Phase Capability ---

export interface PhasePersona {
  role: string;
  goal: string;
  backstory: string;
  constraints: string[];
}

export interface PhaseCapability {
  phase: RenovationPhase;
  tools: string[];
  style: OrchestrationStyle;
  canTransitionTo: RenovationPhase[];
  maxTurns: number;
  persona: PhasePersona;
}

export function isPhaseCapability(obj: unknown): obj is PhaseCapability {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return (
    typeof o.phase === 'string' &&
    Array.isArray(o.tools) &&
    typeof o.style === 'string' &&
    ORCHESTRATION_STYLES.includes(o.style as OrchestrationStyle) &&
    Array.isArray(o.canTransitionTo) &&
    typeof o.maxTurns === 'number' &&
    typeof o.persona === 'object' &&
    o.persona !== null
  );
}

// --- Budget ---

export interface SessionBudget {
  hardCapUsd: number;
  softCapUsd: number;
  perPhaseCapUsd?: number;
}

export interface BudgetState {
  totalCostUsd: number;
  byPhase: Record<string, { costUsd: number; invocations: number }>;
  warnings: string[];
  exceeded: boolean;
}

export function createSessionBudget(opts: { hardCapUsd: number; softCapUsd: number; perPhaseCapUsd?: number }): SessionBudget {
  return { ...opts };
}

export function createInitialBudgetState(): BudgetState {
  return { totalCostUsd: 0, byPhase: {}, warnings: [], exceeded: false };
}

// --- Agent Events ---

export type AgentEvent =
  | { type: 'agent:start'; phase: RenovationPhase; sessionId: string }
  | { type: 'agent:token'; token: string; phase: RenovationPhase }
  | { type: 'agent:tool_call'; tool: string; args: Record<string, unknown> }
  | { type: 'agent:tool_result'; tool: string; result: unknown }
  | { type: 'agent:phase_transition'; from: RenovationPhase; to: RenovationPhase; summary: string }
  | { type: 'agent:error'; error: string; phase: RenovationPhase }
  | { type: 'agent:complete'; phase: RenovationPhase; result: unknown }
  | { type: 'agent:budget_warning'; currentCostUsd: number; limitUsd: number }
  | { type: 'agent:kill_switch'; agent: string; reason: string }
  | { type: 'agent:circuit_breaker'; agent: string; tool: string; count: number };

const AGENT_EVENT_TYPES = [
  'agent:start', 'agent:token', 'agent:tool_call', 'agent:tool_result',
  'agent:phase_transition', 'agent:error', 'agent:complete',
  'agent:budget_warning', 'agent:kill_switch', 'agent:circuit_breaker',
] as const;

export function isAgentEvent(obj: unknown): obj is AgentEvent {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  return typeof o.type === 'string' && AGENT_EVENT_TYPES.includes(o.type as (typeof AGENT_EVENT_TYPES)[number]);
}

// --- Circuit Breaker ---

export interface CircuitBreakerConfig {
  maxCalls: number;
  windowSeconds: number;
}
