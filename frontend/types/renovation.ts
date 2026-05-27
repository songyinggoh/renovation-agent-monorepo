import type { RenovationPhase } from '@/lib/design-tokens';

// Re-export shared types so consumers can import from one place
export type {
  RoomSummary,
  SessionStylePreferences,
} from '@renovation/shared-types';

export type {
  AssetType,
  AssetStatus,
  AssetSource,
  AssetMetadata,
} from '@renovation/shared-types';

import type { RoomSummary, SessionStylePreferences } from '@renovation/shared-types';
import type { AssetType, AssetStatus, AssetSource, AssetMetadata } from '@renovation/shared-types';

// Frontend-specific types that combine shared types with UI concerns

export interface SessionSummary {
  id: string;
  title: string;
  phase: RenovationPhase;
  totalBudget: string | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDetail extends SessionSummary {
  stylePreferences: SessionStylePreferences | null;
  rooms?: RoomSummary[];
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
