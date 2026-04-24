/** Agent names used for supervisor routing and kill switch keys */
export const DEV_AGENT_NAMES = {
  SCAFFOLD: 'scaffold-agent',
  MIGRATION: 'migration-agent',
  TEST: 'test-agent',
  REVIEW: 'review-agent',
  RESEARCH: 'research-agent',
  IMPLEMENT: 'implement-agent',
  SUPERVISOR: 'dev-supervisor',
} as const;

export type DevAgentName = (typeof DEV_AGENT_NAMES)[keyof typeof DEV_AGENT_NAMES];

/** Workflow phases matching CLAUDE.md SOP */
export type WorkflowPhase =
  | 'research'
  | 'plan'
  | 'approve'
  | 'implement'
  | 'test'
  | 'review'
  | 'complete';

/**
 * State tracked across the SOP workflow.
 * Note: The LangGraph SOPState (Task 13) defines its own Annotation.Root
 * with additional fields (testRetries, qualityGatesPassed, etc.).
 * This interface is for non-LangGraph consumers of workflow state.
 */
export interface WorkflowState {
  taskDescription: string;
  branchName: string;
  researchOutput: string;
  plan: string;
  approved: boolean;
  modifiedFiles: string[];
  testResults: { passed: boolean; output: string } | null;
  reviewResults: { issues: string[]; passed: boolean } | null;
  currentPhase: WorkflowPhase;
  revisionCount: number;
}
