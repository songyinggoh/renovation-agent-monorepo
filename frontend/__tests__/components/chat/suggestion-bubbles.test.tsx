import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SuggestionBubbles } from '@/components/chat/suggestion-bubbles';

describe('SuggestionBubbles', () => {
  it('renders all suggestion buttons', () => {
    const suggestions = [
      'Renovate kitchen',
      'Bathroom remodel',
      'New flooring',
    ];
    const onSelect = vi.fn();

    render(
      <SuggestionBubbles suggestions={suggestions} onSelect={onSelect} />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(screen.getByText('Renovate kitchen')).toBeDefined();
    expect(screen.getByText('Bathroom remodel')).toBeDefined();
    expect(screen.getByText('New flooring')).toBeDefined();
  });

  it('calls onSelect with the suggestion text when clicked', () => {
    const suggestions = ['Renovate kitchen', 'Bathroom remodel'];
    const onSelect = vi.fn();

    render(
      <SuggestionBubbles suggestions={suggestions} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByText('Bathroom remodel'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('Bathroom remodel');
  });

  it('returns null for an empty suggestions array', () => {
    const onSelect = vi.fn();

    const { container } = render(
      <SuggestionBubbles suggestions={[]} onSelect={onSelect} />,
    );

    expect(container.innerHTML).toBe('');
  });
});
