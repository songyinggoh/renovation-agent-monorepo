import type { RenovationPhase } from '@/lib/design-tokens';

export interface SessionSummary {
  id: string;
  title: string;
  phase: RenovationPhase;
  totalBudget: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoomSummary {
  id: string;
  name: string;
  type: string;
  budget: string | null;
}

export type AssetType = 'photo' | 'floorplan' | 'render' | 'document';
export type AssetStatus = 'pending' | 'uploaded' | 'processing' | 'ready' | 'failed';
export type AssetSource = 'user_upload' | 'pinterest' | 'ai_generated';

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

export interface RoomAsset {
  id: string;
  sessionId: string;
  roomId: string;
  assetType: AssetType;
  storagePath: string;
  source: AssetSource;
  status: AssetStatus;
  originalFilename: string;
  contentType: string;
  fileSize: number;
  displayOrder: number | null;
  caption: string | null;
  altText: string | null;
  uploadedBy: string | null;
  metadata: AssetMetadata | null;
  createdAt: string;
  updatedAt: string;
}
