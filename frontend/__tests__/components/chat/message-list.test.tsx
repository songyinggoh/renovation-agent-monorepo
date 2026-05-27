import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { MessageList } from '@/components/chat/message-list';
import type { Message } from '@/types/chat';

// jsdom doesn't implement scrollIntoView
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

// Mock child components
vi.mock('@/components/chat/empty-state', () => ({
  EmptyState: ({ variant }: { variant: string }) => (
    <div data-testid="empty-state" data-variant={variant} />
  ),
}));

vi.mock('@/components/chat/suggestion-bubbles', () => ({
  SuggestionBubbles: ({ suggestions }: { suggestions: string[] }) => (
    <div data-testid="suggestion-bubbles">{suggestions.join(',')}</div>
  ),
}));

vi.mock('@/components/chat/tool-result-renderer', () => ({
  ToolResultRenderer: ({ message }: { message: Message }) => (
    <div data-testid="tool-result">{message.tool_name}</div>
  ),
}));

vi.mock('@/components/chat/tool-error-boundary', () => ({
  ToolErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/skeleton-loader', () => ({
  SkeletonLoader: ({ variant }: { variant: string }) => (
    <div data-testid="skeleton-loader" data-variant={variant} />
  ),
}));

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: `msg-${Math.random().toString(36).slice(2)}`,
    role: 'user',
    content: 'Hello',
    created_at: '2026-01-15T10:30:00Z',
    session_id: 'session-1',
    ...overrides,
  };
}

