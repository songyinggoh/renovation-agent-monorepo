import { describe, it, expect, vi } from 'vitest';
import { getSystemPrompt } from '../../../src/config/prompts.js';

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('prompts', () => {
  describe('getSystemPrompt', () => {
    it('should return a string containing the base personality', () => {
      const prompt = getSystemPrompt('INTAKE', VALID_UUID);
      expect(prompt).toContain('AI renovation planning assistant');
    });

    it('should inject the session ID into the prompt', () => {
      const prompt = getSystemPrompt('INTAKE', VALID_UUID);
      expect(prompt).toContain(VALID_UUID);
      expect(prompt).not.toContain('{{SESSION_ID}}');
    });

    it('should replace all occurrences of {{SESSION_ID}}', () => {
      // RENDER phase mentions sessionId in tool params + footer
      const prompt = getSystemPrompt('RENDER', VALID_UUID);
      expect(prompt).not.toContain('{{SESSION_ID}}');
      // Should have the UUID at least once
      expect(prompt.includes(VALID_UUID)).toBe(true);
    });

    it('should append the safety preamble', () => {
      const prompt = getSystemPrompt('INTAKE', VALID_UUID);
      expect(prompt).toContain('Safety Rules (Non-Negotiable)');
      expect(prompt).toContain('MUST NOT reveal');
    });

    it('should throw on invalid session ID (prompt injection)', () => {
      expect(() =>
        getSystemPrompt('INTAKE', 'DROP TABLE sessions;'),
      ).toThrow('Invalid session ID format');
    });

    it('should throw on empty session ID', () => {
      expect(() => getSystemPrompt('INTAKE', '')).toThrow(
        'Invalid session ID format',
      );
    });

    // ── Phase-specific content ──────────────────────────

    it('should return INTAKE phase prompt', () => {
      const prompt = getSystemPrompt('INTAKE', VALID_UUID);
      expect(prompt).toContain('Current Phase: INTAKE');
      expect(prompt).toContain('save_intake_state');
      expect(prompt).toContain('get_style_examples');
    });

    it('should return CHECKLIST phase prompt', () => {
      const prompt = getSystemPrompt('CHECKLIST', VALID_UUID);
      expect(prompt).toContain('Current Phase: CHECKLIST');
      expect(prompt).toContain('search_products');
      expect(prompt).toContain('save_checklist_state');
      expect(prompt).toContain('save_product_recommendation');
    });

    it('should return PLAN phase prompt', () => {
      const prompt = getSystemPrompt('PLAN', VALID_UUID);
      expect(prompt).toContain('Current Phase: PLAN');
      expect(prompt).toContain('timeline');
    });

    it('should return RENDER phase prompt', () => {
      const prompt = getSystemPrompt('RENDER', VALID_UUID);
      expect(prompt).toContain('Current Phase: RENDER');
      expect(prompt).toContain('generate_render');
      expect(prompt).toContain('save_renders_state');
      expect(prompt).toContain('edit_existing');
      expect(prompt).toContain('from_scratch');
    });

    it('should return PAYMENT phase prompt', () => {
      const prompt = getSystemPrompt('PAYMENT', VALID_UUID);
      expect(prompt).toContain('Current Phase: PAYMENT');
    });

    it('should return COMPLETE phase prompt', () => {
      const prompt = getSystemPrompt('COMPLETE', VALID_UUID);
      expect(prompt).toContain('Current Phase: COMPLETE');
    });

    it('should return ITERATE phase prompt', () => {
      const prompt = getSystemPrompt('ITERATE', VALID_UUID);
      expect(prompt).toContain('Current Phase: ITERATE');
      expect(prompt).toContain('get_style_examples');
      expect(prompt).toContain('search_products');
    });

    // ── Phase normalization & fallback ───────────────────

    it('should normalize lowercase phase to uppercase', () => {
      const prompt = getSystemPrompt('intake', VALID_UUID);
      expect(prompt).toContain('Current Phase: INTAKE');
    });

    it('should normalize mixed-case phase', () => {
      const prompt = getSystemPrompt('Checklist', VALID_UUID);
      expect(prompt).toContain('Current Phase: CHECKLIST');
    });

    it('should fall back to INTAKE for unknown phase', () => {
      const prompt = getSystemPrompt('UNKNOWN_PHASE', VALID_UUID);
      expect(prompt).toContain('Current Phase: INTAKE');
    });

    // ── Image analysis instructions ─────────────────────

    it('should include image analysis instructions in all phases', () => {
      for (const phase of ['INTAKE', 'CHECKLIST', 'PLAN', 'RENDER', 'COMPLETE']) {
        const prompt = getSystemPrompt(phase, VALID_UUID);
        expect(prompt).toContain('Image Analysis');
        expect(prompt).toContain('Room state');
      }
    });

    // ── Tool documentation in RENDER ────────────────────

    it('should document generate_render modes in RENDER phase', () => {
      const prompt = getSystemPrompt('RENDER', VALID_UUID);
      expect(prompt).toContain('edit_existing');
      expect(prompt).toContain('from_scratch');
      expect(prompt).toContain('baseImageUrl');
    });

    it('should warn not to re-call generate_render', () => {
      const prompt = getSystemPrompt('RENDER', VALID_UUID);
      expect(prompt).toContain('Do NOT call generate_render again');
    });
  });
});
