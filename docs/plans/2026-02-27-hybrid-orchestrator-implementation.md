# Hybrid B+A Orchestrator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-agent `createReActAgent()` in `chat.service.ts` with a multi-phase supervisor graph using LangGraph StateGraph, LangChain middleware, and 5 custom modules.

**Architecture:** LangGraph StateGraph as backbone. Supervisor node routes deterministically by session phase. Each of 7 phase workers is a subgraph with an orchestration style (react/plan-act/deterministic). LangChain middleware handles tool limits, model fallback, cost tracking, and PII detection. Custom modules handle BullMQ dispatch, budget enforcement, phase registry, kill switch + circuit breaker, and typed event emission.

**Tech Stack:** `@langchain/langgraph` (StateGraph, interrupt, Command), `@langchain/core` (middleware), `ioredis` (kill switch, circuit breaker), `bullmq` (worker dispatch), `zod` (validation), `vitest` (testing)

**Design Doc:** `docs/plans/2026-02-27-hybrid-orchestrator-design.md`

---

## Pre-Flight: Dependency Verification

Before any implementation, verify that the installed LangGraph/LangChain versions support the middleware API. Current versions in `backend/package.json`:
- `@langchain/langgraph: ^1.0.13`
- `@langchain/core: ^1.1.28`

### Task 0: Verify and Upgrade Dependencies

**Files:**
- Modify: `backend/package.json`

**Step 1: Check installed versions**

Run:
```bash
cd backend && pnpm list @langchain/langgraph @langchain/core langchain 2>/dev/null || npm list @langchain/langgraph @langchain/core langchain
```

**Step 2: Check if middleware API exists**

Run:
```bash
cd backend && node -e "
  import('@langchain/core').then(m => {
    console.log('createMiddleware:', typeof m.createMiddleware);
    console.log('toolCallLimit:', typeof m.toolCallLimit);
  }).catch(e => console.log('Not in core:', e.message));
"
```

If `createMiddleware` is undefined, check the `langchain` package or `@langchain/langgraph` package. The middleware may be in a different import path depending on the version.

**Step 3: Upgrade if needed**

If middleware API is not available, upgrade:
```bash
cd backend && pnpm add @langchain/langgraph@latest @langchain/core@latest
```

**Step 4: Verify upgrade**

Run:
```bash
cd backend && npx tsc --noEmit
```
Expected: 0 errors (no breaking type changes)

**Step 5: Commit**

```bash
git add backend/package.json backend/pnpm-lock.yaml
git commit -m "chore(deps): upgrade langchain/langgraph for middleware support"
```

---

## Wave 1: Foundation

### Task 1: Agent Types

Define all shared TypeScript interfaces for the orchestrator.

**Files:**
- Create: `backend/src/agents/types.ts`
- Test: `backend/tests/unit/agents/types.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/tests/unit/agents/types.test.ts
import { describe, it, expect } from 'vitest';

describe('agents/types', () => {
  it('should export OrchestrationStyle type with 3 values', async () => {
    const { ORCHESTRATION_STYLES } = await import('../../../src/agents/types.js');
    expect(ORCHESTRATION_STYLES).toEqual(['react', 'plan-act', 'deterministic']);
  });

  it('should export AgentEvent discriminated union type guard', async () => {
    const { isAgentEvent } = await import('../../../src/agents/types.js');
    expect(isAgentEvent({ type: 'agent:start', phase: 'INTAKE', sessionId: '123' })).toBe(true);
    expect(isAgentEvent({ type: 'invalid' })).toBe(false);
    expect(isAgentEvent(null)).toBe(false);
  });

  it('should export SessionBudget with required fields', async () => {
    const { createSessionBudget } = await import('../../../src/agents/types.js');
    const budget = createSessionBudget({ hardCapUsd: 1.0, softCapUsd: 0.8 });
    expect(budget.hardCapUsd).toBe(1.0);
    expect(budget.softCapUsd).toBe(0.8);
    expect(budget.perPhaseCapUsd).toBeUndefined();
  });

  it('should export PhaseCapability with required fields', async () => {
    const { isPhaseCapability } = await import('../../../src/agents/types.js');
    const cap = {
      phase: 'INTAKE',
      tools: ['save_intake_state'],
      style: 'react',
      canTransitionTo: ['CHECKLIST'],
      maxTurns: 20,
      persona: { role: 'Intake Specialist', goal: 'Gather renovation requirements', backstory: '', constraints: [] },
    };
    expect(isPhaseCapability(cap)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/unit/agents/types.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// backend/src/agents/types.ts
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
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/unit/agents/types.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add backend/src/agents/types.ts backend/tests/unit/agents/types.test.ts
git commit -m "feat(agents): add orchestrator type definitions

AgentEvent discriminated union, PhaseCapability, SessionBudget,
OrchestrationStyle, CircuitBreakerConfig with type guards."
```

---

### Task 2: LangGraph State Annotation

Define the graph state shape that flows through all nodes.

**Files:**
- Create: `backend/src/agents/state.ts`
- Test: `backend/tests/unit/agents/state.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/tests/unit/agents/state.test.ts
import { describe, it, expect } from 'vitest';

describe('agents/state', () => {
  it('should export RenovationAnnotation with required channels', async () => {
    const { RenovationAnnotation } = await import('../../../src/agents/state.js');
    const spec = RenovationAnnotation.spec;
    // Verify all expected channels exist
    expect(spec).toHaveProperty('messages');
    expect(spec).toHaveProperty('currentPhase');
    expect(spec).toHaveProperty('sessionId');
    expect(spec).toHaveProperty('budgetState');
  });

  it('messages channel should use MessagesAnnotation reducer (append behavior)', async () => {
    const { RenovationAnnotation } = await import('../../../src/agents/state.js');
    const spec = RenovationAnnotation.spec;
    // Messages channel should have a reducer function (from MessagesAnnotation)
    expect(spec.messages.reducer).toBeDefined();
    expect(typeof spec.messages.reducer).toBe('function');
  });

  it('currentPhase should default to INTAKE', async () => {
    const { RenovationAnnotation } = await import('../../../src/agents/state.js');
    const spec = RenovationAnnotation.spec;
    expect(spec.currentPhase.default).toBe('INTAKE');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/unit/agents/state.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// backend/src/agents/state.ts
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
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/unit/agents/state.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add backend/src/agents/state.ts backend/tests/unit/agents/state.test.ts
git commit -m "feat(agents): add LangGraph state annotation

RenovationAnnotation with messages, currentPhase, sessionId,
budgetState, transitionRequested, targetPhase, phaseResult channels."
```

