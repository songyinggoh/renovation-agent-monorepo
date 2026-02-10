'use client';

import { useRouter } from 'next/navigation';
import { useChat } from '@/hooks/useChat';
import { useFileUpload } from '@/hooks/useFileUpload';
import { MessageList } from '@/components/chat/message-list';
import { ChatInput } from '@/components/chat/chat-input';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PHASE_CONFIG, type RenovationPhase } from '@/lib/design-tokens';

interface ChatViewProps {
  sessionId: string;
  phase?: RenovationPhase;
  roomId?: string;
}

export function ChatView({ sessionId, phase, roomId }: ChatViewProps) {
  const router = useRouter();
  const { messages, sendMessage, isConnected, error, isAssistantTyping, isLoadingHistory } = useChat(sessionId);

  const upload = useFileUpload({
    roomId: roomId ?? sessionId,
    sessionId,
  });

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
        onSuggestionSelect={sendMessage}
      />

      {/* Input with upload support */}
      <ChatInput
        onSend={sendMessage}
        disabled={!isConnected}
        phase={phase}
        uploadFiles={upload.files}
        onAddFiles={upload.addFiles}
        onRemoveFile={upload.removeFile}
        onRetryFile={upload.retryFile}
        onClearCompleted={upload.clearCompleted}
      />
    </div>
  );
}
