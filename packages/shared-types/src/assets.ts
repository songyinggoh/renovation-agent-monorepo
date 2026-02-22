export const ASSET_TYPES = ['photo', 'floorplan', 'render', 'document'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_STATUSES = ['pending', 'uploaded', 'processing', 'ready', 'failed'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_SOURCES = ['user_upload', 'pinterest', 'ai_generated'] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];

export interface AssetMetadata {
  width?: number;
  height?: number;
  orientation?: 'landscape' | 'portrait' | 'square';
  roomAngle?: 'overview' | 'detail' | 'closeup' | 'corner';
  lighting?: 'natural' | 'artificial' | 'mixed';
  scale?: string;
  dimensions?: { length: number; width: number; unit: 'ft' | 'm' };
  style?: string;
  prompt?: string;
  modelVersion?: string;
  thumbnailGenerated?: boolean;
  compressionApplied?: boolean;
  originalSize?: number;
  [key: string]: unknown;
}

export const ALLOWED_MIME_TYPES: Record<AssetType, string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  floorplan: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  render: ['image/png', 'image/webp'],
  document: ['application/pdf'],
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
