/**
 * SOP Workflow State Machine
 *
 * Enforces the CLAUDE.md SOP as a LangGraph state machine:
 *   START → ensure_branch → research → plan → [INTERRUPT: human approval]
 *     → implement → test → quality_gates → review → complete → END
 *
 * Key behaviors:
 * - Sequential execution: one agent per node, no parallel file conflicts
 * - Human-in-the-loop: graph halts at await_approval via LangGraph interrupt()
 * - Test retry loop: if tests fail, routes back to implement (max 3 retries)
 * - Quality gates: lint + type-check + test; failure routes back to implement
 * - Checkpointed: pause/resume via PostgresSaver
 */

import {
  Annotation,
  StateGraph,
  START,
  END,
  interrupt,
} from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { ensureDevBranch } from '../guards.js';
import { createResearchAgent } from '../research/agent.js';
import { createImplementAgent } from '../implement/agent.js';
import { createTestAgent } from '../test/agent.js';
import { createReviewAgent } from '../review/agent.js';
import { runQualityGates } from './quality-gates.js';
import { getCheckpointer } from '../../services/checkpointer.service.js';
import { Logger } from '../../utils/logger.js';

const logger = new Logger({ serviceName: 'SOPWorkflow' });

/** Maximum test → implement retry loops before forcing forward */
export const MAX_TEST_RETRIES = 3;

/**
 * SOP Workflow state annotation.
 *
 * Each field is tracked across the full workflow lifecycle.
 * LangGraph serializes this to the checkpointer for pause/resume.
 */
export const SOPState = Annotation.Root({
  taskDescription: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  branchName: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  researchOutput: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  plan: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  approved: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  implementationLog: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  testOutput: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  testsPassed: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  qualityGatesPassed: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  reviewOutput: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  reviewPassed: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => false,
  }),
  testRetries: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  currentPhase: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => 'research',
  }),
});

/** Type alias for the SOP state */
type SOPStateType = typeof SOPState.State;

