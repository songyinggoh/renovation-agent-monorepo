# Hybrid B+A Orchestrator Design

**Date**: 2026-02-27
**Status**: Approved
**Supersedes**: `2026-02-26-orchestrator-framework-design.md` (full custom build, 15/15 checklist)
**Approach**: LangGraph backbone + LangChain 1.0 middleware + 5 custom modules

## Problem (Unchanged)

The renovation agent has 7 phase workers, 10+ tools, and a single `createReActAgent()` entry point. Agents cannot share state across phases, hand off context, enforce budgets, or be composed into workflows. The existing `chat.service.ts` creates a new agent per message — no orchestration, no safety, no observability beyond per-message OTel spans.

## Why Hybrid B+A

The original design doc (Feb 26) planned a full custom `packages/orchestrator` framework — 1,912 lines, 30+ modules, ~4 weeks of work. Fresh research on Feb 27 revealed:

1. **LangChain 1.0 middleware** (released Feb 26) provides 8 prebuilt modules that directly replace ~40% of planned custom code
2. **LangGraph v1.2.0** snapshot checkpointing + `interrupt()`/`Command` HITL + PostgresStore cross-session memory cover another ~20%
3. **No existing framework** provides BullMQ dispatch, budget enforcement, phase capability registry, kill switches, or typed agent events — these remain custom

**Net result**: Build 5 custom modules instead of 30+. Ship in ~1.5 weeks instead of ~4 weeks.

## Architectural Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Runtime | LangGraph StateGraph | Already our backbone, stable 1.0+, MIT |
| 2 | State model | LangGraph snapshots (events later) | Native checkpointing works today; event sourcing deferred until audit/replay needed |
| 3 | Safety middleware | LangChain 1.0 (4-5 selective) | `toolCallLimit`, `modelCallLimit`, `modelFallback`, `costTracking`, `piiDetection` |
| 4 | Cross-session memory | PostgresStore | Built into LangGraph, namespace per session/phase |
| 5 | HITL | `interrupt()` + `Command` | Native LangGraph, typed payloads via shared-types |
| 6 | Node version | Stay on Node 20 | No dependency requires 22+, Mastra not viable anyway |
| 7 | Eval framework | Deferred | Add promptfoo when 2-3 phase workers are running |
| 8 | Package location | `backend/src/agents/` (not `packages/orchestrator`) | No separate package until we have a second consumer |

## What Comes From LangGraph/LangChain

### LangGraph Native (already available)

| Feature | Replaces (from V1 design) |
|---------|--------------------------|
| StateGraph + nodes/edges | Custom GraphRuntime + TickWorker |
| `interrupt()` / `Command` | Custom HITL nodes |
| PostgresStore (namespaced) | Custom cross-session MemoryStore |
| Snapshot checkpointing | Custom EventStore + Projectors |
| Functional API (`entrypoint`/`task`) | Custom WorkflowGraph data structure |

### LangChain 1.0 Middleware (selective adoption)

| Middleware | Replaces (from V1 design) | Why selected |
|------------|--------------------------|-------------|
| `toolCallLimit` | TerminationConfig.maxTurns | Battle-tested loop prevention |
| `modelCallLimit` | TerminationConfig.maxTokens | Complements toolCallLimit |
| `modelFallback` | ModelResolver circuit breaker / cascade | Handles provider outages automatically |
| `costTracking` | CostLedger / CostProjector | Per-invocation cost tracking, less code |
| `piiDetection` | GuardrailConfig.piiFilters | Privacy compliance out of the box |

### Middleware NOT adopted (build custom or defer)

| Middleware | Why not |
|------------|---------|
| `humanInTheLoop` | LangGraph `interrupt()` is more flexible for our typed payloads |
| `summarization` | Defer — not needed until context windows become a problem |
| `subagent` | Our phase worker dispatch is BullMQ-based, different model |
| `contentModeration` | Defer — existing socket.validators.ts covers prompt injection |
| `caching` | Defer — Redis cache can be added to specific tools when needed |
| `rateLimit` | Existing BullMQ limiter (5/min) handles this |
| `retry` | BullMQ job retry is more robust (persisted, backoff) |
| `logging` / `tracing` / `validation` | Already have structured Logger + OTel + Zod |

## What We Build Custom (5 Modules)

### Module 1: BullMQ Worker Dispatch

**Why custom**: No framework provides BullMQ integration. Phase workers need process isolation, crash recovery, and concurrency limits.

**Location**: `backend/src/agents/worker-dispatch.ts`

