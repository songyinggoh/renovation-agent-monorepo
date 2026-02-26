# Orchestrator Framework — Design Document

**Date**: 2026-02-26
**Status**: Approved
**Package**: `packages/orchestrator`

## Problem

The project has 6 specialist agents (scaffold, migration, test, review, research, implement), 10 tools, and a Redis kill switch — but zero orchestration. Agents cannot communicate, share state, hand off work, retry on failure, or be composed into workflows. The existing plan (supervisor + SOP workflow) scored 2/15 on a multi-agent framework checklist. This design replaces that plan with a general-purpose, agent-agnostic orchestration framework that targets 15/15.

## Architectural Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Scope | General-purpose, agent-agnostic | Dev agents and renovation agents are just "agent packs" plugged into the same framework |
| 2 | Execution model | Worker-based (BullMQ) | True parallel execution, process isolation, crash recovery via job retries |
| 3 | State model | Event-sourced append-only log | No write conflicts, natural audit trail, state derived by replaying events |
| 4 | Routing model | Declarative graph + runtime | Supports all topologies (sequential, branching, cycles, fan-out/fan-in). HITL is a node type |
| 5 | LLM abstraction | Capability-based model resolution | Agents declare requirements, framework resolves to concrete models. Zero provider coupling |
| 6 | Package location | `packages/orchestrator` | Enforces agent-agnosticism — framework cannot depend on domain code |

## Core Abstractions

### 1. AgentDefinition

A unit of work with declared capabilities. Agents never import model providers.

```typescript
interface AgentDefinition {
  /** Unique name used for routing, kill switch keys, and observability */
  name: string;
  /** Human-readable description for supervisor/routing context */
  description: string;
  /** Tools this agent can use — defines its capability boundary */
  tools: ToolDefinition[];
  /** What the agent needs from an LLM — resolved at runtime */
  modelRequirements: ModelRequirements;
  /** System prompt or prompt template */
  prompt: string;
  /** Execution constraints */
  execution: {
    timeoutMs: number;
    maxRetries: number;
    concurrency: number;
    sandbox: 'process' | 'docker';
  };
}
```

### 2. WorkflowGraph

A declarative data structure defining how agents compose. The graph is data, not code — it could be stored in a database.

```typescript
interface WorkflowGraph {
  /** Unique identifier for this graph definition */
  id: string;
  /** Human-readable name */
  name: string;
  /** Nodes — each references an agent by name */
  nodes: NodeDefinition[];
  /** Edges — conditions evaluated against the event log */
  edges: EdgeDefinition[];
  /** Where execution begins */
  entryNode: string;
  /** Nodes that signify completion */
  terminalNodes: string[];
  /** Nodes that pause for human approval */
  hitlNodes: string[];
  /** Global loop breaker — max times the runtime can tick */
  maxIterations: number;
}

interface NodeDefinition {
  id: string;
  agentName: string;
  /** Optional: override agent's default model requirements for this node */
  modelRequirements?: Partial<ModelRequirements>;
}

interface EdgeDefinition {
  from: string;
  to: string;
  /** Condition evaluated against derived state. Omit for unconditional */
  condition?: EdgeCondition;
}

interface EdgeCondition {
  /** Event type that must exist (or not) in the log */
  eventType: string;
  /** Whether the event must be present or absent */
  exists: boolean;
  /** Optional: filter on event payload fields */
  payloadMatch?: Record<string, unknown>;
}
```

### 3. AgentEvent

The unit of state. All communication between agents, the runtime, and humans flows through events.

```typescript
interface AgentEvent {
  /** ULID — sortable, unique */
  id: string;
  /** Which workflow run this belongs to */
  workflowRunId: string;
  /** Which agent (or 'runtime' or 'human') produced this event */
  sourceAgent: string;
  /** Event type — domain-specific, e.g., 'research_completed', 'test_failed' */
  type: string;
  /** Arbitrary structured data */
  payload: Record<string, unknown>;
  /** When the event was created */
  timestamp: Date;
}
```

## Event Store

PostgreSQL append-only table. Single source of truth.

```sql
CREATE TABLE workflow_events (
  id              TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  source_agent    TEXT NOT NULL,
  type            TEXT NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_run_id ON workflow_events (workflow_run_id, id);
```

