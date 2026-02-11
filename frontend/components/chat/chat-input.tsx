'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Camera, Map, ImagePlus } from 'lucide-react';
import { FileUploadZone } from '@/components/chat/file-upload-zone';
import type { UploadFile } from '@/hooks/useFileUpload';
import type { RenovationPhase } from '@/lib/design-tokens';
import type { AssetType } from '@/types/renovation';

const UPLOAD_ASSET_TYPES: { value: AssetType; label: string; icon: typeof Camera }[] = [
  { value: 'photo', label: 'Photos', icon: Camera },
  { value: 'floorplan', label: 'Floor Plans', icon: Map },
];

const PHASE_PLACEHOLDERS: Record<RenovationPhase, string> = {
  INTAKE: 'Describe your vision or upload room photos...',
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
  const [uploadToggledByUser, setUploadToggledByUser] = useState<boolean | null>(null);
  const [intakePromptDismissed, setIntakePromptDismissed] = useState(false);
  const [uploadAssetType, setUploadAssetType] = useState<AssetType>('photo');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasUploadSupport = onAddFiles && onRemoveFile && onRetryFile && onClearCompleted;
  const isIntakePhase = phase === 'INTAKE' && hasUploadSupport;
  const hasUploadedFiles = (uploadFiles?.filter((f) => f.status === 'success').length ?? 0) > 0;
  const showIntakePrompt = isIntakePhase && !intakePromptDismissed && !hasUploadedFiles;

  // Auto-expand upload zone during INTAKE, but let user override via paperclip toggle
  const showUpload = uploadToggledByUser ?? (isIntakePhase && !intakePromptDismissed);

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

  const activeUploadCount = uploadFiles?.filter(
    (f) => f.status !== 'success' && f.status !== 'error'
  ).length ?? 0;

  return (
    <div className="border-t border-border bg-card">
      {/* Intake guidance prompt */}
      {showIntakePrompt && (
        <div className="flex items-start gap-3 border-b border-border bg-primary/5 px-4 py-3">
          <ImagePlus className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">Upload your room photos or floor plan</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Share photos of the space you want to renovate. This helps us understand your current layout and suggest the best design options.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIntakePromptDismissed(true)}
            className="flex-shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss upload prompt"
          >
            <span className="text-xs">Skip</span>
          </button>
        </div>
      )}

      {/* Upload zone */}
      {showUpload && hasUploadSupport && uploadFiles && (
        <div className="border-b border-border px-4 py-3">
          <div className="mb-2 flex gap-1">
            {UPLOAD_ASSET_TYPES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setUploadAssetType(value)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  uploadAssetType === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          <FileUploadZone
            files={uploadFiles}
            assetType={uploadAssetType}
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
            onClick={() => setUploadToggledByUser((prev) => !(prev ?? showUpload))}
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