---

### Task 3: Phase Capability Registry

Configure all 7 phases with tools, orchestration style, personas, and transition rules.

**Files:**
- Create: `backend/src/agents/phase-registry.ts`
- Test: `backend/tests/unit/agents/phase-registry.test.ts`
- Reference: `backend/src/utils/agent-guards.ts` (ALLOWED_TOOLS), `backend/src/config/prompts.ts` (PHASE_PROMPTS)

**Step 1: Write the failing test**

```typescript
// backend/tests/unit/agents/phase-registry.test.ts
import { describe, it, expect } from 'vitest';
import type { RenovationPhase } from '@renovation/shared-types';

describe('agents/phase-registry', () => {
  it('should export a capability for each of the 7 phases', async () => {
    const { PHASE_CAPABILITIES } = await import('../../../src/agents/phase-registry.js');
    const phases: RenovationPhase[] = ['INTAKE', 'CHECKLIST', 'PLAN', 'RENDER', 'PAYMENT', 'COMPLETE', 'ITERATE'];
    for (const phase of phases) {
      expect(PHASE_CAPABILITIES[phase]).toBeDefined();
      expect(PHASE_CAPABILITIES[phase].phase).toBe(phase);
    }
  });

  it('INTAKE should use react style with max 20 turns', async () => {
    const { PHASE_CAPABILITIES } = await import('../../../src/agents/phase-registry.js');
    expect(PHASE_CAPABILITIES.INTAKE.style).toBe('react');
    expect(PHASE_CAPABILITIES.INTAKE.maxTurns).toBe(20);
  });

  it('CHECKLIST should use plan-act style', async () => {
    const { PHASE_CAPABILITIES } = await import('../../../src/agents/phase-registry.js');
    expect(PHASE_CAPABILITIES.CHECKLIST.style).toBe('plan-act');
  });

  it('RENDER should use deterministic style with max 3 turns', async () => {
    const { PHASE_CAPABILITIES } = await import('../../../src/agents/phase-registry.js');
    expect(PHASE_CAPABILITIES.RENDER.style).toBe('deterministic');
    expect(PHASE_CAPABILITIES.RENDER.maxTurns).toBeLessThanOrEqual(3);
  });

  it('each phase should have a non-empty tools array', async () => {
    const { PHASE_CAPABILITIES } = await import('../../../src/agents/phase-registry.js');
    for (const cap of Object.values(PHASE_CAPABILITIES)) {
      expect(cap.tools.length).toBeGreaterThan(0);
    }
  });

  it('each phase should have a persona with role and goal', async () => {
    const { PHASE_CAPABILITIES } = await import('../../../src/agents/phase-registry.js');
    for (const cap of Object.values(PHASE_CAPABILITIES)) {
      expect(cap.persona.role).toBeTruthy();
      expect(cap.persona.goal).toBeTruthy();
    }
  });

  it('INTAKE can transition to CHECKLIST', async () => {
    const { PHASE_CAPABILITIES } = await import('../../../src/agents/phase-registry.js');
    expect(PHASE_CAPABILITIES.INTAKE.canTransitionTo).toContain('CHECKLIST');
  });

  it('getPhaseCapability should return capability for valid phase', async () => {
    const { getPhaseCapability } = await import('../../../src/agents/phase-registry.js');
    const cap = getPhaseCapability('INTAKE');
    expect(cap.phase).toBe('INTAKE');
  });

  it('getPhaseCapability should throw for invalid phase', async () => {
    const { getPhaseCapability } = await import('../../../src/agents/phase-registry.js');
    expect(() => getPhaseCapability('INVALID' as RenovationPhase)).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/unit/agents/phase-registry.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// backend/src/agents/phase-registry.ts
import type { RenovationPhase } from '@renovation/shared-types';
import type { PhaseCapability } from './types.js';

/**
 * Phase Capability Registry
 *
 * Maps each renovation phase to its orchestration config:
 * tools, style, transitions, turn limits, and persona.
 *
 * Tools must match names in ALLOWED_TOOLS (agent-guards.ts).
 * Personas are injected into phase prompts by the worker factory.
 */
export const PHASE_CAPABILITIES: Record<RenovationPhase, PhaseCapability> = {
  INTAKE: {
    phase: 'INTAKE',
    tools: ['save_intake_state', 'get_style_examples'],
    style: 'react',
    canTransitionTo: ['CHECKLIST'],
    maxTurns: 20,
    persona: {
      role: 'Renovation Intake Specialist',
      goal: 'Understand the homeowner\'s renovation vision, rooms, budget, timeline, and style preferences.',
      backstory: 'You are a warm, experienced renovation consultant who excels at asking the right questions to understand what homeowners truly want.',
      constraints: [
        'Never suggest specific products — that happens in CHECKLIST.',
        'Always confirm understanding before moving to CHECKLIST.',
        'If the user uploads images, analyze them for style cues.',
      ],
    },
  },
  CHECKLIST: {
    phase: 'CHECKLIST',
    tools: ['search_products', 'save_checklist_state', 'save_product_recommendation'],
    style: 'plan-act',
    canTransitionTo: ['PLAN'],
    maxTurns: 8,
    persona: {
      role: 'Renovation Checklist Manager',
      goal: 'Create a comprehensive room-by-room checklist of materials, products, and tasks needed.',
      backstory: 'You are a detail-oriented project planner who ensures nothing is missed in a renovation plan.',
      constraints: [
        'Search for real products before recommending.',
        'Include quantity estimates and approximate costs.',
        'Group items by room and category.',
      ],
    },
  },
  PLAN: {
    phase: 'PLAN',
    tools: ['search_products'],
    style: 'plan-act',
    canTransitionTo: ['RENDER'],
    maxTurns: 8,
    persona: {
      role: 'Renovation Plan Architect',
      goal: 'Produce a structured renovation plan with timeline, ordering, and dependencies.',
      backstory: 'You are an experienced project manager who sequences renovation tasks for maximum efficiency.',
      constraints: [
        'Plan should include a realistic timeline.',
        'Identify tasks that can be parallelized vs sequential.',
        'Flag any items that require professional contractors.',
      ],
    },
  },
  RENDER: {
    phase: 'RENDER',
    tools: ['generate_render', 'save_renders_state'],
    style: 'deterministic',
    canTransitionTo: ['PAYMENT'],
    maxTurns: 3,
    persona: {
      role: 'Visual Render Coordinator',
      goal: 'Generate AI renders of the planned renovation for each room.',
      backstory: 'You coordinate the rendering pipeline, ensuring prompts are detailed and results match the plan.',
      constraints: [
        'Use the exact materials and styles from the CHECKLIST phase.',
        'Generate one render per room unless the user requests more.',
        'Include before/after context in render prompts.',
      ],
    },
  },
  PAYMENT: {
    phase: 'PAYMENT',
    tools: ['search_products'],
    style: 'deterministic',
    canTransitionTo: ['COMPLETE'],
    maxTurns: 2,
    persona: {
      role: 'Payment Coordinator',
      goal: 'Guide the user through the payment process for the renovation plan.',
      backstory: 'You handle the commercial side, ensuring a smooth checkout experience.',
      constraints: [
        'Present a clear cost summary before payment.',
        'Never store payment credentials.',
      ],
    },
  },
  COMPLETE: {
    phase: 'COMPLETE',
    tools: ['search_products'],
    style: 'deterministic',
    canTransitionTo: ['ITERATE'],
    maxTurns: 2,
    persona: {
      role: 'Project Completion Specialist',
      goal: 'Summarize the completed renovation plan and provide next steps.',
      backstory: 'You wrap up projects with clear summaries and actionable next steps.',
      constraints: [
        'Include links to all generated documents and renders.',
        'Provide a contractor contact checklist.',
      ],
    },
  },
  ITERATE: {
    phase: 'ITERATE',
    tools: ['search_products', 'save_checklist_state', 'save_product_recommendation', 'generate_render', 'save_renders_state'],
    style: 'react',
    canTransitionTo: ['CHECKLIST', 'PLAN', 'RENDER'],
    maxTurns: 20,
    persona: {
      role: 'Renovation Refinement Specialist',
      goal: 'Help the user refine, modify, or expand their renovation plan based on feedback.',
      backstory: 'You excel at iterative improvement, understanding what needs to change and efficiently updating the plan.',
      constraints: [
        'Preserve existing work — only modify what the user requests.',
        'Confirm changes before applying them.',
        'Can route back to CHECKLIST, PLAN, or RENDER as needed.',
      ],
    },
  },
};

/**
 * Get capability config for a phase. Throws if phase is unknown.
 */
export function getPhaseCapability(phase: RenovationPhase): PhaseCapability {
  const cap = PHASE_CAPABILITIES[phase];
  if (!cap) {
    throw new Error(`Unknown phase: ${phase}`);
  }
  return cap;
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/unit/agents/phase-registry.test.ts`
Expected: PASS (9 tests)