### State Derivation

Current state is never stored — it is derived by folding events through a projector:

```typescript
interface Projector<T> {
  initial: T;
  reduce: (state: T, event: AgentEvent) => T;
}

function deriveState<T>(events: AgentEvent[], projector: Projector<T>): T {
  return events.reduce(projector.reduce, projector.initial);
}
```

Projectors are domain-specific. The framework provides the fold mechanism. Consumers define what shape they need:

```typescript
// Example: dev workflow projector
const devWorkflowProjector: Projector<DevWorkflowState> = {
  initial: { phase: 'idle', filesModified: [], testsPassed: false },
  reduce(state, event) {
    switch (event.type) {
      case 'research_completed':
        return { ...state, phase: 'planning', research: event.payload };
      case 'test_failed':
        return { ...state, testsPassed: false, lastError: event.payload };
      case 'file_modified':
        return { ...state, filesModified: [...state.filesModified, event.payload.path] };
      default:
        return state;
    }
  }
};
```

### Memory Tiering

- **Short-term**: Events from the current workflow run. Agents receive these as context.
- **Long-term**: A separate projector summarizes completed workflow runs into a `workflow_memory` table. Future agents can query past patterns (e.g., "what approach worked last time for this type of task").

## Graph Runtime

The engine that reads the graph, reads the event log, and dispatches agents.

### Runtime Loop

```
1. Load workflow graph definition
2. Replay event log → derive current position (which node(s) are active)
3. Evaluate outgoing edges from current node(s)
4. For each edge whose condition is TRUE:
   ├── HITL node?  → append "awaiting_approval", stop
   ├── Fan-out?    → dispatch multiple BullMQ jobs
   └── Normal?     → dispatch one BullMQ job
5. Worker completes → appends events → enqueues a "tick"
6. Tick worker wakes up → goto 2

STOP conditions:
  - Terminal node reached
  - maxIterations exceeded
  - Kill switch triggered on all available next agents
```

### Tick-Driven (No Polling)

The runtime is reactive, not polling. BullMQ worker completion triggers the next evaluation:

```typescript
// Agent worker finishes:
await eventStore.append(workflowRunId, newEvents);
await tickQueue.add('tick', { workflowRunId });

// Tick worker processes:
tickQueue.process(async (job) => {
  const { workflowRunId } = job.data;
  const graph = await loadGraph(workflowRunId);
  const events = await eventStore.getEvents(workflowRunId);
  const position = derivePosition(graph, events);

  if (position.isTerminal) return;
  if (position.isHitl) return;
  if (position.iterationCount >= graph.maxIterations) {
    await eventStore.append(workflowRunId, [{ type: 'max_iterations_exceeded' }]);
    return;
  }

  for (const nextNode of position.readyNodes) {
    if (!await isAgentEnabled(nextNode.agentName)) {
      await eventStore.append(workflowRunId, [{
        type: 'agent_disabled',
        sourceAgent: 'runtime',
        payload: { agent: nextNode.agentName, reason: 'kill_switch' },
      }]);
      continue;
    }
    await agentQueue.add(nextNode.agentName, {
      workflowRunId,
      nodeId: nextNode.id,
    });
  }
});
```

### Fan-Out / Fan-In

Fan-out: a node with multiple outgoing edges whose conditions are all true. The runtime dispatches all target agents as parallel BullMQ jobs.

Fan-in (join): a node with multiple incoming edges. The runtime only advances past it when ALL upstream agents have emitted their completion events. The `derivePosition` function checks this:

```
research ──→ [fan-out] ──→ analyze_frontend (worker 1)
                       ──→ analyze_backend  (worker 2)
                       ──→ analyze_database (worker 3)
                            │
                       [fan-in: wait for all 3]
                            │
                       ──→ synthesize_findings
```

### Human-in-the-Loop

HITL nodes are first-class. When the runtime reaches one:

1. Appends `awaiting_approval` event
2. Stops (no tick enqueued)
3. External trigger (CLI, API, webhook) appends `approved` or `rejected` event AND enqueues a tick
4. Runtime resumes, evaluates edges (approved → execute, rejected → revise)

