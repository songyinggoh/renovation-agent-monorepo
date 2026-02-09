import type { AssetType } from '@/types/renovation';

const ALLOWED_MIME_TYPES: Record<AssetType, string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  floorplan: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  render: ['image/png', 'image/webp'],
  document: ['application/pdf'],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Validate a file against type and size constraints
 */
export function validateFile(
  file: File,
  assetType: AssetType
): { valid: boolean; error?: string } {
  const allowed = ALLOWED_MIME_TYPES[assetType];
  if (!allowed || !allowed.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file type: ${file.type}. Allowed: ${allowed?.join(', ') ?? 'none'}`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum: 10 MB`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty' };
  }

  return { valid: true };
}

/**
 * Get accepted file types for react-dropzone based on asset type
 */
export function getAcceptedTypes(assetType: AssetType): Record<string, string[]> {
  const mimes = ALLOWED_MIME_TYPES[assetType];
  const accept: Record<string, string[]> = {};
  for (const mime of mimes) {
    if (mime === 'image/jpeg') accept[mime] = ['.jpg', '.jpeg'];
    else if (mime === 'image/png') accept[mime] = ['.png'];
    else if (mime === 'image/webp') accept[mime] = ['.webp'];
    else if (mime === 'application/pdf') accept[mime] = ['.pdf'];
  }
  return accept;
}

/**
 * Upload a file to a signed URL with progress tracking
 */
export function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed: network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/**
 * Generate a local preview URL for an image file
 */
export function generatePreviewUrl(file: File): string | null {
  if (file.type.startsWith('image/')) {
    return URL.createObjectURL(file);
  }
  return null;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
