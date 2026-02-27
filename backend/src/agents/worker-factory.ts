import { SystemMessage } from '@langchain/core/messages';
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
