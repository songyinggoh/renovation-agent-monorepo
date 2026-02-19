'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useFileUpload } from '@/hooks/useFileUpload';
import { MessageList } from '@/components/chat/message-list';
import { ChatInput } from '@/components/chat/chat-input';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PHASE_CONFIG, type RenovationPhase } from '@/lib/design-tokens';
import type { Message } from '@/types/chat';

interface ChatViewProps {
  sessionId: string;
  phase?: RenovationPhase;
  roomId?: string;
  messages: Message[];
  sendMessage: (content: string, attachments?: { assetId: string; fileName?: string }[]) => void;
  isConnected: boolean;
  error: string | null;
  isAssistantTyping: boolean;
  isLoadingHistory: boolean;
}

export function ChatView({ sessionId, phase, roomId, messages, sendMessage, isConnected, error, isAssistantTyping, isLoadingHistory }: ChatViewProps) {
  const router = useRouter();

  const upload = useFileUpload({
    roomId: roomId ?? '',
    sessionId,
  });

  const canUpload = Boolean(roomId);

  const handleSend = useCallback((content: string, attachments?: { assetId: string; fileName?: string }[]) => {
    sendMessage(content, attachments);
    if (attachments && attachments.length > 0) {
      upload.clearCompleted();
    }
  }, [sendMessage, upload]);

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col rounded-lg border border-border surface-chat shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/app')}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="text-sm font-semibold">Renovation Chat</h2>
          {phase && (
            <Badge variant={`phase-${phase.toLowerCase()}` as "phase-intake" | "phase-checklist" | "phase-plan" | "phase-render" | "phase-payment" | "phase-complete" | "phase-iterate"}>
              {PHASE_CONFIG[phase].label}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-success' : 'bg-destructive'}`}
            data-testid="connection-status"
            data-connected={isConnected}
          />
          <span className="text-xs text-muted-foreground">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Messages */}
      <MessageList
        messages={messages}
        isAssistantTyping={isAssistantTyping}
        isLoadingHistory={isLoadingHistory}
        phase={phase}
        onSuggestionSelect={handleSend}
      />

      {/* Input with upload support */}
      <ChatInput
        onSend={handleSend}
        disabled={!isConnected}
        phase={phase}
        {...(canUpload ? {
          uploadFiles: upload.files,
          onAddFiles: upload.addFiles,
          onRemoveFile: upload.removeFile,
          onRetryFile: upload.retryFile,
          onClearCompleted: upload.clearCompleted,
        } : {})}
      />
    </div>
  );
}