```typescript
interface WorkerDispatchConfig {
  /** Queue name for phase worker jobs */
  queueName: string;
  /** Concurrency per worker type */
  concurrency: Record<OrchestrationStyle, number>;
  /** Timeout per orchestration style */
  timeoutMs: Record<OrchestrationStyle, number>;
  /** Rate limiter (from existing WORKER_PROFILES) */
  limiter: { max: number; duration: number };
}
```

**Behavior**:
- Supervisor node enqueues a BullMQ job with `{ sessionId, phase, context }`
- Worker picks up job, runs the phase subgraph, emits Socket.io events
- On failure: BullMQ retry with exponential backoff (existing pattern)
- On timeout: Job marked failed, supervisor takes fallback edge

### Module 2: Budget Enforcement

**Why custom**: `costTracking` middleware tracks costs but doesn't enforce limits. We need per-session hard/soft caps.

**Location**: `backend/src/agents/budget-enforcer.ts`

```typescript
interface SessionBudget {
  /** Halt all agents if exceeded */
  hardCapUsd: number;
  /** Emit warning event, continue */
  softCapUsd: number;
  /** Per-phase cap — skip phase if exceeded */
  perPhaseCapUsd?: number;
}

interface BudgetState {
  totalCostUsd: number;
  byPhase: Record<string, { costUsd: number; invocations: number }>;
  warnings: string[];
  exceeded: boolean;
}
```

**Behavior**:
- `costTracking` middleware emits cost data after each LLM call
- Budget enforcer reads accumulated costs before each phase dispatch
- If `hardCapUsd` exceeded → stop workflow, emit `budget:exceeded` Socket.io event
- If `softCapUsd` exceeded → log warning, emit `budget:warning`, continue
- Budget state persisted in LangGraph graph state (snapshot)

### Module 3: Phase Capability Registry

**Why custom**: Phase-to-tool mappings, orchestration styles, and termination configs are domain-specific.

**Location**: `backend/src/agents/phase-registry.ts`

```typescript
type OrchestrationStyle = 'react' | 'plan-act' | 'deterministic';

interface PhaseCapability {
  phase: RenovationPhase;
  /** Tools available in this phase */
  tools: string[];
  /** Orchestration strategy */
  style: OrchestrationStyle;
  /** Which phases this can transition to */
  canTransitionTo: RenovationPhase[];
  /** Max LLM turns before forced termination */
  maxTurns: number;
  /** Persona injected into system prompt */
  persona: {
    role: string;
    goal: string;
    backstory: string;
    constraints: string[];
  };
}
```

**Maps to existing code**:
- Extends `backend/src/agents/tool-sets.ts` (ALLOWED_TOOLS per phase)
- Extends `backend/src/config/prompts.ts` (phase prompts)
- New: orchestration style per phase, persona injection, transition rules

### Module 4: Kill Switch + Circuit Breaker

**Why custom**: Safety mechanisms that need Redis — no middleware equivalent.

**Location**: `backend/src/agents/kill-switch.ts` (moves from `utils/agent-killswitch.ts`)

**Kill Switch** (already built):
- Redis key `killswitch:{agentName}` with TTL
- Check before each phase dispatch
- Fails open if Redis unavailable (existing pattern)

**Circuit Breaker** (new):
- Redis sliding-window counter per `{phase}:{tool}`
- Prevents runaway tool loops (e.g., `generate_render` called 50x)
- Configurable: `maxCalls` per `windowSeconds`
- Trips → tool call returns error message, agent can self-correct

### Module 5: Typed Agent Event Emitter

**Why custom**: Discriminated union events that fan out to Socket.io + Logger + OTel. No middleware covers this multiplexing pattern.

**Location**: `backend/src/agents/agent-event-emitter.ts`

```typescript
type AgentEvent =
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

class AgentEventEmitter {
  constructor(
    private io: SocketIOServer,
    private logger: Logger,
    private sessionId: string,
  ) {}

  emit(event: AgentEvent): void {
    // 1. Socket.io → frontend (session room)
    this.io.to(this.sessionId).emit(`agent:${event.type}`, event);
    // 2. Logger → structured logs
    this.logger.info(event.type, event);
    // 3. OTel → span events (if active span)
    const span = trace.getActiveSpan();
    if (span) span.addEvent(event.type, event as unknown as Attributes);
  }
}
```

**Session-scoped**: Created per `processMessage()` call, not singleton.

## Patterns Adopted (Not Imported)

These patterns are implemented in our code, inspired by other frameworks:

