import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmptyState } from '@/components/chat/empty-state';

vi.mock('lucide-react', () => ({
  Home: () => <div data-testid="home-icon" />,
}));

describe('EmptyState', () => {
  it('renders first-time variant with heading, description, and home icon', () => {
    const onSelect = vi.fn();

    render(
      <EmptyState variant="first-time" onSuggestionSelect={onSelect} />,
    );

    // &apos; renders as a plain ASCII apostrophe
    expect(
      screen.getByText("Let's plan something beautiful"),
    ).toBeDefined();

    expect(
      screen.getByText(
        'Describe your renovation vision and our AI will help you plan every detail.',
      ),
    ).toBeDefined();

    expect(screen.getByTestId('home-icon')).toBeDefined();
  });

  it('renders returning variant with session title', () => {
    const onSelect = vi.fn();

    render(
      <EmptyState
        variant="returning"
        sessionTitle="Kitchen Reno"
        onSuggestionSelect={onSelect}
      />,
    );

    expect(
      screen.getByText('Welcome back to Kitchen Reno'),
    ).toBeDefined();
  });

  it('shows phase-specific suggestions for CHECKLIST', () => {
    const onSelect = vi.fn();

    render(
      <EmptyState
        variant="first-time"
        phase="CHECKLIST"
        onSuggestionSelect={onSelect}
      />,
    );

    expect(
      screen.getByText('What should I include in my checklist?'),
    ).toBeDefined();
  });

  it('falls back to default suggestions when no phase is provided', () => {
    const onSelect = vi.fn();

    render(
      <EmptyState variant="first-time" onSuggestionSelect={onSelect} />,
    );

    expect(
      screen.getByText('I want to renovate my kitchen'),
    ).toBeDefined();
  });
});
