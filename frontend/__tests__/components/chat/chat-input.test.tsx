import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChatInput } from '@/components/chat/chat-input';

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Send: () => <div data-testid="send-icon" />,
  Paperclip: () => <div data-testid="paperclip-icon" />,
  Camera: () => <div data-testid="camera-icon" />,
  Map: () => <div data-testid="map-icon" />,
  ImagePlus: () => <div data-testid="image-plus-icon" />,
}));

// Mock FileUploadZone
vi.mock('@/components/chat/file-upload-zone', () => ({
  FileUploadZone: () => <div data-testid="file-upload-zone" />,
}));

describe('ChatInput', () => {
  const defaultProps = {
    onSend: vi.fn(),
    disabled: false,
  };

  it('should render the textarea and send button', () => {
    render(<ChatInput {...defaultProps} />);

    expect(screen.getByTestId('chat-input')).toBeDefined();
    expect(screen.getByTestId('send-button')).toBeDefined();
  });

  it('should show default placeholder when no phase', () => {
    render(<ChatInput {...defaultProps} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe('Describe your renovation vision...');
  });

  it('should show phase-specific placeholder', () => {
    render(<ChatInput {...defaultProps} phase="CHECKLIST" />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe('What requirements should we add?');
  });

  it('should show "Connecting..." placeholder when disabled', () => {
    render(<ChatInput {...defaultProps} disabled={true} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    expect(textarea.placeholder).toBe('Connecting...');
  });

  it('should call onSend with trimmed text on submit', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '  Hello world  ' } });
    fireEvent.click(screen.getByTestId('send-button'));

    expect(onSend).toHaveBeenCalledWith('Hello world', undefined);
  });

  it('should clear input after sending', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByTestId('send-button'));

    expect(textarea.value).toBe('');
  });

  it('should not send empty messages', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);

    fireEvent.click(screen.getByTestId('send-button'));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should not send whitespace-only messages', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('send-button'));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should not send when disabled', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} disabled={true} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByTestId('send-button'));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should send on Enter key (without Shift)', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(onSend).toHaveBeenCalledWith('Hello', undefined);
  });

  it('should not send on Shift+Enter (allows newline)', () => {
    const onSend = vi.fn();
    render(<ChatInput {...defaultProps} onSend={onSend} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('should disable send button when input is empty', () => {
    render(<ChatInput {...defaultProps} />);

    const button = screen.getByTestId('send-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('should enable send button when input has text', () => {
    render(<ChatInput {...defaultProps} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Hello' } });

    const button = screen.getByTestId('send-button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('should disable textarea when disabled prop is true', () => {
    render(<ChatInput {...defaultProps} disabled={true} />);

    const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });

  describe('with upload support', () => {
    const uploadProps = {
      ...defaultProps,
      uploadFiles: [],
      onAddFiles: vi.fn(),
      onRemoveFile: vi.fn(),
      onRetryFile: vi.fn(),
      onClearCompleted: vi.fn(),
    };

    it('should show paperclip button when upload support provided', () => {
      render(<ChatInput {...uploadProps} />);
      expect(screen.getByLabelText(/attach files|hide file upload/i)).toBeDefined();
    });

    it('should not show paperclip button without upload support', () => {
      render(<ChatInput {...defaultProps} />);
      expect(screen.queryByTestId('paperclip-icon')).toBeNull();
    });

    it('should show intake guidance prompt during INTAKE phase', () => {
      render(<ChatInput {...uploadProps} phase="INTAKE" />);
      expect(screen.getByText('Upload your room photos or floor plan')).toBeDefined();
    });

    it('should not show intake prompt for non-INTAKE phases', () => {
      render(<ChatInput {...uploadProps} phase="CHECKLIST" />);
      expect(screen.queryByText('Upload your room photos or floor plan')).toBeNull();
    });

    it('should dismiss intake prompt when Skip clicked', () => {
      render(<ChatInput {...uploadProps} phase="INTAKE" />);

      expect(screen.getByText('Upload your room photos or floor plan')).toBeDefined();
      fireEvent.click(screen.getByLabelText('Dismiss upload prompt'));
      expect(screen.queryByText('Upload your room photos or floor plan')).toBeNull();
    });
  });

  describe('placeholders for all phases', () => {
    const phases = [
      ['INTAKE', 'Describe your vision or upload room photos...'],
      ['CHECKLIST', 'What requirements should we add?'],
      ['PLAN', 'Ask about the plan details...'],
      ['RENDER', "Describe what you'd like to see..."],
      ['PAYMENT', 'Questions about pricing?'],
      ['COMPLETE', 'How does everything look?'],
      ['ITERATE', 'What would you like to change?'],
    ] as const;

    phases.forEach(([phase, expected]) => {
      it(`should show correct placeholder for ${phase}`, () => {
        render(<ChatInput {...defaultProps} phase={phase} />);
        const textarea = screen.getByTestId('chat-input') as HTMLTextAreaElement;
        expect(textarea.placeholder).toBe(expected);
      });
    });
  });
});
