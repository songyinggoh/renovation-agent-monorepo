-- Performance indexes for frequently-queried tables
-- Phase II: Operational Efficiency

-- chat_messages: Queried by sessionId + ordered by createdAt on every message
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
ON chat_messages (session_id, created_at DESC);

-- chat_messages: Filter by role within a session (e.g., get last N user messages)
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_role
ON chat_messages (session_id, role);

-- renovation_rooms: Queried by sessionId frequently
CREATE INDEX IF NOT EXISTS idx_renovation_rooms_session
ON renovation_rooms (session_id);

-- product_recommendations: Queried by roomId
CREATE INDEX IF NOT EXISTS idx_product_recommendations_room
ON product_recommendations (room_id);

-- contractor_recommendations: Queried by roomId
CREATE INDEX IF NOT EXISTS idx_contractor_recommendations_room
ON contractor_recommendations (room_id);

-- renovation_sessions: Queried by userId (when auth is enforced)
CREATE INDEX IF NOT EXISTS idx_renovation_sessions_user
ON renovation_sessions (user_id) WHERE user_id IS NOT NULL;

-- room_assets: Queried by sessionId + roomId
CREATE INDEX IF NOT EXISTS idx_room_assets_session_room
ON room_assets (session_id, room_id);
