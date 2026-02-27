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
