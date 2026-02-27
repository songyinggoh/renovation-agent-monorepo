import { describe, it, expect } from 'vitest';

describe('agents/state', () => {
  it('should export RenovationAnnotation with required channels', async () => {
    const { RenovationAnnotation } = await import('../../../src/agents/state.js');
    const spec = RenovationAnnotation.spec;
    expect(spec).toHaveProperty('messages');
    expect(spec).toHaveProperty('currentPhase');
    expect(spec).toHaveProperty('sessionId');
    expect(spec).toHaveProperty('budgetState');
  });

  it('messages channel should use MessagesAnnotation reducer (append behavior)', async () => {
    const { RenovationAnnotation } = await import('../../../src/agents/state.js');
    const spec = RenovationAnnotation.spec;
    // LangGraph Annotation channels have an operator (reducer) function
    expect(spec.messages.operator).toBeDefined();
    expect(typeof spec.messages.operator).toBe('function');
  });

  it('currentPhase should default to INTAKE', async () => {
    const { RenovationAnnotation } = await import('../../../src/agents/state.js');
    const spec = RenovationAnnotation.spec;
    // LangGraph stores default as initialValueFactory and resolves it to value
    expect(spec.currentPhase.value).toBe('INTAKE');
  });
});
