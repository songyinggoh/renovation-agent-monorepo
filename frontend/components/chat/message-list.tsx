'use client';

import { useEffect, useRef } from 'react';
import { Message } from '@/types/chat';

interface MessageListProps {
  messages: Message[];
  isAssistantTyping: boolean;
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MessageList({ messages, isAssistantTyping }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAssistantTyping]);

  if (messages.length === 0 && !isAssistantTyping) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-gray-500">
        Send a message to start your renovation consultation.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[75%] rounded-2xl px-4 py-2 ${
              message.role === 'user'
                ? 'rounded-br-sm bg-indigo-600 text-white'
                : 'rounded-bl-sm bg-gray-100 text-gray-900'
            }`}
          >
            <p className="whitespace-pre-wrap text-sm">{message.content}</p>
            <p
              className={`mt-1 text-xs ${
                message.role === 'user' ? 'text-indigo-200' : 'text-gray-400'
              }`}
            >
              {formatTime(message.created_at)}
            </p>
          </div>
        </div>
      ))}

      {isAssistantTyping && messages[messages.length - 1]?.role !== 'assistant' && (
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-3">
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500">Thinking</span>
              <span className="flex gap-0.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