No special infrastructure. It's an event gap that a human fills.

## Model Resolver

Agents declare requirements. The framework resolves to concrete models.

### ModelRequirements

```typescript
interface ModelRequirements {
  reasoning: 'low' | 'medium' | 'high';
  speed: 'fast' | 'moderate' | 'slow-ok';
  maxCostPer1kTokens?: number;
  capabilities?: ('vision' | 'tool-use' | 'structured-output')[];
}
```

### Model Registry

Configuration — not code. One entry per available model:

```typescript
interface ModelRegistryEntry {
  id: string;                    // e.g., 'claude-sonnet-4-6'
  provider: string;              // e.g., 'anthropic'
  reasoning: 'low' | 'medium' | 'high';
  speed: 'fast' | 'moderate' | 'slow-ok';
  costPer1kTokens: number;
  capabilities: string[];
  factory: (apiKey: string) => BaseChatModel;
}
```

### Resolution Algorithm

1. Filter models that meet ALL requirements (reasoning, speed, cost, capabilities)
2. Sort by cost ascending
3. Pick the cheapest qualifying model
4. If no model qualifies, throw with a descriptive error

New model released? Add one registry entry. All agents whose requirements it satisfies can use it immediately. Zero agent code changes.

## Environment Isolation

Three layers, escalating:

### Layer 1 — Tool Restrictions

Agents receive curated tool subsets. The review agent cannot write files because it doesn't have `file_write` in its tools array. Enforced at agent registration — not by prompt instructions.

### Layer 2 — Process Isolation (Default)

Every agent runs in its own BullMQ worker process. A runaway agent (infinite loop, memory leak, crash) is contained:

- **Timeout**: Per-agent BullMQ job timeout (e.g., scaffold: 60s, implement: 300s)
- **Memory**: Worker crash → BullMQ marks job failed → runtime evaluates fallback edges
- **No shared memory**: Agents communicate only through the event store

### Layer 3 — Docker Sandbox (Opt-In)

For agents that execute arbitrary/untrusted code:

```typescript
const sandboxedBashTool = createDockerBashTool({
  image: 'node:22-slim',
  mountWorkdir: true,
  networkMode: 'none',
  memoryLimit: '512m',
  timeoutMs: 60_000,
});
```

Agents with `sandbox: 'docker'` in their execution config use containerized tools. Most agents use Layer 2 (process isolation) — Docker is only for untrusted execution.

### Isolation by Agent Type

| Agent type | Tools | Process | Docker |
|---|---|---|---|
| Research / Review | Read-only | Yes | No |
| Scaffold / Migration | Write, no git | Yes | No |
| Implement | Full + git | Yes | Optional |
| Arbitrary code exec | Custom | Yes | Yes |

## Observability

Three levels:

### Level 1 — Event Log (Built-In)

The event store is the primary audit trail. Every agent action, runtime decision, and human intervention is an event. Replay any workflow run to reconstruct exactly what happened.

### Level 2 — OTel Spans (Per-Worker)

Each BullMQ worker wraps execution in an OpenTelemetry span. Attributes include agent name, workflow run ID, node ID, resolved model, tools invoked, events emitted, and duration. Integrates with existing `backend/src/config/telemetry.ts`.

### Level 3 — Tool-Level Logging (Already Exists)

Individual tools log via structured Logger. No changes needed.

## Governance

### Kill Switch (Already Built)

`agent-killswitch.ts` — disable any agent by name via Redis key. TTL auto-expiry prevents permanent lockout. Tick worker checks before dispatching.

### Termination — Three Layers

| Layer | Mechanism | Catches |
|---|---|---|
| Graph-level | Terminal nodes | Normal completion |
| Loop breaker | `maxIterations` per graph | Agents stuck in cycles |
| Agent-level | BullMQ `attempts` + `backoff` | Single agent failing repeatedly |

### Circuit Breaker (Per-Action Rate Limiting)

The kill switch is binary (on/off). A circuit breaker catches subtler runaway behavior — an agent calling a tool 50 times in a loop. Uses a Redis sliding-window counter (INCR + EXPIRE):

