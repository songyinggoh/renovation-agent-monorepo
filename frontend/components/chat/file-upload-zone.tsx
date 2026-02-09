'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Upload, X, RotateCcw, CheckCircle2, FileText } from 'lucide-react';
import { getAcceptedTypes, formatFileSize } from '@/lib/upload';
import type { UploadFile } from '@/hooks/useFileUpload';
import type { AssetType } from '@/types/renovation';
import Image from 'next/image';

interface FileUploadZoneProps {
  files: UploadFile[];
  assetType: AssetType;
  onAddFiles: (files: File[], assetType?: AssetType) => void;
  onRemoveFile: (id: string) => void;
  onRetryFile: (id: string) => void;
  onClearCompleted: () => void;
  disabled?: boolean;
  maxFiles?: number;
}

export function FileUploadZone({
  files,
  assetType,
  onAddFiles,
  onRemoveFile,
  onRetryFile,
  onClearCompleted,
  disabled = false,
  maxFiles = 5,
}: FileUploadZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onAddFiles(acceptedFiles, assetType);
    },
    [onAddFiles, assetType]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: getAcceptedTypes(assetType),
    maxFiles,
    maxSize: 10 * 1024 * 1024,
    disabled,
  });

  const hasFiles = files.length > 0;
  const completedCount = files.filter((f) => f.status === 'success').length;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`
          cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors
          ${isDragActive && !isDragReject ? 'border-primary bg-primary/5' : ''}
          ${isDragReject ? 'border-destructive bg-destructive/5' : ''}
          ${!isDragActive && !isDragReject ? 'border-muted-foreground/25 hover:border-primary/50' : ''}
          ${disabled ? 'cursor-not-allowed opacity-50' : ''}
        `}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-1 text-sm text-muted-foreground">
          {isDragActive
            ? isDragReject
              ? 'Some files are not supported'
              : 'Drop files here'
            : 'Drag & drop files, or click to browse'}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground/70">
          {assetType === 'photo' && 'JPG, PNG, or WebP up to 10 MB'}
          {assetType === 'floorplan' && 'JPG, PNG, WebP, or PDF up to 10 MB'}
          {assetType === 'document' && 'PDF up to 10 MB'}
        </p>
      </div>

      {/* File list */}
      {hasFiles && (
        <div className="space-y-2">
          {files.map((file) => (
            <FileItem
              key={file.id}
              file={file}
              onRemove={() => onRemoveFile(file.id)}
              onRetry={() => onRetryFile(file.id)}
            />
          ))}

          {completedCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearCompleted}
              className="w-full text-xs text-muted-foreground"
            >
              Clear completed ({completedCount})
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FileItem({
  file,
  onRemove,
  onRetry,
}: {
  file: UploadFile;
  onRemove: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
      {/* Preview */}
      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
        {file.previewUrl ? (
          <Image
            src={file.previewUrl}
            alt={file.file.name}
            width={40}
            height={40}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <FileText className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{file.file.name}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">
            {formatFileSize(file.file.size)}
          </span>
          {file.status === 'error' && (
            <span className="truncate text-xs text-destructive">{file.error}</span>
          )}
        </div>

        {/* Progress bar */}
        {(file.status === 'uploading' || file.status === 'confirming') && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${file.progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Status/Actions */}
      <div className="flex-shrink-0">
        {file.status === 'success' && (
          <CheckCircle2 className="h-4 w-4 text-success" />
        )}
        {file.status === 'error' && (
          <div className="flex gap-1">
            <button
              onClick={onRetry}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Retry upload"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onRemove}
              className="rounded p-0.5 text-muted-foreground hover:text-destructive"
              aria-label="Remove file"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {file.status === 'uploading' && (
          <span className="text-xs text-muted-foreground">{file.progress}%</span>
        )}
        {file.status === 'confirming' && (
          <span className="text-xs text-muted-foreground">Saving...</span>
        )}
        {file.status === 'pending' && (
          <button
            onClick={onRemove}
            className="rounded p-0.5 text-muted-foreground hover:text-destructive"
            aria-label="Remove file"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
