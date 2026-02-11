'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { fetchWithAuth } from '@/lib/api';
import {
  validateFile,
  uploadWithProgress,
  generatePreviewUrl,
} from '@/lib/upload';
import type { AssetType, RoomAsset } from '@/types/renovation';

export type UploadFileStatus = 'pending' | 'uploading' | 'confirming' | 'success' | 'error';

export interface UploadFile {
  id: string;
  file: File;
  assetType: AssetType;
  status: UploadFileStatus;
  progress: number;
  error?: string;
  previewUrl: string | null;
  asset?: RoomAsset;
}

interface UseFileUploadOptions {
  roomId: string;
  sessionId: string;
  assetType?: AssetType;
  maxConcurrent?: number;
}

export function useFileUpload({
  roomId,
  sessionId,
  assetType = 'photo',
  maxConcurrent = 3,
}: UseFileUploadOptions) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const filesRef = useRef<UploadFile[]>([]);
  filesRef.current = files;
  const activeUploads = useRef(0);
  const queueRef = useRef<string[]>([]);

  // Clean up preview URLs on unmount
  useEffect(() => {
    return () => {
      files.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
    // Only clean up on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateFile = useCallback((id: string, update: Partial<UploadFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...update } : f)));
  }, []);

  const processQueue = useCallback(async () => {
    while (activeUploads.current < maxConcurrent && queueRef.current.length > 0) {
      const fileId = queueRef.current.shift();
      if (!fileId) break;

      activeUploads.current++;
      const uploadFile = filesRef.current.find((f) => f.id === fileId);
      if (!uploadFile || uploadFile.status !== 'pending') {
        activeUploads.current--;
        continue;
      }

      uploadSingleFile(fileId, uploadFile.file, uploadFile.assetType).finally(() => {
        activeUploads.current--;
        processQueue();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxConcurrent]);

  const uploadSingleFile = async (id: string, file: File, type: AssetType) => {
    try {
      updateFile(id, { status: 'uploading', progress: 0 });

      // Step 1: Request signed upload URL
      const result = await fetchWithAuth(`/api/rooms/${roomId}/assets/request-upload`, {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
          assetType: type,
          sessionId,
        }),
      });

      // Step 2: Upload directly to storage
      await uploadWithProgress(result.signedUrl, file, (progress) => {
        updateFile(id, { progress });
      });

      // Step 3: Confirm upload
      updateFile(id, { status: 'confirming', progress: 100 });
      const { asset } = await fetchWithAuth(
        `/api/rooms/${roomId}/assets/${result.assetId}/confirm`,
        { method: 'POST' }
      );

      updateFile(id, { status: 'success', asset });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      updateFile(id, { status: 'error', error: message });
    }
  };

  const addFiles = useCallback(
    (newFiles: File[], type?: AssetType) => {
      const fileType = type ?? assetType;
      const uploadFiles: UploadFile[] = [];

      for (const file of newFiles) {
        const validation = validateFile(file, fileType);
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        if (!validation.valid) {
          uploadFiles.push({
            id,
            file,
            assetType: fileType,
            status: 'error',
            progress: 0,
            error: validation.error,
            previewUrl: null,
          });
        } else {
          uploadFiles.push({
            id,
            file,
            assetType: fileType,
            status: 'pending',
            progress: 0,
            previewUrl: generatePreviewUrl(file),
          });
          queueRef.current.push(id);
        }
      }

      setFiles((prev) => [...prev, ...uploadFiles]);

      // Kick off processing after state update
      setTimeout(() => processQueue(), 0);
    },
    [assetType, processQueue]
  );

  const removeFile = useCallback(
    (id: string) => {
      setFiles((prev) => {
        const file = prev.find((f) => f.id === id);
        if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
        return prev.filter((f) => f.id !== id);
      });
      queueRef.current = queueRef.current.filter((fId) => fId !== id);
    },
    []
  );

  const retryFile = useCallback(
    (id: string) => {
      const file = filesRef.current.find((f) => f.id === id);
      if (!file || file.status !== 'error') return;

      const validation = validateFile(file.file, file.assetType);
      if (!validation.valid) return;

      updateFile(id, { status: 'pending', progress: 0, error: undefined });
      queueRef.current.push(id);
      processQueue();
    },
    [updateFile, processQueue]
  );

  const clearCompleted = useCallback(() => {
    setFiles((prev) => {
      prev.filter((f) => f.status === 'success').forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
      return prev.filter((f) => f.status !== 'success');
    });
  }, []);

  const isUploading = files.some((f) => f.status === 'uploading' || f.status === 'confirming');
  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const successCount = files.filter((f) => f.status === 'success').length;
  const errorCount = files.filter((f) => f.status === 'error').length;

  return {
    files,
    addFiles,
    removeFile,
    retryFile,
    clearCompleted,
    isUploading,
    pendingCount,
    successCount,
    errorCount,
  };
}