```typescript
interface CircuitBreakerOptions {
  agentId: string;
  action: string;          // e.g., 'generate_render', 'bash_exec'
  maxCalls: number;        // e.g., 5 calls
  windowSeconds: number;   // e.g., per 60 seconds
}

async function checkCircuitBreaker(opts: CircuitBreakerOptions): Promise<boolean> {
  const key = `cb:${opts.agentId}:${opts.action}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, opts.windowSeconds);
  return count <= opts.maxCalls;
}
```

The agent worker harness checks the circuit breaker before each tool invocation. If the breaker trips, the tool call returns an error message instead of executing — the agent can self-correct or the runtime takes a fallback edge.

**Location:** `packages/orchestrator/src/governance/circuit-breaker.ts`

## MCP Tool Server (Framework-Agnostic Tool Exposure)

Tools in the framework are LangChain `StructuredTool` objects. MCP (Model Context Protocol) wraps them in a standard protocol so any MCP-compatible agent framework can discover and call them — not just our orchestrator.

### Architecture

```
packages/orchestrator
  └── MCP Server (stdio or HTTP transport)
        └── Tools registered in AgentRegistry
              ↑ consumed by
  ┌────────────────────────────────────────────────┐
  │  Any MCP-compatible agent                      │
  │  - Our orchestrator (direct, no MCP overhead)  │
  │  - Google ADK (native MCP support)             │
  │  - Amazon Bedrock (native MCP support)         │
  │  - External partner systems                    │
  └────────────────────────────────────────────────┘
```

### How It Works

The MCP server auto-generates tool definitions from the `AgentRegistry`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

function createMcpServer(registry: AgentRegistry): McpServer {
  const server = new McpServer({ name: 'orchestrator-tools', version: '1.0.0' });

  for (const agent of registry.getAllAgents()) {
    for (const tool of agent.tools) {
      server.tool(tool.name, tool.description, tool.schema, async (input) => {
        const result = await tool.invoke(input);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      });
    }
  }

  return server;
}
```

**Packages required:** `@modelcontextprotocol/sdk` (MIT, free), `@langchain/mcp-adapters` (MIT, free) — both already evaluated in research.

**Location:** `packages/orchestrator/src/interop/mcp-server.ts`

**When to enable:** Optional. Agents within the orchestrator use tools directly (zero overhead). Enable the MCP server only when external frameworks need to call the same tools.

## Cross-Session Memory (PostgresStore)

The event store provides short-term memory (current workflow run). For long-term cross-session memory, the framework integrates `PostgresStore` from `@langchain/langgraph-checkpoint-postgres` (already installed — zero new dependencies).

### Two-Layer Memory Architecture

| Layer | Storage | Scope | Use for |
|---|---|---|---|
| Short-term | Event store (workflow_events table) | Current workflow run | Agent context, hand-off data, in-flight state |
| Long-term | PostgresStore (namespaced key-value) | Cross-run, cross-workflow | User preferences, learned patterns, project conventions |

### How It Works

At workflow completion, a **memory projector** summarizes the run's events into durable long-term entries:

```typescript
import { PostgresStore } from '@langchain/langgraph-checkpoint-postgres/store';

interface MemoryService {
  store: PostgresStore;

  /** Save a memory from a completed workflow run */
  saveMemory(namespace: string[], key: string, value: Record<string, unknown>): Promise<void>;

  /** Retrieve memories for context injection into new workflow runs */
  getMemories(namespace: string[], options?: { query?: string; limit?: number }): Promise<SearchItem[]>;
}
```

Agents receive relevant long-term memories as part of their context when dispatched:

```typescript
// In the agent worker harness, before invoking the agent:
const memories = await memoryService.getMemories(
  [workflowRunId, 'context'],
  { query: agentDefinition.name, limit: 5 }
);
// Inject memories into the agent's event context
```

**Location:** `packages/orchestrator/src/memory/memory-service.ts`

### Namespace Strategy

```
[userId, 'preferences']     → user style/budget preferences
[projectId, 'conventions']  → learned project patterns
[agentName, 'feedback']     → corrections received from reviews
```

## Event Triggers (Automatic Workflow Spawning)

System events can automatically start new workflow runs without human intervention. A trigger watches the event store for specific patterns and spawns workflows in response.

