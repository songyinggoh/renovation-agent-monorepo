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
