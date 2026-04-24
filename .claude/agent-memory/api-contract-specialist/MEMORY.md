# API Contract Specialist — Agent Memory

## Initial State (2026-02-20)

### Known Drift (needs reconciliation)
- `frontend/types/renovation.ts` redefines 6 types from shared-types: AssetType, AssetStatus, AssetSource, AssetMetadata, RoomSummary, SessionStylePreferences
- `frontend/lib/design-tokens.ts` redefines RENOVATION_PHASES + RenovationPhase
- `frontend/types/renovation.ts` imports RenovationPhase from local design-tokens, not shared-types
- `socket.validators.ts` exports Zod-inferred ChatUserMessagePayload/ChatJoinSessionPayload that shadow shared-types (intentional — Zod is runtime layer)

### Contract Surface
- 7 shared-types source files, ~57 exports (types + const values)
- 8 backend validator files (Zod schemas)
- 2 frontend type files + design-tokens
- 13 Socket.io events (2 C→S, 11 S→C)
- 7 REST route files
- 5 BullMQ job schemas (backend-only, no drift risk)

### REST Response Shapes NOT in shared-types
- SessionSummary, SessionDetail, RoomAsset, Message — all only in frontend/types/
- API wraps arrays: `{ sessions: [...] }`, `{ messages: [...] }`
