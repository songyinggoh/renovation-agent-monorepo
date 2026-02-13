import { describe, it, expect } from 'vitest';
import {
  welcomeTemplate,
  sessionCreatedTemplate,
  phaseTransitionTemplate,
  planReadyTemplate,
  renderTemplate,
} from '../../../src/emails/templates.js';

describe('Email Templates', () => {
  describe('welcomeTemplate', () => {
    it('should render welcome email with user name and dashboard URL', () => {
      const result = welcomeTemplate({
        userName: 'Alice',
        dashboardUrl: 'https://app.example.com/dashboard',
      });

      expect(result.subject).toBe('Welcome to Renovation Agent');
      expect(result.html).toContain('Alice');
      expect(result.html).toContain('https://app.example.com/dashboard');
      expect(result.html).toContain('Go to Dashboard');
      expect(result.html).toContain('<!DOCTYPE html>');
    });
  });

  describe('sessionCreatedTemplate', () => {
    it('should render session created email with session title', () => {
      const result = sessionCreatedTemplate({
        userName: 'Bob',
        sessionTitle: 'Kitchen Remodel',
        sessionUrl: 'https://app.example.com/session/abc',
      });

      expect(result.subject).toBe('New session: Kitchen Remodel');
      expect(result.html).toContain('Bob');
      expect(result.html).toContain('Kitchen Remodel');
      expect(result.html).toContain('https://app.example.com/session/abc');
    });
  });

  describe('phaseTransitionTemplate', () => {
    it('should render phase transition with human-readable labels', () => {
      const result = phaseTransitionTemplate({
        userName: 'Charlie',
        sessionTitle: 'Living Room',
        previousPhase: 'INTAKE',
        newPhase: 'CHECKLIST',
        sessionUrl: 'https://app.example.com/session/xyz',
      });

      expect(result.subject).toContain('Living Room');
      expect(result.subject).toContain('Checklist');
      expect(result.html).toContain('Charlie');
      expect(result.html).toContain('Checklist');
      expect(result.html).toContain('Intake');
    });

    it('should handle unknown phases gracefully', () => {
      const result = phaseTransitionTemplate({
        userName: 'Dave',
        sessionTitle: 'Test',
        previousPhase: 'UNKNOWN_OLD',
        newPhase: 'UNKNOWN_NEW',
        sessionUrl: 'https://example.com',
      });

      expect(result.subject).toContain('UNKNOWN_NEW');
      expect(result.html).toContain('UNKNOWN_OLD');
    });
  });

  describe('planReadyTemplate', () => {
    it('should render plan ready email with room count and budget', () => {
      const result = planReadyTemplate({
        userName: 'Eve',
        sessionTitle: 'Full House Reno',
        roomCount: 4,
        estimatedBudget: '$25,000',
        sessionUrl: 'https://app.example.com/session/plan',
      });

      expect(result.subject).toContain('Full House Reno');
      expect(result.html).toContain('Eve');
      expect(result.html).toContain('4');
      expect(result.html).toContain('$25,000');
    });

    it('should omit budget line when not provided', () => {
      const result = planReadyTemplate({
        userName: 'Frank',
        sessionTitle: 'Bathroom',
        roomCount: 1,
        sessionUrl: 'https://example.com',
      });

      expect(result.html).not.toContain('Estimated Budget');
    });
  });

  describe('renderTemplate', () => {
    it('should dispatch to correct template by name', () => {
      const result = renderTemplate('welcome', {
        userName: 'Grace',
        dashboardUrl: 'https://example.com',
      });

      expect(result.subject).toBe('Welcome to Renovation Agent');
      expect(result.html).toContain('Grace');
    });

    it('should dispatch to plan-ready template', () => {
      const result = renderTemplate('plan-ready', {
        userName: 'Heidi',
        sessionTitle: 'Office Reno',
        roomCount: 2,
        sessionUrl: 'https://example.com',
      });

      expect(result.subject).toContain('Office Reno');
    });
  });
});
