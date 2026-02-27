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
