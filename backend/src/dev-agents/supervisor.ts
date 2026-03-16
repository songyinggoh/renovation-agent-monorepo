import { createSupervisor } from '@langchain/langgraph-supervisor';
import { createDevModel } from '../config/claude.js';
import { getCheckpointer } from '../services/checkpointer.service.js';
import { createScaffoldAgent } from './scaffold/agent.js';
import { createMigrationAgent } from './migration/agent.js';
import { createTestAgent } from './test/agent.js';
import { createReviewAgent } from './review/agent.js';
import { createResearchAgent } from './research/agent.js';
import { createImplementAgent } from './implement/agent.js';
import { DEV_AGENT_NAMES } from './types.js';

/**
 * Supervisor prompt with routing rules for all 6 specialist agents.
 *
 * The supervisor routes developer requests to exactly one specialist per turn.
 * It never dispatches multiple agents simultaneously.
 */
export const DEV_SUPERVISOR_PROMPT = `You are a development supervisor that manages a team of specialist agents. Your job is to route developer requests to the right specialist and coordinate their work.

## Available Specialists

- **scaffold-agent**: Generate new files following project patterns (components, tools, services, routes, tests). Use when the developer asks to scaffold, create, or generate boilerplate.
- **migration-agent**: Create or modify Drizzle ORM schemas and generate database migrations. Use for any schema change, new table, column addition, or migration workflow.
- **test-agent**: Run tests, analyze failures, diagnose broken tests, and fix them. Use when the developer asks to run tests, fix failing tests, or improve test coverage.
- **review-agent**: Review code for quality, security, and convention compliance against CLAUDE.md standards. Use for code reviews, audits, or quality checks. This agent is READ-ONLY.
- **research-agent**: Analyze codebase architecture, search for patterns, understand existing implementations. Use when the developer needs to understand how something works before making changes.
- **implement-agent**: Write code changes following TDD (test first, then implementation). Use when the developer asks to implement a feature, fix a bug, or make code changes.

## Routing Rules

1. Route to exactly ONE specialist per turn. Never dispatch multiple agents at once.
2. If the request is ambiguous, ask the developer for clarification before routing.
3. For multi-step tasks, break them down and route to one specialist at a time:
   - Research first (research-agent), then implement (implement-agent), then test (test-agent), then review (review-agent).
4. If a specialist reports failure, decide whether to retry with the same agent or escalate to a different one.
5. Always report the specialist's output back to the developer clearly.

## Task Classification

- "scaffold a new ..." / "create a new ..." / "generate ..." → scaffold-agent
- "add a column" / "new table" / "schema change" / "migration" → migration-agent
- "run tests" / "fix tests" / "test coverage" / "why is this test failing" → test-agent
- "review" / "audit" / "check quality" / "security check" → review-agent
- "how does ... work" / "find where ..." / "analyze ..." / "understand ..." → research-agent
- "implement" / "fix" / "add feature" / "change behavior" / "refactor" → implement-agent
`;

/**
 * Create the dev supervisor graph.
 *
 * Routes developer requests to 6 specialist agents:
 * scaffold, migration, test, review, research, implement.
 *
 * Each specialist is created via createAgent() (langchain) which returns a ReactAgent.
 * createSupervisor expects CompiledStateGraph[], so we pass agent.graph for each.
 *
 * @returns Compiled supervisor graph ready for .invoke() or .stream()
 */
export function createDevSupervisor() {
  // Create all 6 specialist agents
  const scaffoldAgent = createScaffoldAgent();
  const migrationAgent = createMigrationAgent();
  const testAgent = createTestAgent();
  const reviewAgent = createReviewAgent();
  const researchAgent = createResearchAgent();
  const implementAgent = createImplementAgent();

  // createSupervisor expects CompiledStateGraph[] — ReactAgent exposes .graph
  const supervisorGraph = createSupervisor({
    agents: [
      scaffoldAgent.graph,
      migrationAgent.graph,
      testAgent.graph,
      reviewAgent.graph,
      researchAgent.graph,
      implementAgent.graph,
    ],
    llm: createDevModel(),
    prompt: DEV_SUPERVISOR_PROMPT,
    outputMode: 'last_message',
    supervisorName: DEV_AGENT_NAMES.SUPERVISOR,
    includeAgentName: 'inline',
  });

  // Compile with the shared checkpointer for pause/resume support
  return supervisorGraph.compile({
    checkpointer: getCheckpointer(),
  });
}