### Architecture

```
Event Store ──→ Trigger Listener ──→ matches pattern? ──→ Start new workflow run
                                                     ──→ (no match, skip)
```

### Trigger Definition

```typescript
interface EventTrigger {
  /** Unique trigger name */
  name: string;
  /** Event type pattern to watch for */
  eventType: string;
  /** Optional payload filter */
  payloadMatch?: Record<string, unknown>;
  /** Which workflow graph to start */
  workflowGraphId: string;
  /** How to derive the new workflow's initial events from the triggering event */
  deriveInput: (triggeringEvent: AgentEvent) => AgentEvent[];
  /** Cooldown — prevent re-triggering within this window */
  cooldownMs?: number;
}
```

### Example: Render Complete → Update Checklist

```typescript
const renderCompleteTrigger: EventTrigger = {
  name: 'render-complete-update-checklist',
  eventType: 'render_completed',
  workflowGraphId: 'checklist-update',
  deriveInput: (event) => [{
    id: ulid(),
    workflowRunId: '',  // filled by runtime
    sourceAgent: 'trigger',
    type: 'trigger_context',
    payload: {
      sessionId: event.payload.sessionId,
      roomId: event.payload.roomId,
      assetId: event.payload.assetId,
      reason: 'render_completed',
    },
    timestamp: new Date(),
  }],
  cooldownMs: 60_000,  // Don't re-trigger within 1 minute
};
```

### How It Works

The trigger listener runs as a BullMQ worker that processes a dedicated `trigger-check` queue. When any agent worker appends events, it also enqueues a trigger check. The listener evaluates all registered triggers against the new events and spawns matching workflows.

**Location:** `packages/orchestrator/src/triggers/event-trigger.ts`

**Use cases:**
- Render complete → update checklist automatically
- Test failure → spawn a fix-and-retry workflow
- New contractor bid → summarize and notify
- Session idle >24h → re-engagement workflow

## Checklist Scorecard: 15/15

| # | Item | Mechanism | Augmented by |
|---|---|---|---|
| 1 | Tool-Use (Function Calling) | Agents have tools, use ReAct to decide when/how | — |
| 2 | Self-Correction | BullMQ retry + fallback edges in graph | **Circuit breaker** catches tool-call loops before kill switch needed |
| 3 | Planning Capability | ReAct agents + graph structure is itself a plan | — |
| 4 | Flexible Topologies | Declarative graph: sequential, branching, cycles, fan-out/fan-in | — |
| 5 | Hand-off Mechanism | Runtime dispatches next agent with full event history | — |
| 6 | Broadcast vs. Direct | Fan-out edges = broadcast, single edges = direct | — |
| 7 | Shared Context Window | Event log — any agent can replay all events from the run | **Long-term memories** injected as context at dispatch |
| 8 | Persistence | PostgreSQL event store — resume by replaying events | — |
| 9 | Memory Tiering | Short-term = current run events. Long-term = cross-run projector | **PostgresStore** provides concrete long-term memory storage |
| 10 | HITL | HITL nodes pause runtime, human appends event, runtime resumes | — |
| 11 | Termination Conditions | Terminal nodes + maxIterations + per-agent retry limits | **Circuit breaker** adds per-action rate limiting (4th layer) |
| 12 | Observability | Event log + OTel spans + tool-level logs (3 levels) | — |
| 13 | Environment Isolation | Tool subsets → process isolation → Docker sandbox (3 layers) | — |
| 14 | Async Support | BullMQ workers = true parallel execution | **Event triggers** spawn workflows from system events automatically |
| 15 | Model Agnostic | Capability-based resolver, agents never import providers | **MCP server** makes tools framework-agnostic too (LangGraph, ADK, Bedrock) |

## The Litmus Test

Remove the orchestrator (tick worker + graph runtime) and you have: disconnected BullMQ queues, an event table nobody reads, and agents that can't find each other. The runtime is the framework. But the agents CAN negotiate non-linear paths — fallback edges, retry loops, fan-out/fan-in, HITL interrupts — all driven by the graph definition and event conditions.

## Package Boundary

`packages/orchestrator` exports:

```typescript
// Core
export { EventStore, type AgentEvent } from './core/event-store';
export { GraphRuntime, type WorkflowGraph, type NodeDefinition, type EdgeDefinition } from './core/graph-runtime';
export { deriveState, type Projector } from './core/projector';

// Agents
export { AgentRegistry, type AgentDefinition } from './agents/registry';
export { type ModelRequirements } from './models/types';
export { ModelResolver } from './models/resolver';

// Workers
export { createAgentWorker } from './workers/agent-worker';
export { createTickWorker } from './workers/tick-worker';

// Governance
export { isAgentEnabled, disableAgent, enableAgent } from './governance/kill-switch';
export { checkCircuitBreaker, type CircuitBreakerOptions } from './governance/circuit-breaker';

// Memory
export { MemoryService } from './memory/memory-service';

// Triggers
export { EventTriggerRegistry, type EventTrigger } from './triggers/event-trigger';

// Interop
export { createMcpServer } from './interop/mcp-server';

// Observability
export { type WorkflowTrace } from './observability/types';

// Tools (reusable)
export { createDockerBashTool } from './tools/docker-bash';
```

The framework imports nothing from `backend/src/` or `frontend/`. Domain code (dev agents, renovation agents) imports from the framework.

## Relationship to Existing Code

### What stays
- `backend/src/dev-agents/tools/` — tools are framework-agnostic, will be used as-is
- `backend/src/dev-agents/*/prompt.ts` — prompts are reusable
- `backend/src/utils/agent-killswitch.ts` — moves into `packages/orchestrator/src/governance/`
- `backend/src/config/redis.ts` — shared infrastructure, imported by the orchestrator package
- `backend/src/config/queue.ts` — BullMQ config extended with orchestrator queues

### What gets replaced
- `backend/src/dev-agents/*/agent.ts` — the `createReactAgent` wrappers become `AgentDefinition` objects registered with the framework
- `backend/src/dev-agents/types.ts` — `WorkflowState` replaced by event-sourced projectors
- `backend/src/dev-agents/index.ts` — barrel re-export replaced by agent registry calls

### What was never built (and is now superseded)
- `supervisor.ts` (Task 10) — replaced by graph runtime
- `cli.ts` (Task 11) — new CLI built against the orchestrator API
- `guards.ts` (Task 12) — branch isolation becomes an agent execution constraint
- `workflow/sop-graph.ts` (Task 13) — replaced by a declarative WorkflowGraph definition
- `cli-workflow.ts` (Task 14) — replaced by new CLI with tick-driven resume
- `workflow/quality-gates.ts` (Task 15) — becomes a regular agent in the framework

---

## Appendix A: Package Directory Structure

```
packages/orchestrator/
├── src/
│   ├── core/           # Graph runtime, event store, projector, workflow engine
│   ├── agents/         # Agent registry, base agent interface
│   ├── models/         # Capability-based model resolver, model registry
│   ├── workers/        # BullMQ agent worker harness, tick worker
│   ├── governance/     # Kill switch, circuit breaker
│   ├── memory/         # PostgresStore-backed cross-session memory service
│   ├── triggers/       # Event trigger registry and listener
│   ├── interop/        # MCP tool server, future A2A agent cards
│   ├── observability/  # OTel trace emitter, event logger, workflow trace types
│   ├── tools/          # Framework-provided tools (e.g., createDockerBashTool)
│   └── index.ts        # Public API barrel export
├── package.json
└── tsconfig.json
```

## Appendix B: Concrete Model Registry Example

Four models spanning two providers, demonstrating how the resolver picks the cheapest qualifying model:

