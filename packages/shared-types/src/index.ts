export {
  RENOVATION_PHASES,
  type RenovationPhase,
} from './phases.js';

export {
  type SessionStylePreferences,
  type RoomSummary,
} from './session.js';

export {
  ASSET_TYPES,
  ASSET_STATUSES,
  ASSET_SOURCES,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  type AssetType,
  type AssetStatus,
  type AssetSource,
  type AssetMetadata,
} from './assets.js';

export {
  MESSAGE_ROLES,
  MESSAGE_TYPES,
  type MessageRole,
  type MessageType,
} from './messages.js';

export {
  type MessageAttachment,
  type ChatJoinSessionPayload,
  type ChatUserMessagePayload,
  type ChatMessageAckPayload,
  type ChatAssistantTokenPayload,
  type ChatToolCallPayload,
  type ChatToolResultPayload,
  type ChatErrorPayload,
  type ChatWarningPayload,
  type SessionRoomsUpdatedPayload,
  type SessionPhaseChangedPayload,
  type AssetProcessingProgressPayload,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from './socket-events.js';

export {
  PRODUCT_CATEGORIES,
  ROOM_TYPES,
  STYLE_SLUG_REGEX,
  type ProductCategory,
  type RoomType,
} from './constants.js';