describe('MessageList', () => {
  it('should show empty state when no messages and not typing', () => {
    render(
      <MessageList
        messages={[]}
        isAssistantTyping={false}
        onSuggestionSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId('empty-state')).toBeDefined();
  });

  it('should show skeleton loader when loading history', () => {
    render(
      <MessageList
        messages={[]}
        isAssistantTyping={false}
        isLoadingHistory={true}
      />,
    );

    expect(screen.getByTestId('skeleton-loader')).toBeDefined();
  });

  it('should render user messages aligned right', () => {
    const msg = makeMessage({ role: 'user', content: 'Hi there' });

    render(<MessageList messages={[msg]} isAssistantTyping={false} />);

    const msgEl = screen.getByText('Hi there').closest('[data-role]');
    expect(msgEl?.getAttribute('data-role')).toBe('user');
  });

  it('should render assistant messages aligned left', () => {
    const msg = makeMessage({ role: 'assistant', content: 'Hello!' });

    render(<MessageList messages={[msg]} isAssistantTyping={false} />);

    const msgEl = screen.getByText('Hello!').closest('[data-role]');
    expect(msgEl?.getAttribute('data-role')).toBe('assistant');
  });

  it('should render multiple messages in order', () => {
    const messages = [
      makeMessage({ id: '1', role: 'user', content: 'First' }),
      makeMessage({ id: '2', role: 'assistant', content: 'Second' }),
      makeMessage({ id: '3', role: 'user', content: 'Third' }),
    ];

    render(<MessageList messages={messages} isAssistantTyping={false} />);

    const container = screen.getByTestId('message-list');
    const texts = container.textContent;
    expect(texts).toContain('First');
    expect(texts).toContain('Second');
    expect(texts).toContain('Third');
  });

  it('should display formatted timestamp', () => {
    const msg = makeMessage({
      content: 'Test',
      created_at: '2026-01-15T14:30:00Z',
    });

    render(<MessageList messages={[msg]} isAssistantTyping={false} />);

    const container = screen.getByTestId('message-list');
    expect(container.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it('should show typing indicator when assistant is typing', () => {
    const msg = makeMessage({ role: 'user', content: 'Hello' });

    render(<MessageList messages={[msg]} isAssistantTyping={true} />);

    expect(screen.getByTestId('typing-indicator')).toBeDefined();
    expect(screen.getByText('Thinking')).toBeDefined();
  });

  it('should not show typing indicator when last message is from assistant', () => {
    const msg = makeMessage({ role: 'assistant', content: 'Done' });

    render(<MessageList messages={[msg]} isAssistantTyping={true} />);

    expect(screen.queryByTestId('typing-indicator')).toBeNull();
  });

  it('should not show typing indicator when not typing', () => {
    const msg = makeMessage({ role: 'user', content: 'Hello' });

    render(<MessageList messages={[msg]} isAssistantTyping={false} />);

    expect(screen.queryByTestId('typing-indicator')).toBeNull();
  });

  describe('tool_call messages', () => {
    it('should render tool call indicator', () => {
      const msg = makeMessage({
        type: 'tool_call',
        tool_name: 'search_products',
        content: '',
      });

      render(<MessageList messages={[msg]} isAssistantTyping={false} />);

      expect(screen.getByTestId('tool-call')).toBeDefined();
      expect(screen.getByText(/Searching products/)).toBeDefined();
    });

    it('should show generic label for unknown tools', () => {
      const msg = makeMessage({
        type: 'tool_call',
        tool_name: 'custom_tool',
        content: '',
      });

      render(<MessageList messages={[msg]} isAssistantTyping={false} />);

      expect(screen.getByText(/Using custom_tool/)).toBeDefined();
    });
  });

  describe('tool_result messages', () => {
    it('should render via ToolResultRenderer', () => {
      const msg = makeMessage({
        type: 'tool_result',
        tool_name: 'search_products',
        content: '{}',
      });

      render(<MessageList messages={[msg]} isAssistantTyping={false} />);

      expect(screen.getByTestId('tool-result')).toBeDefined();
    });
  });

  describe('suggestion bubbles', () => {
    it('should show suggestions after last assistant message', () => {
      const messages = [
        makeMessage({ id: '1', role: 'user', content: 'Hi' }),
        makeMessage({ id: '2', role: 'assistant', content: 'Hello!' }),
      ];

      render(
        <MessageList
          messages={messages}
          isAssistantTyping={false}
          onSuggestionSelect={vi.fn()}
        />,
      );

      expect(screen.getByTestId('suggestion-bubbles')).toBeDefined();
    });

    it('should not show suggestions when assistant is typing', () => {
      const messages = [
        makeMessage({ id: '1', role: 'user', content: 'Hi' }),
        makeMessage({ id: '2', role: 'assistant', content: 'Hello!' }),
      ];

      render(
        <MessageList
          messages={messages}
          isAssistantTyping={true}
          onSuggestionSelect={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('suggestion-bubbles')).toBeNull();
    });

    it('should not show suggestions when last message is from user', () => {
      const messages = [
        makeMessage({ id: '1', role: 'assistant', content: 'Hello!' }),
        makeMessage({ id: '2', role: 'user', content: 'Thanks' }),
      ];

      render(
        <MessageList
          messages={messages}
          isAssistantTyping={false}
          onSuggestionSelect={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('suggestion-bubbles')).toBeNull();
    });

    it('should not show suggestions when no onSuggestionSelect provided', () => {
      const messages = [
        makeMessage({ id: '1', role: 'assistant', content: 'Hello!' }),
      ];

      render(
        <MessageList messages={messages} isAssistantTyping={false} />,
      );

      expect(screen.queryByTestId('suggestion-bubbles')).toBeNull();
    });
  });

  describe('image attachments', () => {
    it('should render image thumbnails when imageUrls present', () => {
      const msg = makeMessage({
        role: 'user',
        content: 'See my kitchen',
        imageUrls: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
      });

      render(<MessageList messages={[msg]} isAssistantTyping={false} />);

      const images = screen.getAllByRole('img');
      expect(images).toHaveLength(2);
      expect(images[0].getAttribute('src')).toBe('https://example.com/photo1.jpg');
    });

    it('should not render images section when imageUrls is empty', () => {
      const msg = makeMessage({
        role: 'user',
        content: 'Just text',
        imageUrls: [],
      });

      render(<MessageList messages={[msg]} isAssistantTyping={false} />);

      expect(screen.queryByRole('img')).toBeNull();
    });
  });
});