/**
 * Helper: invoke an agent and extract its text response.
 *
 * Uses `unknown` for the agent type to avoid complex ReactAgent generics.
 * The agent is expected to have an .invoke() method that accepts { messages }.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invokeAgent(agent: any, prompt: string): Promise<string> {
  const result = await agent.invoke({
    messages: [new HumanMessage(prompt)],
  });

  const messages = result?.messages;
  if (Array.isArray(messages) && messages.length > 0) {
    const last = messages[messages.length - 1];
    const content = typeof last === 'object' && last !== null && 'content' in last
      ? last.content
      : last;
    return typeof content === 'string' ? content : JSON.stringify(content);
  }

  return '';
}

// ─── Graph Nodes ───────────────────────────────────────────────────────────

async function ensureBranchNode(state: SOPStateType): Promise<Partial<SOPStateType>> {
  logger.info('SOP: ensure_branch', { task: state.taskDescription });
  const branchName = await ensureDevBranch(state.taskDescription);
  return { branchName, currentPhase: 'research' };
}

async function researchNode(state: SOPStateType): Promise<Partial<SOPStateType>> {
  logger.info('SOP: research', { task: state.taskDescription });
  const agent = createResearchAgent();

  const prompt = `Research the following development task thoroughly. Analyze the codebase architecture, search for existing patterns, and produce a structured research output.

Task: ${state.taskDescription}

Branch: ${state.branchName}

Produce output with:
1. Problem statement
2. Existing patterns found
3. Solution vectors (at least 2)
4. Recommended approach with justification`;

  const researchOutput = await invokeAgent(agent, prompt);
  return { researchOutput, currentPhase: 'plan' };
}

async function planNode(state: SOPStateType): Promise<Partial<SOPStateType>> {
  logger.info('SOP: plan', { task: state.taskDescription });
  const agent = createResearchAgent();

  const prompt = `Based on this research, create a detailed implementation plan following TDD.

Task: ${state.taskDescription}
Research: ${state.researchOutput}

Produce a plan with:
1. Files to create/modify
2. Step-by-step implementation tasks
3. Test specifications (what to test, expected behavior)
4. Quality criteria`;

  const plan = await invokeAgent(agent, prompt);
  return { plan, currentPhase: 'approve' };
}

function awaitApprovalNode(state: SOPStateType): Partial<SOPStateType> {
  logger.info('SOP: await_approval — interrupting for human review');

  // LangGraph interrupt() halts the graph and serializes state.
  // The developer reviews the plan, then resumes with approved=true.
  const approval = interrupt({
    type: 'approval_request',
    plan: state.plan,
    message: 'Review the plan above. Resume with approved=true to continue, or approved=false to revise.',
  });

  return {
    approved: Boolean(approval),
    currentPhase: approval ? 'implement' : 'plan',
  };
}

async function implementNode(state: SOPStateType): Promise<Partial<SOPStateType>> {
  logger.info('SOP: implement', {
    task: state.taskDescription,
    testRetries: state.testRetries,
  });
  const agent = createImplementAgent();

  let prompt = `Implement the following task using TDD (write failing test first, then implementation).

Task: ${state.taskDescription}
Branch: ${state.branchName}
Plan: ${state.plan}`;

  // If retrying after test failure, include the failure context
  if (state.testRetries > 0 && state.testOutput) {
    prompt += `\n\nPREVIOUS TEST FAILURE (retry ${state.testRetries}/${MAX_TEST_RETRIES}):\n${state.testOutput}`;
  }

  // If retrying after quality gate failure, include that context
  if (!state.qualityGatesPassed && state.testRetries > 0) {
    prompt += '\n\nQuality gates failed on the previous attempt. Fix lint, type-check, or test issues.';
  }

  const implementationLog = await invokeAgent(agent, prompt);
  return { implementationLog, currentPhase: 'test' };
}

async function testNode(state: SOPStateType): Promise<Partial<SOPStateType>> {
  logger.info('SOP: test', { testRetries: state.testRetries });
  const agent = createTestAgent();

  const prompt = `Run the test suite and analyze results.

Task: ${state.taskDescription}
Implementation: ${state.implementationLog}

Run: cd backend && npm run test:unit
Report: which tests pass, which fail, and why.`;

  const testOutput = await invokeAgent(agent, prompt);

  // Parse test results — agent should indicate pass/fail
  const testsPassed = testOutput.toLowerCase().includes('all tests pass') ||
    testOutput.toLowerCase().includes('tests passed') ||
    (testOutput.toLowerCase().includes('pass') && !testOutput.toLowerCase().includes('fail'));

  return {
    testOutput,
    testsPassed,
    testRetries: testsPassed ? state.testRetries : state.testRetries + 1,
    currentPhase: 'quality_gates',
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function qualityGatesNode(state: SOPStateType): Promise<Partial<SOPStateType>> {
  logger.info('SOP: quality_gates');
  const result = await runQualityGates();

  return {
    qualityGatesPassed: result.passed,
    currentPhase: result.passed ? 'review' : 'implement',
  };
}

async function reviewNode(state: SOPStateType): Promise<Partial<SOPStateType>> {
  logger.info('SOP: review');
  const agent = createReviewAgent();

  const prompt = `Review the code changes on branch "${state.branchName}" against CLAUDE.md quality standards.

Task: ${state.taskDescription}
Plan: ${state.plan}

Check for:
1. No \`any\` types
2. Structured Logger usage (no console.log)
3. ESM imports with .js extensions
4. Test coverage for branching logic
5. Security (no command injection, proper validation)
6. Conventional commit messages`;

  const reviewOutput = await invokeAgent(agent, prompt);
  const reviewPassed = !reviewOutput.toLowerCase().includes('critical') &&
    !reviewOutput.toLowerCase().includes('blocker');

  return { reviewOutput, reviewPassed, currentPhase: 'complete' };
}

function completeNode(state: SOPStateType): Partial<SOPStateType> {
  logger.info('SOP: complete', {
    task: state.taskDescription,
    branch: state.branchName,
    testsPassed: state.testsPassed,
    qualityGatesPassed: state.qualityGatesPassed,
    reviewPassed: state.reviewPassed,
  });

  return { currentPhase: 'complete' };
}

// ─── Conditional Edge Functions ────────────────────────────────────────────

function routeAfterApproval(state: SOPStateType): string {
  if (state.approved) {
    return 'implement';
  }
  // Not approved — go back to plan for revision
  return 'create_plan';
}

function routeAfterTest(state: SOPStateType): string {
  if (state.testsPassed) {
    return 'quality_gates';
  }
  if (state.testRetries < MAX_TEST_RETRIES) {
    // Retry: send back to implement with failure context
    return 'implement';
  }
  // Max retries — force forward to quality gates anyway
  logger.warn('SOP: max test retries reached, forcing forward', undefined, {
    testRetries: state.testRetries,
  });
  return 'quality_gates';
}

function routeAfterQualityGates(state: SOPStateType): string {
  if (state.qualityGatesPassed) {
    return 'review';
  }
  // Quality gates failed — send back to implement
  return 'implement';
}

// ─── Graph Construction ────────────────────────────────────────────────────

/**
 * Create and compile the SOP workflow graph.
 *
 * The graph enforces the CLAUDE.md SOP pipeline with:
 * - Sequential agent execution (one agent per node)
 * - Human-in-the-loop at the plan→implement boundary
 * - Test retry loop (max 3 retries)
 * - Quality gate enforcement
 * - PostgresSaver checkpointing for pause/resume
 */
export function createSOPWorkflow() {
  const workflow = new StateGraph(SOPState)
    // Nodes
    .addNode('ensure_branch', ensureBranchNode)
    .addNode('research', researchNode)
    .addNode('create_plan', planNode)
    .addNode('await_approval', awaitApprovalNode)
    .addNode('implement', implementNode)
    .addNode('run_tests', testNode)
    .addNode('quality_gates', qualityGatesNode)
    .addNode('review', reviewNode)
    .addNode('complete', completeNode)
    // Edges: linear flow with conditional branches
    .addEdge(START, 'ensure_branch')
    .addEdge('ensure_branch', 'research')
    .addEdge('research', 'create_plan')
    .addEdge('create_plan', 'await_approval')
    .addConditionalEdges('await_approval', routeAfterApproval, {
      implement: 'implement',
      create_plan: 'create_plan',
    })
    .addEdge('implement', 'run_tests')
    .addConditionalEdges('run_tests', routeAfterTest, {
      quality_gates: 'quality_gates',
      implement: 'implement',
    })
    .addConditionalEdges('quality_gates', routeAfterQualityGates, {
      review: 'review',
      implement: 'implement',
    })
    .addEdge('review', 'complete')
    .addEdge('complete', END);

  return workflow.compile({
    checkpointer: getCheckpointer(),
  });
}
