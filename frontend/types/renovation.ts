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

export interface RoomAsset {
  id: string;
  sessionId: string;
  roomId: string;
  assetType: AssetType;
  storagePath: string;
  source: string;
  status: AssetStatus;
  originalFilename: string;
  contentType: string;
  fileSize: number;
  displayOrder: number | null;
  caption: string | null;
  altText: string | null;
  uploadedBy: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
