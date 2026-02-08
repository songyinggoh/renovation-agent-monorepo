'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Paperclip } from 'lucide-react';
import { FileUploadZone } from '@/components/chat/file-upload-zone';
import type { UploadFile } from '@/hooks/useFileUpload';
import type { RenovationPhase } from '@/lib/design-tokens';
import type { AssetType } from '@/types/renovation';

const PHASE_PLACEHOLDERS: Record<RenovationPhase, string> = {
  INTAKE: 'Describe your renovation vision...',
  CHECKLIST: 'What requirements should we add?',
  PLAN: 'Ask about the plan details...',
  RENDER: 'Describe what you\'d like to see...',
  PAYMENT: 'Questions about pricing?',
  COMPLETE: 'How does everything look?',
  ITERATE: 'What would you like to change?',
};

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
  phase?: RenovationPhase;
  uploadFiles?: UploadFile[];
  onAddFiles?: (files: File[], assetType?: AssetType) => void;
  onRemoveFile?: (id: string) => void;
  onRetryFile?: (id: string) => void;
  onClearCompleted?: () => void;
}

export function ChatInput({
  onSend,
  disabled,
  phase,
  uploadFiles,
  onAddFiles,
  onRemoveFile,
  onRetryFile,
  onClearCompleted,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 128) + 'px';
  };

  const hasUploadSupport = onAddFiles && onRemoveFile && onRetryFile && onClearCompleted;
  const activeUploadCount = uploadFiles?.filter(
    (f) => f.status !== 'success' && f.status !== 'error'
  ).length ?? 0;

  return (
    <div className="border-t border-border bg-card">
      {/* Upload zone */}
      {showUpload && hasUploadSupport && uploadFiles && (
        <div className="border-b border-border px-4 py-3">
          <FileUploadZone
            files={uploadFiles}
            assetType="photo"
            onAddFiles={onAddFiles}
            onRemoveFile={onRemoveFile}
            onRetryFile={onRetryFile}
            onClearCompleted={onClearCompleted}
            disabled={disabled}
          />
        </div>
      )}

      {/* Input row */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="flex items-end gap-2 p-4"
      >
        {hasUploadSupport && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative h-10 w-10 flex-shrink-0"
            onClick={() => setShowUpload((prev) => !prev)}
            disabled={disabled}
            aria-label={showUpload ? 'Hide file upload' : 'Attach files'}
          >
            <Paperclip className="h-4 w-4" />
            {activeUploadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {activeUploadCount}
              </span>
            )}
          </Button>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={disabled}
          placeholder={disabled ? 'Connecting...' : (phase ? PHASE_PLACEHOLDERS[phase] : 'Describe your renovation vision...')}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        />
        <Button
          type="submit"
          disabled={disabled || !input.trim()}
          size="icon"
          className="h-10 w-10"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