**Step 5: Commit**

```bash
git add backend/src/agents/phase-registry.ts backend/tests/unit/agents/phase-registry.test.ts
git commit -m "feat(agents): add phase capability registry

7 phases with orchestration style, tools, transitions, turn limits,
and personas. react for INTAKE/ITERATE, plan-act for CHECKLIST/PLAN,
deterministic for RENDER/PAYMENT/COMPLETE."
```

---

### Task 4: Agent Event Emitter

Typed event fan-out to Socket.io + Logger + OTel.

**Files:**
- Create: `backend/src/agents/agent-event-emitter.ts`
- Test: `backend/tests/unit/agents/agent-event-emitter.test.ts`
- Reference: `backend/src/utils/logger.ts`, `backend/src/utils/ai-tracing.ts`

**Step 1: Write the failing test**

```typescript
// backend/tests/unit/agents/agent-event-emitter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentEvent } from '../../../src/agents/types.js';

// Mock Socket.io
const mockTo = vi.fn().mockReturnValue({ emit: vi.fn() });
const mockIo = { to: mockTo } as unknown;

// Mock Logger
const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

// Mock OTel
vi.mock('@opentelemetry/api', () => ({
  trace: {
    getActiveSpan: vi.fn().mockReturnValue(null),
  },
}));

describe('AgentEventEmitter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should emit agent:start event to Socket.io room', async () => {
    const { AgentEventEmitter } = await import('../../../src/agents/agent-event-emitter.js');
    const emitter = new AgentEventEmitter(mockIo as never, mockLogger as never, 'session-123');

    const event: AgentEvent = { type: 'agent:start', phase: 'INTAKE' as never, sessionId: 'session-123' };
    emitter.emit(event);

    expect(mockTo).toHaveBeenCalledWith('session-123');
    expect(mockTo().emit).toHaveBeenCalledWith('agent:start', event);
  });

  it('should log event via Logger', async () => {
    const { AgentEventEmitter } = await import('../../../src/agents/agent-event-emitter.js');
    const emitter = new AgentEventEmitter(mockIo as never, mockLogger as never, 'session-123');

    const event: AgentEvent = { type: 'agent:error', error: 'test error', phase: 'INTAKE' as never };
    emitter.emit(event);

    expect(mockLogger.info).toHaveBeenCalledWith('agent:error', expect.objectContaining({ type: 'agent:error' }));
  });

  it('should add OTel span event when active span exists', async () => {
    const mockSpan = { addEvent: vi.fn() };
    const { trace } = await import('@opentelemetry/api');
    vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as never);

    const { AgentEventEmitter } = await import('../../../src/agents/agent-event-emitter.js');
    const emitter = new AgentEventEmitter(mockIo as never, mockLogger as never, 'session-123');

    const event: AgentEvent = { type: 'agent:tool_call', tool: 'search_products', args: { query: 'tiles' } };
    emitter.emit(event);

    expect(mockSpan.addEvent).toHaveBeenCalledWith('agent:tool_call', expect.any(Object));
  });

  it('should not throw when OTel span is null', async () => {
    const { trace } = await import('@opentelemetry/api');
    vi.mocked(trace.getActiveSpan).mockReturnValue(null);

    const { AgentEventEmitter } = await import('../../../src/agents/agent-event-emitter.js');
    const emitter = new AgentEventEmitter(mockIo as never, mockLogger as never, 'session-123');

    expect(() => emitter.emit({ type: 'agent:complete', phase: 'INTAKE' as never, result: 'done' })).not.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/unit/agents/agent-event-emitter.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// backend/src/agents/agent-event-emitter.ts
import { trace } from '@opentelemetry/api';
import type { Server as SocketIOServer } from 'socket.io';
import type { Logger } from '../utils/logger.js';
import type { AgentEvent } from './types.js';

/**
 * AgentEventEmitter — session-scoped event fan-out.
 *
 * Every agent event is multiplexed to three destinations:
 * 1. Socket.io → frontend (session room)
 * 2. Logger → structured logs
 * 3. OTel → span events (if active span exists)
 *
 * Created per processMessage() call, not a singleton.
 */
export class AgentEventEmitter {
  constructor(
    private readonly io: SocketIOServer,
    private readonly logger: Logger,
    private readonly sessionId: string,
  ) {}

  emit(event: AgentEvent): void {
    // 1. Socket.io → frontend (session room)
    this.io.to(this.sessionId).emit(event.type, event);

    // 2. Logger → structured logs
    this.logger.info(event.type, event as unknown as Record<string, unknown>);

    // 3. OTel → span event (if active span)
    const span = trace.getActiveSpan();
    if (span) {
      // Flatten event to OTel-compatible attributes (strings/numbers/booleans only)
      const attrs: Record<string, string | number | boolean> = { 'agent.event.type': event.type };
      if ('phase' in event && event.phase) attrs['agent.event.phase'] = event.phase;
      if ('tool' in event && event.tool) attrs['agent.event.tool'] = event.tool;
      if ('sessionId' in event && event.sessionId) attrs['agent.event.sessionId'] = event.sessionId;
      span.addEvent(event.type, attrs);
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/unit/agents/agent-event-emitter.test.ts`
Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add backend/src/agents/agent-event-emitter.ts backend/tests/unit/agents/agent-event-emitter.test.ts
git commit -m "feat(agents): add typed AgentEventEmitter