| Pattern | Source | How We Apply It |
|---------|--------|----------------|
| 4-layer memory | Mastra | Conversation (messages) + working (graph state) + semantic recall (PostgresStore) + observational (OTel spans) |
| Typed agent events | IBM BeeAI + Google ADK | Discriminated union `AgentEvent` type (Module 5) |
| Agent personas | CrewAI | Role/goal/backstory/constraints per phase (Module 3) |
| Composable termination | AutoGen | `toolCallLimit` + `modelCallLimit` middleware + BullMQ timeout |
| Task-centric progress | ControlFlow | Phase tasks with completion checks (future enhancement) |
| Orchestration styles | IBM watsonx | react / plan-act / deterministic per phase (Module 3) |

## Graph Topology

```
┌─────────────────────────────────────────────────┐
│ LangGraph StateGraph                            │
│                                                 │
│  START → Supervisor (deterministic routing)     │
│           │                                     │
│           ├─→ INTAKE worker (react)             │
│           ├─→ CHECKLIST worker (plan-act)       │
│           ├─→ PLAN worker (plan-act)            │
│           ├─→ RENDER worker (deterministic)     │
│           ├─→ PAYMENT worker (deterministic)    │
│           ├─→ COMPLETE worker (deterministic)   │
│           └─→ ITERATE worker (react)            │
│                    │                            │
│                    ▼                            │
│           Phase Transition Check                │
│           ├─→ interrupt() if transition         │
│           └─→ END if complete                   │
│                                                 │
│  Middleware Stack:                               │
│  ┌─ toolCallLimit ──────────────────────┐       │
│  │ ┌─ modelCallLimit ────────────────┐  │       │
│  │ │ ┌─ modelFallback ───────────┐   │  │       │
│  │ │ │ ┌─ costTracking ──────┐   │   │  │       │
│  │ │ │ │ ┌─ piiDetection ┐  │   │   │  │       │
│  │ │ │ │ │  Agent Call    │  │   │   │  │       │
│  │ │ │ │ └───────────────┘  │   │   │  │       │
│  │ │ │ └────────────────────┘   │   │  │       │
│  │ │ └──────────────────────────┘   │  │       │
│  │ └────────────────────────────────┘  │       │
│  └─────────────────────────────────────┘       │
│                                                 │
│  Custom Modules:                                │
│  [BullMQ Dispatch] [Budget] [Registry]          │
│  [Kill Switch] [Event Emitter]                  │
└─────────────────────────────────────────────────┘
```

## File Plan

### New Files (11)

| File | Module | Wave |
|------|--------|------|
| `backend/src/agents/types.ts` | Shared types (AgentEvent, PhaseCapability, etc.) | 1 |
| `backend/src/agents/state.ts` | LangGraph state annotation | 1 |
| `backend/src/agents/phase-registry.ts` | Phase Capability Registry | 1 |
| `backend/src/agents/supervisor.ts` | Supervisor graph | 1 |
| `backend/src/agents/middleware.ts` | LangChain middleware stack | 1 |
| `backend/src/agents/worker-factory.ts` | Phase worker subgraph factory | 2 |
| `backend/src/agents/phase-workers/intake.worker.ts` | First phase worker | 2 |
| `backend/src/agents/budget-enforcer.ts` | Budget Enforcement | 3 |
| `backend/src/agents/kill-switch.ts` | Kill Switch + Circuit Breaker | 3 |
| `backend/src/agents/agent-event-emitter.ts` | Typed Agent Event Emitter | 3 |
| `backend/src/agents/worker-dispatch.ts` | BullMQ Worker Dispatch | 3 |

### Test Files (8)

| File | Covers | Wave |
|------|--------|------|
| `backend/tests/unit/agents/state.test.ts` | State annotation | 1 |
| `backend/tests/unit/agents/phase-registry.test.ts` | Registry config | 1 |
| `backend/tests/unit/agents/supervisor.test.ts` | Supervisor routing | 1 |
| `backend/tests/unit/agents/middleware.test.ts` | Middleware stack | 1 |
| `backend/tests/unit/agents/worker-factory.test.ts` | Factory + styles | 2 |
| `backend/tests/unit/agents/budget-enforcer.test.ts` | Budget checks | 3 |
| `backend/tests/unit/agents/kill-switch.test.ts` | Kill switch + breaker | 3 |
| `backend/tests/unit/agents/agent-event-emitter.test.ts` | Event fan-out | 3 |

### Existing Files Modified (7)

| File | Change |
|------|--------|
| `backend/src/services/chat.service.ts` | Replace `createReActAgent()` with supervisor graph |
| `backend/src/agents/tool-sets.ts` | Extend with PhaseCapability configs |
| `backend/src/config/prompts.ts` | Accept persona + context params |
| `backend/src/utils/ai-tracing.ts` | Add phase/worker OTel attributes |
| `backend/src/server.ts` | Add phase transition Socket.io events |
| `packages/shared-types/src/socket-events.ts` | New agent event types |
| `packages/shared-types/src/index.ts` | Export new types |

