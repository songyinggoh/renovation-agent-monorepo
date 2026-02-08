'use client';

import { useEffect, useRef } from 'react';
import { Message } from '@/types/chat';
import { EmptyState } from './empty-state';
import { SuggestionBubbles } from './suggestion-bubbles';
import { ToolResultRenderer } from './tool-result-renderer';
import { ToolErrorBoundary } from './tool-error-boundary';
import { SkeletonLoader } from '@/components/ui/skeleton-loader';
import type { RenovationPhase } from '@/lib/design-tokens';

/** Human-readable labels for tool call loading indicators */
const TOOL_CALL_LABELS: Record<string, string> = {
  get_style_examples: 'Looking up style details',
  search_products: 'Searching products',
  save_intake_state: 'Saving your project info',
  save_checklist_state: 'Saving checklist',
};

interface MessageListProps {
  messages: Message[];
  isAssistantTyping: boolean;
  isLoadingHistory?: boolean;
  phase?: RenovationPhase;
  onSuggestionSelect?: (suggestion: string) => void;
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}


export function MessageList({ messages, isAssistantTyping, isLoadingHistory, phase, onSuggestionSelect }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAssistantTyping]);

  if (isLoadingHistory) {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <SkeletonLoader variant="chat-message" count={3} />
      </div>
    );
  }

  if (messages.length === 0 && !isAssistantTyping) {
    return (
      <EmptyState
        variant="first-time"
        phase={phase}
        onSuggestionSelect={onSuggestionSelect ?? (() => {})}
      />
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 surface-chat">
      {messages.map((message) => {
        // Tool call: subtle loading indicator
        if (message.type === 'tool_call') {
          return (
            <div key={message.id} className="flex animate-slide-up justify-start">
              <div className="flex items-center gap-2 rounded-full border border-border/50 bg-card px-3 py-1.5 shadow-sm">
                <span className="h-2 w-2 animate-pulse-subtle rounded-full bg-primary/60" />
                <span className="text-xs text-muted-foreground">
                  {TOOL_CALL_LABELS[message.tool_name ?? ''] ?? `Using ${message.tool_name}`}...
                </span>
              </div>
            </div>
          );
        }

        // Tool result: rich card rendering
        if (message.type === 'tool_result') {
          return (
            <div key={message.id} className="animate-slide-up">
              <ToolErrorBoundary key={message.id} messageId={message.id}>
                <ToolResultRenderer message={message} />
              </ToolErrorBoundary>
            </div>
          );
        }

        // Regular text message
        return (
          <div
            key={message.id}
            className={`flex animate-slide-up ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                message.role === 'user'
                  ? 'rounded-br-sm bg-primary text-primary-foreground'
                  : 'rounded-bl-sm bg-muted text-foreground'
              }`}
            >
              <p className={`whitespace-pre-wrap text-sm ${
                message.role === 'assistant' ? 'leading-relaxed' : ''
              }`}>{message.content}</p>
              <p
                className={`mt-1 text-xs ${
                  message.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                }`}
              >
                {formatTime(message.created_at)}
              </p>
            </div>
          </div>
        );
      })}

      {/* Suggestion bubbles after last assistant message */}
      {!isAssistantTyping && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && onSuggestionSelect && (
        <SuggestionBubbles
          suggestions={['Tell me more', 'What are the next steps?', 'Show budget breakdown']}
          onSelect={onSuggestionSelect}
        />
      )}

      {isAssistantTyping && messages[messages.length - 1]?.role !== 'assistant' && (
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">Thinking</span>
              <span className="flex gap-0.5">
                <span className="h-1.5 w-1.5 animate-pulse-subtle rounded-full bg-muted-foreground/50" />
                <span className="h-1.5 w-1.5 animate-pulse-subtle rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
                <span className="h-1.5 w-1.5 animate-pulse-subtle rounded-full bg-muted-foreground/50 [animation-delay:600ms]" />
              </span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