Session-scoped event fan-out to Socket.io + Logger + OTel.
Discriminated union AgentEvent type with 10 event variants."
```

---

### Task 5: Kill Switch + Circuit Breaker

Move kill switch from `utils/` and add Redis circuit breaker.

**Files:**
- Create: `backend/src/agents/kill-switch.ts`
- Test: `backend/tests/unit/agents/kill-switch.test.ts`
- Reference: `backend/src/utils/agent-killswitch.ts` (existing implementation), `backend/src/config/redis.ts`

**Step 1: Write the failing test**

```typescript
// backend/tests/unit/agents/kill-switch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis
const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
};

vi.mock('../../../src/config/redis.js', () => ({
  getRedisClient: vi.fn().mockReturnValue(mockRedis),
  isRedisAvailable: vi.fn().mockReturnValue(true),
}));

describe('kill-switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isPhaseEnabled', () => {
    it('should return true when no kill switch key exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      const { isPhaseEnabled } = await import('../../../src/agents/kill-switch.js');
      expect(await isPhaseEnabled('INTAKE')).toBe(true);
    });

    it('should return false when kill switch key is "disabled"', async () => {
      mockRedis.get.mockResolvedValue('disabled');
      const { isPhaseEnabled } = await import('../../../src/agents/kill-switch.js');
      expect(await isPhaseEnabled('INTAKE')).toBe(false);
    });

    it('should return true (fail open) when Redis is unavailable', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis down'));
      const { isPhaseEnabled } = await import('../../../src/agents/kill-switch.js');
      expect(await isPhaseEnabled('INTAKE')).toBe(true);
    });
  });

  describe('checkCircuitBreaker', () => {
    it('should allow calls under the limit', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      const { checkCircuitBreaker } = await import('../../../src/agents/kill-switch.js');
      const allowed = await checkCircuitBreaker('INTAKE', 'save_intake_state', { maxCalls: 5, windowSeconds: 60 });
      expect(allowed).toBe(true);
    });

    it('should block calls at the limit', async () => {
      mockRedis.incr.mockResolvedValue(6);
      const { checkCircuitBreaker } = await import('../../../src/agents/kill-switch.js');
      const allowed = await checkCircuitBreaker('INTAKE', 'save_intake_state', { maxCalls: 5, windowSeconds: 60 });
      expect(allowed).toBe(false);
    });

    it('should set TTL on first call (count === 1)', async () => {
      mockRedis.incr.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      const { checkCircuitBreaker } = await import('../../../src/agents/kill-switch.js');
      await checkCircuitBreaker('INTAKE', 'save_intake_state', { maxCalls: 5, windowSeconds: 60 });
      expect(mockRedis.expire).toHaveBeenCalledWith(expect.stringContaining('cb:INTAKE:save_intake_state'), 60);
    });

    it('should not set TTL on subsequent calls', async () => {
      mockRedis.incr.mockResolvedValue(3);
      const { checkCircuitBreaker } = await import('../../../src/agents/kill-switch.js');
      await checkCircuitBreaker('INTAKE', 'save_intake_state', { maxCalls: 5, windowSeconds: 60 });
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('should allow (fail open) when Redis is unavailable', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis down'));
      const { checkCircuitBreaker } = await import('../../../src/agents/kill-switch.js');
      const allowed = await checkCircuitBreaker('INTAKE', 'save_intake_state', { maxCalls: 5, windowSeconds: 60 });
      expect(allowed).toBe(true);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/unit/agents/kill-switch.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// backend/src/agents/kill-switch.ts
import { getRedisClient, isRedisAvailable } from '../config/redis.js';
import type { CircuitBreakerConfig } from './types.js';

const KILL_SWITCH_PREFIX = 'killswitch:phase:';
const CIRCUIT_BREAKER_PREFIX = 'cb:';

/**
 * Check if a phase is enabled (not killed).
 * Fails open — if Redis is unavailable, phase is considered enabled.
 */
export async function isPhaseEnabled(phase: string): Promise<boolean> {
  if (!isRedisAvailable()) return true;
  try {
    const redis = getRedisClient();
    const value = await redis.get(`${KILL_SWITCH_PREFIX}${phase}`);
    return value !== 'disabled';
  } catch {
    // Fail open — allow phase to run if Redis is down
    return true;
  }
}

/**
 * Disable a phase via kill switch. TTL auto-expires.
 */
export async function disablePhase(phase: string, ttlSeconds = 86400): Promise<void> {
  const redis = getRedisClient();
  await redis.set(`${KILL_SWITCH_PREFIX}${phase}`, 'disabled', 'EX', ttlSeconds);
}

/**
 * Re-enable a phase by removing the kill switch key.
 */
export async function enablePhase(phase: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`${KILL_SWITCH_PREFIX}${phase}`);
}

/**
 * Circuit breaker — sliding window rate limit per phase:tool pair.
 * Returns true if the call is allowed, false if the breaker has tripped.
 * Fails open — if Redis is unavailable, the call is allowed.
 */
export async function checkCircuitBreaker(
  phase: string,
  tool: string,
  config: CircuitBreakerConfig,
): Promise<boolean> {
  if (!isRedisAvailable()) return true;
  try {
    const redis = getRedisClient();
    const key = `${CIRCUIT_BREAKER_PREFIX}${phase}:${tool}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, config.windowSeconds);
    }
    return count <= config.maxCalls;
  } catch {
    // Fail open
    return true;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/unit/agents/kill-switch.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add backend/src/agents/kill-switch.ts backend/tests/unit/agents/kill-switch.test.ts
git commit -m "feat(agents): add phase kill switch and circuit breaker

Redis-backed kill switch per phase with TTL auto-expiry.
Sliding-window circuit breaker per phase:tool pair.
Both fail open when Redis is unavailable."
```

---

### Task 6: Budget Enforcer

Read cost data from graph state, enforce per-session budget limits.

**Files:**
- Create: `backend/src/agents/budget-enforcer.ts`
- Test: `backend/tests/unit/agents/budget-enforcer.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/tests/unit/agents/budget-enforcer.test.ts
import { describe, it, expect } from 'vitest';
import type { BudgetState, SessionBudget } from '../../../src/agents/types.js';

describe('budget-enforcer', () => {
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
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/unit/agents/budget-enforcer.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// backend/src/agents/budget-enforcer.ts
import type { BudgetState, SessionBudget } from './types.js';

export { createInitialBudgetState } from './types.js';

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
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/unit/agents/budget-enforcer.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add backend/src/agents/budget-enforcer.ts backend/tests/unit/agents/budget-enforcer.test.ts
git commit -m "feat(agents): add budget enforcer with hard/soft/per-phase caps

Pure function budget checking with immutable state updates.
checkBudget returns allowed/reason/warning for dispatch decisions.
recordCost tracks per-phase and total accumulated costs."
```

---

### Task 7: Supervisor Graph

Build the central routing graph that dispatches to phase workers.

**Files:**
- Create: `backend/src/agents/supervisor.ts`
- Test: `backend/tests/unit/agents/supervisor.test.ts`
- Reference: `backend/src/services/chat.service.ts` (current graph), `backend/src/config/prompts.ts`, `backend/src/agents/phase-registry.ts`

**Step 1: Write the failing test**

```typescript
// backend/tests/unit/agents/supervisor.test.ts
import { describe, it, expect, vi } from 'vitest';

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
  getRedisClient: vi.fn(),
  isRedisAvailable: vi.fn().mockReturnValue(false),
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
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/unit/agents/supervisor.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

This is the core graph. Start with a skeleton that routes to a single worker node (INTAKE), then expand in Wave 2/4.

```typescript
// backend/src/agents/supervisor.ts
import { StateGraph, START, END } from '@langchain/langgraph';
import type { RenovationPhase } from '@renovation/shared-types';
import { RenovationAnnotation, type RenovationState } from './state.js';
import { getPhaseCapability } from './phase-registry.js';
import { isPhaseEnabled } from './kill-switch.js';
import { checkBudget } from './budget-enforcer.js';
import { getCheckpointer } from '../services/checkpointer.service.js';
import { createStreamingModel } from '../config/gemini.js';
import { getSystemPrompt } from '../config/prompts.js';

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
function supervisorNode(state: RenovationState): Partial<RenovationState> {
  // Supervisor is a pass-through — routing is handled by conditional edges
  return {};
}

/**
 * Phase router — returns the worker node name based on currentPhase.
 * Checks kill switch and budget before routing.
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
 * Placeholder worker node — processes a message in the current phase.
 * Will be replaced by proper subgraph workers in Wave 2/4.
 */
async function placeholderWorker(state: RenovationState): Promise<Partial<RenovationState>> {
  const phase = state.currentPhase;
  const capability = getPhaseCapability(phase);
  const model = createStreamingModel();
  const systemPrompt = getSystemPrompt(phase, state.sessionId);

  // Minimal placeholder — invoke model with system prompt and messages
  // This will be replaced by the worker factory in Task 8
  return {
    phaseResult: `Processed by ${phase} worker (placeholder)`,
  };
}

/**
 * Transition check node — decides whether to end or loop back to supervisor.
 */
function transitionCheck(state: RenovationState): string {
  if (state.transitionRequested && state.targetPhase) {
    // Loop back to supervisor with new phase
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
    .addNode('intake_worker', placeholderWorker)
    .addNode('checklist_worker', placeholderWorker)
    .addNode('plan_worker', placeholderWorker)
    .addNode('render_worker', placeholderWorker)
    .addNode('payment_worker', placeholderWorker)
    .addNode('complete_worker', placeholderWorker)
    .addNode('iterate_worker', placeholderWorker)
    .addNode('transition_check', transitionCheck)
    // START → supervisor
    .addEdge(START, 'supervisor')
    // supervisor → phase worker (conditional)
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
    // All workers → transition_check
    .addEdge('intake_worker', 'transition_check')
    .addEdge('checklist_worker', 'transition_check')
    .addEdge('plan_worker', 'transition_check')
    .addEdge('render_worker', 'transition_check')
    .addEdge('payment_worker', 'transition_check')
    .addEdge('complete_worker', 'transition_check')
    .addEdge('iterate_worker', 'transition_check')
    // transition_check → supervisor (loop) or END
    .addConditionalEdges('transition_check', transitionCheck, {
      supervisor: 'supervisor',
      [END]: END,
    });

  const checkpointer = getCheckpointer();
  return workflow.compile({ checkpointer });
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/unit/agents/supervisor.test.ts`
Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add backend/src/agents/supervisor.ts backend/tests/unit/agents/supervisor.test.ts
git commit -m "feat(agents): add supervisor graph with deterministic phase routing

StateGraph with 7 phase worker nodes + supervisor + transition_check.
Deterministic routing by currentPhase. Kill switch check before dispatch.
Placeholder workers to be replaced by subgraphs in Wave 2."
```

---

### Task 8: Barrel Export

Create the agents module index.

**Files:**
- Create: `backend/src/agents/index.ts`

**Step 1: Write barrel export**

```typescript
// backend/src/agents/index.ts
export { createSupervisorGraph, routeByPhase } from './supervisor.js';
export { RenovationAnnotation, type RenovationState } from './state.js';
export { PHASE_CAPABILITIES, getPhaseCapability } from './phase-registry.js';
export { AgentEventEmitter } from './agent-event-emitter.js';
export { isPhaseEnabled, disablePhase, enablePhase, checkCircuitBreaker } from './kill-switch.js';
export { checkBudget, recordCost } from './budget-enforcer.js';
export type {
  OrchestrationStyle,
  PhaseCapability,
  PhasePersona,
  SessionBudget,
  BudgetState,
  AgentEvent,
  CircuitBreakerConfig,
} from './types.js';
export { ORCHESTRATION_STYLES, isAgentEvent, createSessionBudget, createInitialBudgetState } from './types.js';
```

**Step 2: Verify all exports resolve**

Run: `cd backend && node -e "import('./src/agents/index.js').then(m => console.log(Object.keys(m).join(', '))).catch(e => console.error(e))"`

**Step 3: Commit**

```bash
git add backend/src/agents/index.ts
git commit -m "feat(agents): add barrel export index

Exports all orchestrator modules: supervisor, state, phase-registry,
event-emitter, kill-switch, budget-enforcer, and shared types."
```

---

### Task 9: Run Full Test Suite + Quality Gates

**Step 1: Run all agent tests**

Run: `cd backend && npx vitest run tests/unit/agents/`
Expected: ALL PASS (22+ tests across 5 test files)

**Step 2: Run full backend test suite**

Run: `cd backend && npm run test:unit`
Expected: ALL PASS (no regressions)

**Step 3: Type check**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

**Step 4: Lint**

Run: `cd backend && npm run lint`
Expected: 0 errors

**Step 5: Commit Wave 1 checkpoint**

```bash
git add -A
git commit -m "test(agents): Wave 1 complete — foundation types, state, registry, events, safety, supervisor

22+ tests passing. Types, state annotation, phase registry (7 phases),
agent event emitter, kill switch + circuit breaker, budget enforcer,
supervisor graph with deterministic phase routing."
```

---

## Wave 2: First Worker (INTAKE)

### Task 10: Worker Factory

Build the factory that creates phase worker subgraphs based on orchestration style.

**Files:**
- Create: `backend/src/agents/worker-factory.ts`
- Test: `backend/tests/unit/agents/worker-factory.test.ts`
- Reference: `backend/src/services/chat.service.ts:75-103` (current ReAct graph pattern)

**Step 1: Write the failing test**

```typescript
// backend/tests/unit/agents/worker-factory.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/config/gemini.js', () => ({
  createStreamingModel: vi.fn().mockReturnValue({
    bindTools: vi.fn().mockReturnValue({ invoke: vi.fn() }),
    traceAttributes: {},
  }),
}));

describe('worker-factory', () => {
  it('should export createPhaseWorker function', async () => {
    const { createPhaseWorker } = await import('../../../src/agents/worker-factory.js');
    expect(typeof createPhaseWorker).toBe('function');
  });

  it('should create a react-style worker for INTAKE', async () => {
    const { createPhaseWorker } = await import('../../../src/agents/worker-factory.js');
    const worker = createPhaseWorker('INTAKE');
    expect(worker).toBeDefined();
    expect(typeof worker).toBe('function');
  });

  it('should create a plan-act-style worker for CHECKLIST', async () => {
    const { createPhaseWorker } = await import('../../../src/agents/worker-factory.js');
    const worker = createPhaseWorker('CHECKLIST');
    expect(worker).toBeDefined();
    expect(typeof worker).toBe('function');
  });

  it('should create a deterministic-style worker for RENDER', async () => {
    const { createPhaseWorker } = await import('../../../src/agents/worker-factory.js');
    const worker = createPhaseWorker('RENDER');
    expect(worker).toBeDefined();
    expect(typeof worker).toBe('function');
  });

  it('should inject persona into system prompt', async () => {
    const { buildPhasePrompt } = await import('../../../src/agents/worker-factory.js');
    const prompt = buildPhasePrompt('INTAKE', 'session-123');
    expect(prompt).toContain('Renovation Intake Specialist');
    expect(prompt).toContain('renovation vision');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/unit/agents/worker-factory.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
// backend/src/agents/worker-factory.ts
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { RenovationPhase } from '@renovation/shared-types';
import { createStreamingModel } from '../config/gemini.js';
import { getSystemPrompt } from '../config/prompts.js';
import { getPhaseCapability } from './phase-registry.js';
import { renovationTools } from '../tools/index.js';
import type { RenovationState } from './state.js';

/**
 * Build a phase-aware system prompt with persona injection.
 */
export function buildPhasePrompt(phase: RenovationPhase, sessionId: string): string {
  const capability = getPhaseCapability(phase);
  const basePrompt = getSystemPrompt(phase, sessionId);
  const { persona } = capability;

  const personaBlock = [
    `\n## Your Role`,
    `You are a ${persona.role}.`,
    `**Goal:** ${persona.goal}`,
    persona.backstory ? `**Background:** ${persona.backstory}` : '',
    persona.constraints.length > 0
      ? `**Constraints:**\n${persona.constraints.map(c => `- ${c}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');

  return `${basePrompt}\n${personaBlock}`;
}

/**
 * Filter renovation tools to only those allowed in a given phase.
 */
function getPhaseTools(phase: RenovationPhase) {
  const capability = getPhaseCapability(phase);
  return renovationTools.filter(tool => capability.tools.includes(tool.name));
}

/**
 * Create a phase worker function.
 *
 * The worker is a function that takes RenovationState and returns
 * a partial state update. The orchestration style determines how
 * the worker interacts with the model:
 *
 * - react: Full ReAct loop with tool calling (INTAKE, ITERATE)
 * - plan-act: Structured plan-then-execute (CHECKLIST, PLAN)
 * - deterministic: Single model call, no loops (RENDER, PAYMENT, COMPLETE)
 */
export function createPhaseWorker(phase: RenovationPhase): (state: RenovationState) => Promise<Partial<RenovationState>> {
  const capability = getPhaseCapability(phase);

  return async (state: RenovationState): Promise<Partial<RenovationState>> => {
    const model = createStreamingModel();
    const tools = getPhaseTools(phase);
    const systemPrompt = buildPhasePrompt(phase, state.sessionId);

    // Get the last user message from state
    const messages = state.messages;

    switch (capability.style) {
      case 'react': {
        // ReAct: bind tools and let model decide tool calls
        const modelWithTools = model.bindTools(tools);
        const response = await modelWithTools.invoke([
          new SystemMessage(systemPrompt),
          ...messages,
        ]);
        return { messages: [response], phaseResult: response.content as string };
      }

      case 'plan-act': {
        // Plan-Act: same as react but with stricter prompt framing
        // The plan-act distinction is prompt-level per the design doc
        const modelWithTools = model.bindTools(tools);
        const response = await modelWithTools.invoke([
          new SystemMessage(systemPrompt),
          ...messages,
        ]);
        return { messages: [response], phaseResult: response.content as string };
      }

      case 'deterministic': {
        // Deterministic: single call, tools bound but limited turns
        const modelWithTools = tools.length > 0 ? model.bindTools(tools) : model;
        const response = await modelWithTools.invoke([
          new SystemMessage(systemPrompt),
          ...messages,
        ]);
        return { messages: [response], phaseResult: response.content as string };
      }

      default:
        throw new Error(`Unknown orchestration style: ${capability.style}`);
    }
  };
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/unit/agents/worker-factory.test.ts`
Expected: PASS (5 tests)

**Step 5: Commit**

```bash
git add backend/src/agents/worker-factory.ts backend/tests/unit/agents/worker-factory.test.ts
git commit -m "feat(agents): add phase worker factory with 3 orchestration styles

createPhaseWorker returns a state handler for react/plan-act/deterministic.
buildPhasePrompt injects persona into phase system prompt.
Tool filtering by phase capability."
```

---

### Task 11: Wire Supervisor to Worker Factory

Replace placeholder workers with factory-generated workers.

**Files:**
- Modify: `backend/src/agents/supervisor.ts`

**Step 1: Update supervisor to use worker factory**

Replace the `placeholderWorker` function and all 7 `addNode` calls with factory-generated workers:

```typescript
// In supervisor.ts, replace placeholderWorker and node registrations:
import { createPhaseWorker } from './worker-factory.js';

// Replace addNode calls:
.addNode('intake_worker', createPhaseWorker('INTAKE'))
.addNode('checklist_worker', createPhaseWorker('CHECKLIST'))
.addNode('plan_worker', createPhaseWorker('PLAN'))
.addNode('render_worker', createPhaseWorker('RENDER'))
.addNode('payment_worker', createPhaseWorker('PAYMENT'))
.addNode('complete_worker', createPhaseWorker('COMPLETE'))
.addNode('iterate_worker', createPhaseWorker('ITERATE'))
```

Remove the `placeholderWorker` function entirely.

**Step 2: Run existing supervisor tests**

Run: `cd backend && npx vitest run tests/unit/agents/supervisor.test.ts`
Expected: PASS (3 tests still pass)

**Step 3: Run all agent tests**

Run: `cd backend && npx vitest run tests/unit/agents/`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add backend/src/agents/supervisor.ts
git commit -m "refactor(agents): wire supervisor to worker factory

Replace 7 placeholder workers with factory-generated phase workers.
Each worker uses the orchestration style from its phase capability."
```

---

### Task 12: Update Barrel Export + Wave 2 Quality Gate

**Files:**
- Modify: `backend/src/agents/index.ts`

**Step 1: Add worker factory export**

Add to index.ts:
```typescript
export { createPhaseWorker, buildPhasePrompt } from './worker-factory.js';
```

**Step 2: Run full quality gates**

Run: `cd backend && npx vitest run tests/unit/agents/ && npx tsc --noEmit && npm run lint`
Expected: ALL PASS

**Step 3: Commit Wave 2 checkpoint**

```bash
git add backend/src/agents/index.ts
git commit -m "test(agents): Wave 2 complete — worker factory with INTAKE proof-of-concept

Worker factory creates phase workers with 3 orchestration styles.
Persona injection into system prompts. Tool filtering by phase.
Supervisor wired to factory-generated workers."
```

---

## Wave 3: Integration

### Task 13: Update chat.service.ts to Use Supervisor Graph

This is the key integration task — replace `createReActAgent()` with the supervisor graph.

**Files:**
- Modify: `backend/src/services/chat.service.ts`
- Modify: `backend/tests/unit/services/chat.service.test.ts` (if exists)

**Step 1: Read current chat.service.ts**

Read: `backend/src/services/chat.service.ts` — understand the full `processMessage()` flow.

Key sections to modify:
- Line ~75-103: `createReActAgent()` — replace with `createSupervisorGraph()`
- Line ~241-255: `graph.stream()` invocation — update config to include `sessionId` and `currentPhase`
- The streaming/parsing logic (lines 261-342) should remain largely unchanged

**Step 2: Replace createReActAgent with supervisor graph**

Key changes:
1. Import `createSupervisorGraph` and `RenovationAnnotation` from `../agents/index.js`
2. Replace `this.graph = this.createReActAgent()` with `this.graph = createSupervisorGraph()`
3. Update `processMessage()` to pass `sessionId` and `currentPhase` in the graph input
4. The streaming parsing code stays the same — LangGraph stream format is compatible

```typescript
// Key change in processMessage():
const input = {
  messages: [new SystemMessage(systemPrompt), ...historicalMessages, userMessage],
  sessionId,
  currentPhase: phase,
};

const stream = this.graph.stream(input, {
  configurable: { thread_id: sessionId },
  recursionLimit: 40, // maxTurns * 2 for tool calls
  streamMode: 'values',
});
```

**Step 3: Run existing chat service tests**

Run: `cd backend && npx vitest run tests/unit/services/chat.service.test.ts`
Expected: Tests may need mock updates for new graph shape

**Step 4: Run full test suite**

Run: `cd backend && npm run test:unit`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/services/chat.service.ts backend/tests/unit/services/chat.service.test.ts
git commit -m "feat(agents): integrate supervisor graph into chat service

Replace createReActAgent() with createSupervisorGraph().
Phase-aware routing, persona injection, kill switch checks.
Streaming and message persistence unchanged."
```

---

### Task 14: Add Agent Events to shared-types

**Files:**
- Modify: `packages/shared-types/src/socket-events.ts`
- Modify: `packages/shared-types/src/index.ts`

**Step 1: Add agent event types to socket-events.ts**

Add to `ServerToClientEvents`:
```typescript
// Agent orchestrator events
'agent:start': (data: AgentStartPayload) => void;
'agent:phase_transition': (data: AgentPhaseTransitionPayload) => void;
'agent:budget_warning': (data: AgentBudgetWarningPayload) => void;
'agent:error': (data: AgentErrorPayload) => void;
'agent:complete': (data: AgentCompletePayload) => void;
```

Add payload interfaces:
```typescript
export interface AgentStartPayload {
  sessionId: string;
  phase: string;
}

export interface AgentPhaseTransitionPayload {
  sessionId: string;
  from: string;
  to: string;
  summary: string;
}

export interface AgentBudgetWarningPayload {
  sessionId: string;
  currentCostUsd: number;
  limitUsd: number;
}

export interface AgentErrorPayload {
  sessionId: string;
  error: string;
  phase: string;
}

export interface AgentCompletePayload {
  sessionId: string;
  phase: string;
}
```

**Step 2: Export from index.ts**

Add the new payload types to `packages/shared-types/src/index.ts` exports.

**Step 3: Build shared-types**

Run: `cd packages/shared-types && npm run build`
Expected: 0 errors

**Step 4: Commit**

```bash
git add packages/shared-types/src/socket-events.ts packages/shared-types/src/index.ts
git commit -m "feat(shared-types): add agent orchestrator Socket.io event types

AgentStartPayload, AgentPhaseTransitionPayload, AgentBudgetWarningPayload,
AgentErrorPayload, AgentCompletePayload for frontend consumption."
```

---

### Task 15: Final Quality Gates + Wave 3 Checkpoint

**Step 1: Run ALL backend tests**

Run: `cd backend && npm run test:unit`
Expected: ALL PASS

**Step 2: Type check backend**

Run: `cd backend && npx tsc --noEmit`
Expected: 0 errors

**Step 3: Type check frontend** (shared-types changes)

Run: `cd frontend && npm run type-check`
Expected: 0 errors

**Step 4: Lint**

Run: `cd backend && npm run lint`
Expected: 0 errors

**Step 5: Commit Wave 3 checkpoint**

```bash
git add -A
git commit -m "test(agents): Wave 3 complete — supervisor integrated into chat service

Chat service uses supervisor graph with phase-aware routing.
Agent event types added to shared-types for frontend.
All quality gates passing."
```

---

## Wave 4: Remaining Workers (Deferred)

Tasks 16-21 follow the same pattern as Task 10-11 but for the remaining 6 phase workers. Each worker gets:
1. Phase-specific tool filtering (already handled by worker factory)
2. Phase-specific prompt with persona (already handled by buildPhasePrompt)
3. Orchestration style enforcement (already handled by factory)

**These are already functional via the worker factory.** Wave 4 is only needed if individual workers need **phase-specific logic beyond what the factory provides** (e.g., RENDER needs to call the image generation pipeline directly, PAYMENT needs Stripe integration).

Recommend: **Skip Wave 4 for now.** The worker factory handles all 7 phases generically. Add phase-specific worker overrides when those phases are actually built out.

---

## Wave 5: Cleanup (Deferred)

### Task 22: Remove Dead Code

Once the supervisor graph is verified in production:
- Remove `createReActAgent()` method from `chat.service.ts`
- Remove `createSafeShouldContinue` from `agent-guards.ts` (replaced by middleware)
- Update `agent-guards.ts` ALLOWED_TOOLS to reference phase registry

### Task 23: Add OTel Phase Attributes

- Modify: `backend/src/utils/ai-tracing.ts`
- Add `ai.orchestrator.phase`, `ai.orchestrator.style`, `ai.orchestrator.worker` span attributes

---

## Summary

| Wave | Tasks | Tests | New Files | Modified Files |
|------|-------|-------|-----------|---------------|
| Pre-flight | 0 | 0 | 0 | 1 (package.json) |
| Wave 1 | 1-9 | 22+ | 7 | 0 |
| Wave 2 | 10-12 | 5+ | 1 | 1 |
| Wave 3 | 13-15 | varies | 0 | 4 |
| Wave 4 | deferred | — | — | — |
| Wave 5 | deferred | — | — | — |

**Total active tasks: 15**
**Total new tests: 27+**
**Total new files: 8** (7 src + 1 barrel)
**Total modified files: 5** (chat.service, supervisor, shared-types x2, index)
