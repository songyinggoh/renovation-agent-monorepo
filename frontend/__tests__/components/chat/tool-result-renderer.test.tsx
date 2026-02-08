import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToolResultRenderer } from '@/components/chat/tool-result-renderer';
import type { Message } from '@/types/chat';

/** Helper to build a tool_result Message with minimal boilerplate */
function makeToolMessage(overrides: Partial<Message>): Message {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: '',
    created_at: '2026-01-15T12:00:00Z',
    session_id: 'session-1',
    type: 'tool_result',
    ...overrides,
  };
}

describe('ToolResultRenderer', () => {
  it('renders style result with color swatches and materials', () => {
    const message = makeToolMessage({
      tool_name: 'get_style_examples',
      tool_data: {
        name: 'Modern Minimalist',
        description: 'Clean lines and neutral tones',
        colorPalette: [{ name: 'White', hex: '#fff' }],
        materials: ['Oak'],
      },
    });

    const { container } = render(<ToolResultRenderer message={message} />);

    // Check heading with style name
    expect(screen.getByText('Modern Minimalist')).toBeDefined();

    // Check description
    expect(screen.getByText('Clean lines and neutral tones')).toBeDefined();

    // Check color swatch label
    expect(screen.getByText('White')).toBeDefined();

    // Check the color swatch has a colored span (backgroundColor)
    const swatchSpan = container.querySelector(
      'span[style*="background-color"]',
    );
    expect(swatchSpan).not.toBeNull();

    // Check material chip
    expect(screen.getByText('Oak')).toBeDefined();

    // Check the tool label in the header
    expect(screen.getByText('Style Details')).toBeDefined();
  });

  it('renders style error message', () => {
    const message = makeToolMessage({
      tool_name: 'get_style_examples',
      tool_data: { error: 'Style not found' },
    });

    render(<ToolResultRenderer message={message} />);

    expect(screen.getByText('Style not found')).toBeDefined();
  });

  it('renders product cards with name, price, and category', () => {
    const message = makeToolMessage({
      tool_name: 'search_products',
      tool_data: {
        products: [
          {
            name: 'Oak Floor',
            category: 'flooring',
            price: '$8.50',
            description: 'Nice floor',
          },
        ],
        totalMatches: 1,
      },
    });

    render(<ToolResultRenderer message={message} />);

    expect(screen.getByText('Oak Floor')).toBeDefined();
    expect(screen.getByText('$8.50')).toBeDefined();
    expect(screen.getByText('flooring')).toBeDefined();
    expect(screen.getByText('Nice floor')).toBeDefined();
    expect(screen.getByText('Product Results')).toBeDefined();
  });

  it('renders no products message when message field is present', () => {
    const message = makeToolMessage({
      tool_name: 'search_products',
      tool_data: { message: 'No products found matching your criteria' },
    });

    render(<ToolResultRenderer message={message} />);

    expect(
      screen.getByText('No products found matching your criteria'),
    ).toBeDefined();
  });

  it('renders intake saved with room details and budget', () => {
    const message = makeToolMessage({
      tool_name: 'save_intake_state',
      tool_data: {
        message: 'Saved 2 rooms',
        rooms: [
          { id: '1', name: 'Kitchen', type: 'kitchen', budget: '5000' },
        ],
      },
    });

    render(<ToolResultRenderer message={message} />);

    expect(screen.getByText('Saved 2 rooms')).toBeDefined();
    expect(screen.getByText('Kitchen')).toBeDefined();
    // Budget is rendered with a leading $ sign: "$5000"
    expect(screen.getByText('$5000')).toBeDefined();
    expect(screen.getByText('kitchen')).toBeDefined();
    expect(screen.getByText('Intake Saved')).toBeDefined();
  });

  it('renders checklist saved with priority counts', () => {
    const message = makeToolMessage({
      tool_name: 'save_checklist_state',
      tool_data: {
        message: 'Saved checklist',
        priorities: { mustHave: 3, niceToHave: 2, optional: 1 },
      },
    });

    render(<ToolResultRenderer message={message} />);

    expect(screen.getByText('Saved checklist')).toBeDefined();

    // Priority counts are rendered inside <strong> tags within labelled spans
    // Use getByText with a function to find the numbers within the combined text
    const mustHaveSpan = screen.getByText((_content, element) => {
      return element?.tagName === 'SPAN' && element.textContent === 'Must-have: 3';
    });
    expect(mustHaveSpan).toBeDefined();
    expect(within(mustHaveSpan).getByText('3')).toBeDefined();

    const niceToHaveSpan = screen.getByText((_content, element) => {
      return element?.tagName === 'SPAN' && element.textContent === 'Nice-to-have: 2';
    });
    expect(niceToHaveSpan).toBeDefined();
    expect(within(niceToHaveSpan).getByText('2')).toBeDefined();

    const optionalSpan = screen.getByText((_content, element) => {
      return element?.tagName === 'SPAN' && element.textContent === 'Optional: 1';
    });
    expect(optionalSpan).toBeDefined();
    expect(within(optionalSpan).getByText('1')).toBeDefined();

    expect(screen.getByText('Checklist Saved')).toBeDefined();
  });

  it('renders fallback JSON in a pre tag for unknown tool', () => {
    const message = makeToolMessage({
      tool_name: 'unknown_tool',
      tool_data: { foo: 'bar' },
    });

    const { container } = render(<ToolResultRenderer message={message} />);

    const preElement = container.querySelector('pre');
    expect(preElement).not.toBeNull();
    expect(preElement!.textContent).toBe(JSON.stringify({ foo: 'bar' }, null, 2));
  });
});