```typescript
const modelRegistry: ModelRegistryEntry[] = [
  {
    id: 'claude-haiku-4-5',
    provider: 'anthropic',
    reasoning: 'low',
    speed: 'fast',
    costPer1kTokens: 0.001,
    capabilities: ['tool-use', 'structured-output'],
    factory: (apiKey) => new ChatAnthropic({
      modelName: 'claude-haiku-4-5-20251001',
      anthropicApiKey: apiKey,
      temperature: 0,
      maxTokens: 4096,
    }),
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    reasoning: 'medium',
    speed: 'moderate',
    costPer1kTokens: 0.003,
    capabilities: ['vision', 'tool-use', 'structured-output'],
    factory: (apiKey) => new ChatAnthropic({
      modelName: 'claude-sonnet-4-6',
      anthropicApiKey: apiKey,
      temperature: 0,
      maxTokens: 8192,
    }),
  },
  {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    reasoning: 'high',
    speed: 'slow-ok',
    costPer1kTokens: 0.015,
    capabilities: ['vision', 'tool-use', 'structured-output'],
    factory: (apiKey) => new ChatAnthropic({
      modelName: 'claude-opus-4-6',
      anthropicApiKey: apiKey,
      temperature: 0,
      maxTokens: 8192,
    }),
  },
  {
    id: 'gemini-2.5-flash',
    provider: 'google',
    reasoning: 'medium',
    speed: 'fast',
    costPer1kTokens: 0.0,  // free tier
    capabilities: ['vision', 'tool-use', 'structured-output'],
    factory: (apiKey) => new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey,
      temperature: 0,
      maxOutputTokens: 8192,
    }),
  },
  // Add any new model here — zero agent code changes
];
```

## Appendix C: Agent Registration Example

How the existing scaffold agent transforms from a `createReactAgent` wrapper into an `AgentDefinition`. Note: no model import, no provider reference.

```typescript
import { writeTools } from '../tools/index.js';
import { SCAFFOLD_AGENT_PROMPT } from './prompt.js';
import type { AgentDefinition } from '@renovation/orchestrator';

export const scaffoldAgent: AgentDefinition = {
  name: 'scaffold',
  description: 'Generates boilerplate following project conventions by reading existing files as templates',
  tools: writeTools,
  prompt: SCAFFOLD_AGENT_PROMPT,
  modelRequirements: {
    reasoning: 'medium',
    speed: 'moderate',
    capabilities: ['tool-use'],
  },
  execution: {
    timeoutMs: 60_000,
    maxRetries: 2,
    concurrency: 1,
    sandbox: 'process',
  },
};
```

## Appendix D: OTel Span Attributes

Each BullMQ agent worker execution produces an OpenTelemetry span with these attributes:

```typescript
{
  traceId: "<workflow_run_id>",
  spanName: "agent:scaffold",
  attributes: {
    "agent.name": "scaffold",
    "workflow.run_id": "wf_01J...",
    "workflow.node_id": "node_3",
    "model.resolved": "claude-sonnet-4-6",
    "model.provider": "anthropic",
    "model.cost_per_1k_tokens": 0.003,
    "tools.available": ["file_read", "file_write", "file_edit", "bash_exec", "codebase_search", "file_find", "git_status", "git_diff"],
    "tools.invoked": ["file_read", "codebase_search", "file_write"],
    "events.emitted": 3,
    "events.types": ["file_created", "file_created", "scaffold_completed"],
    "duration_ms": 14200,
  }
}
```

Integrates with existing `backend/src/config/telemetry.ts` infrastructure — no new tracing backend needed.

## Appendix E: Brainstorming Decision Log

Decisions made during the design session (2026-02-26):

| Question | Options Evaluated | Choice | Why |
|---|---|---|---|
| What workload does this serve? | A) Dev agents only, B) Renovation agents only, C) General-purpose agent-agnostic | C | Scores highest on checklist; both dev and renovation agents become "packs" |
| Execution model? | A) In-process single event loop, B) Worker-based BullMQ, C) Hybrid | B | True parallel, process isolation, crash recovery. Existing BullMQ infra reused |
| State model? | A) Centralized mutable row, B) Event-sourced append-only log | B | No write conflicts, natural audit trail, observability and memory tiering for free |
| Routing model? | A) Central supervisor, B) Reactive event-driven, C) Declarative graph + runtime | C | Subsumes A and B. Covers 13/15 checklist items vs 9/15 and 8/15 |
| LLM abstraction? | A) Multi-provider imports, B) Multi-tier single provider, C) Capability-based resolution | C | Only option where agents never import a provider. True model agnosticism |
| Package location? | A) Inside backend/src, B) Separate monorepo package, C) Standalone repo | B | Enforces framework boundary. Already have packages/ with shared-types |