## Implementation Waves

### Wave 1: Foundation (types + state + supervisor + middleware)
- Define all TypeScript interfaces in `types.ts`
- Create LangGraph state annotation with phase, budget, rooms, messages
- Build phase capability registry with all 7 phases configured
- Wire LangChain middleware stack (5 middleware)
- Build supervisor node with deterministic phase routing
- **Tests**: State shape, registry config, supervisor routing, middleware integration
- **Estimate**: ~3 hours

### Wave 2: First Worker (INTAKE as proof-of-concept)
- Build worker factory supporting 3 orchestration styles
- Extract INTAKE phase as first subgraph with react style
- Wire supervisor → INTAKE → transition check → interrupt
- Integrate with existing `chat.service.ts`
- **Tests**: Factory creates correct graph per style, INTAKE processes messages
- **Estimate**: ~2 hours

### Wave 3: Safety + Events (custom modules)
- Budget enforcer (reads costTracking middleware output)
- Kill switch (move from `utils/`, add circuit breaker)
- Agent event emitter (Socket.io + Logger + OTel fan-out)
- BullMQ worker dispatch (job enqueue/dequeue for phase workers)
- **Tests**: Budget limits, kill switch, circuit breaker, event emission
- **Estimate**: ~3 hours

### Wave 4: Remaining Workers (6 phases)
- Extract CHECKLIST + PLAN as plan-act workers
- Extract RENDER + PAYMENT + COMPLETE as deterministic workers
- Extract ITERATE as react worker
- Wire all into supervisor graph
- **Tests**: Each worker processes its phase correctly
- **Estimate**: ~2 hours

### Wave 5: Integration + Cleanup
- Update `chat.service.ts` to use supervisor graph
- Add phase transition Socket.io events
- Update OTel tracing with phase/worker attributes
- Remove dead code (old `createReActAgent()` path)
- End-to-end integration test
- **Estimate**: ~2 hours

**Total: ~12 hours** (Waves 1-5)

## What's Deferred

| Feature | From V1 Design | When to Add |
|---------|----------------|-------------|
| Event sourcing | EventStore + Projectors | When audit/replay is needed |
| Eval framework | Evaluation Scorers | When 2-3 workers are running (use promptfoo) |
| Anomaly detection | 4-layer defense | After budget enforcement proves insufficient |
| Memory reflection | Reflection/synthesis workers | After cross-session patterns emerge |
| MCP tool server | Interop module | When external consumers need our tools |
| A2A agent cards | Interop module | When cross-org agent communication is needed |
| BDI cognitive snapshots | Observability module | After basic OTel proves insufficient |
| Durable execution | Event replay mechanism | If snapshot recovery proves insufficient |
| `packages/orchestrator` extraction | Separate package | When a second consumer (e.g., dev agents) needs the framework |

## Relationship to V1 Design

The V1 design (`2026-02-26-orchestrator-framework-design.md`) remains as **reference architecture**. It documents the full vision including event sourcing, anomaly detection, BDI snapshots, and other advanced patterns. This Hybrid B+A design is the **implementation plan** — what we actually build first.

When a deferred feature is needed, refer to V1 for the detailed design, then implement it on top of the Hybrid B+A foundation.

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| LangChain 1.0 middleware API changes | MEDIUM | Only using 5 stable middleware; can replace with custom if API breaks |
| Streaming metadata with subgraphs | HIGH | Wave 1 spike test for namespaced node names |
| `interrupt()` + `graph.stream()` interaction | MEDIUM | Wave 1 spike test; check `graph.getState()` after stream |
| Checkpoint compatibility with existing data | LOW | New graph, no legacy checkpoints to migrate |
| BullMQ + LangGraph state sync | MEDIUM | Worker reads state from graph, writes results back atomically |

## Research Sources

- **Feb 27 fresh research**: 4 parallel agents surveyed ADK v0.4.0, LangGraph v1.2.0, Mastra v1.8.0, emerging frameworks
- **ADK blocker**: Zod 4 hard requirement (`^4.2.1` vs our `^3.24.1`)
- **Mastra blocker**: All packages require `@mastra/core` + Node 22.13+
- **LangChain 1.0 middleware**: 16 prebuilt, 8 overlap with V1 design
- **promptfoo**: MIT, standalone eval framework, Node 20+ (deferred)
- **Notion page**: [Feb 27 Framework Comparison](https://www.notion.so/314650424122810597e7ebb6a3f1c341)
- **V1 design**: `docs/plans/2026-02-26-orchestrator-framework-design.md`
