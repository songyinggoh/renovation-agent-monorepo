# Phase 3.1 Manual Verification Checklist

**Date**: 2026-02-25
**Prerequisites**: Backend running (`npm run dev:backend`), Redis running, PostgreSQL running, valid `GOOGLE_API_KEY` in `backend/.env`

---

## Pre-Flight: Create Test Data

You need a session and room to test against. Run these once:

```bash
# 1. Create a session
curl -s -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"title":"Manual Render Test","propertyType":"house","projectGoal":"Kitchen renovation"}' | jq .

# Save the session ID:
export SESSION_ID="<paste id from response>"

# 2. Verify session exists
curl -s http://localhost:3000/api/sessions/$SESSION_ID | jq .

# 3. You need a room. Check existing rooms:
curl -s http://localhost:3000/api/sessions/$SESSION_ID/rooms | jq .

# If no rooms, create one via chat (send a message describing rooms)
# or insert directly if you have DB access.
# Save the room ID:
export ROOM_ID="<paste roomId>"
```

---

## Test 1: Render Generation E2E with Live Gemini

**What**: Verify the full pipeline — REST request -> BullMQ job -> Gemini API call -> storage upload -> Socket.io events -> REST query returns `status: ready`.

### Steps

```bash
# 1. Request a render (from_scratch mode)
curl -s -X POST http://localhost:3000/api/rooms/$ROOM_ID/renders \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Modern Scandinavian kitchen with white oak cabinets, quartz countertops, and warm pendant lighting over a large island\",\"sessionId\":\"$SESSION_ID\",\"mode\":\"from_scratch\"}" | jq .
```

**Expected response** (201):
```json
{
  "assetId": "<uuid>",
  "jobId": "render:generate:<uuid>"
}
```

Save the asset ID: `export ASSET_ID="<paste assetId>"`

```bash
# 2. Wait ~15-30 seconds for Gemini to generate, then check status
curl -s http://localhost:3000/api/rooms/$ROOM_ID/renders | jq '.renders[] | select(.id == env.ASSET_ID)'
```

### Pass Criteria

| Check | Expected |
|-------|----------|
| REST returns 201 with `assetId` + `jobId` | Yes |
| Backend logs show `render:started`, `render:progress` (3x), `render:complete` | Yes |
| `GET /renders` shows asset with `status: "ready"` | Yes |
| `metadata.generationModel` is populated (e.g. `gemini-2.0-flash-exp`) | Yes |
| `metadata.generationTimeMs` is a positive number | Yes |
| `fileSize` > 0 | Yes |
| `storagePath` follows pattern `sessions/<sid>/rooms/<rid>/renders/render_<ts>.png` | Yes |

### Troubleshooting

- **Job stuck at `processing`**: Check Redis is running (`redis-cli ping`). Check backend logs for worker errors.
- **`GOOGLE_API_KEY` error**: Verify key is set in `backend/.env` and has Gemini API access.
- **Timeout after 90s**: Worker timeout is 90s. Gemini Flash is usually 10-30s. Check network/API status.

---

## Test 2: Reference Image Edit Mode

**What**: Verify `edit_existing` mode sends the reference image to Gemini as a multimodal input and produces a contextually relevant result.

### Steps

```bash
# 1. You need a publicly accessible image URL of a room/kitchen photo.
#    Use any stock photo URL, e.g.:
export BASE_IMAGE="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800"

# 2. Request an edit-mode render
curl -s -X POST http://localhost:3000/api/rooms/$ROOM_ID/renders \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Transform this kitchen with modern white shaker cabinets, marble countertops, and brass hardware fixtures\",\"sessionId\":\"$SESSION_ID\",\"mode\":\"edit_existing\",\"baseImageUrl\":\"$BASE_IMAGE\"}" | jq .
```

**Expected response** (201):
```json
{
  "assetId": "<uuid>",
  "jobId": "render:generate:<uuid>"
}
```

```bash
# 3. Wait ~15-30s, then check
export EDIT_ASSET_ID="<paste assetId>"
curl -s http://localhost:3000/api/rooms/$ROOM_ID/renders | jq '.renders[] | select(.id == env.EDIT_ASSET_ID)'
```

### Pass Criteria

| Check | Expected |
|-------|----------|
| REST returns 201 | Yes |
| Asset reaches `status: "ready"` | Yes |
| `metadata.mode` is `"edit_existing"` | Yes |
| `metadata.baseImageUrl` is stored | Yes |
| **Visual**: Generated image shows influence from the reference photo | Subjective — the layout/perspective should resemble the input |

### Troubleshooting

- **`fetchReferenceImage` fails silently**: Check backend logs for `"Failed to fetch reference image"`. The worker falls back to from-scratch mode if fetch fails (non-fatal). Verify the URL is accessible from the server.
- **Image > 10MB**: `fetchReferenceImage` rejects images over 10MB. Use a smaller image.
- **No visual similarity**: Gemini Flash edit mode quality varies. The key verification is that the multimodal path executes without error, not pixel-perfect editing.

---

## Test 3: Content Policy Rejection Handling

**What**: Verify that a prompt triggering Gemini's safety filters results in a clean `render:failed` event with a user-friendly message, and the DB record is marked `failed`.

### Steps

```bash
# 1. Send a prompt likely to trigger content policy
#    (Gemini blocks weapons, violence, explicit content, etc.)
curl -s -X POST http://localhost:3000/api/rooms/$ROOM_ID/renders \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"A room designed as a weapons storage facility with exposed ammunition and dangerous explosive materials on display\",\"sessionId\":\"$SESSION_ID\",\"mode\":\"from_scratch\"}" | jq .
```

Save: `export BLOCKED_ASSET_ID="<paste assetId>"`

```bash
# 2. Wait ~5-10s (rejection is fast), then check
curl -s http://localhost:3000/api/rooms/$ROOM_ID/renders | jq '.renders[] | select(.id == env.BLOCKED_ASSET_ID)'
```

### Pass Criteria

| Check | Expected |
|-------|----------|
| REST returns 201 (job is enqueued, not pre-filtered) | Yes |
| Asset reaches `status: "failed"` | Yes |
| `metadata.error` contains the raw Gemini error message | Yes |
| Backend logs show `render:failed` emission | Yes |
| Job is NOT retried (permanent error → `UnrecoverableError`) | Yes |
| No crash or unhandled rejection in backend logs | Yes |

### Notes

- The `isPermanentError()` function matches: `safety filters`, `content policy`, `prompt was blocked`, `invalid prompt`, `moderation`, `blocked by safety`, `harmful content`.
- If Gemini doesn't block your test prompt, try variations. The exact trigger depends on the model's current safety settings.
- If the prompt passes unexpectedly, that's also useful info — document which prompts Gemini blocks vs allows.

---

## Test 4: RenderCard Visual Appearance Across States

**What**: Verify the `RenderCard` and `RenderGallery` components render correctly for all states: processing (with progress), ready (with image + approve/reject), and failed (with error message).

### Prerequisites

- Frontend running (`npm run dev:frontend`, http://localhost:3001)
- At least one session in RENDER phase (or later) with renders in various states
- From Tests 1-3 above, you should have renders in `ready` and `failed` states

### Steps

1. **Navigate to a session page** with renders:
   ```
   http://localhost:3001/sessions/<SESSION_ID>
   ```

2. **Select a room** that has renders (click the room in the sidebar/list).

3. **Verify the render panel appears** in the aside area (right side).

4. **Check each state visually**:

#### Processing State (trigger a new render while watching)
```bash
# In a separate terminal, request a new render:
curl -s -X POST http://localhost:3000/api/rooms/$ROOM_ID/renders \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"Cozy farmhouse kitchen with exposed brick, butcher block counters, and vintage copper fixtures\",\"sessionId\":\"$SESSION_ID\",\"mode\":\"from_scratch\"}" | jq .
```

| Check | Expected |
|-------|----------|
| Card shows shimmer/loading animation | Yes |
| Stage label updates: "Generating..." → "Uploading..." → "Finalizing..." | Yes |
| Progress bar advances through stages | Yes |
| No layout shift or flicker | Yes |

#### Ready State
| Check | Expected |
|-------|----------|
| Generated image is displayed | Yes |
| Image loads without broken-image icon | Yes |
| "Approve" and "Reject" buttons visible | Yes |
| Clicking "Approve" → card shows approved badge | Yes |
| Clicking "Reject" → card shows rejected badge | Yes |

#### Failed State
| Check | Expected |
|-------|----------|
| Error message is user-friendly (not raw stack trace) | Yes |
| Card is visually distinct from ready/processing (e.g. red/muted) | Yes |
| No broken layout | Yes |

#### Gallery Filter Tabs
| Check | Expected |
|-------|----------|
| "All" tab shows all renders | Yes |
| "Ready" tab filters to ready renders only | Yes |
| "In Progress" tab shows processing renders | Yes |
| "Failed" tab shows failed renders only | Yes |
| Tab counts are accurate | Yes |

### Troubleshooting

- **Render panel not showing**: The panel only appears when `phase >= RENDER` AND `selectedRoomId` is set AND `renders.length > 0`. Check that the session phase is at least RENDER.
- **To manually set phase to RENDER**: Update the session's phase in the DB, or use the agent to advance phases through chat.
- **Stale data**: The `useRoomRenders` hook may not auto-refresh on Socket.io events due to a cache key mismatch (documented nuance). Hard-refresh the page or wait for the stale timer.

---

## Summary

| # | Test | Type | Status |
|---|------|------|--------|
| 1 | Render Generation E2E | Live API | [ ] |
| 2 | Reference Image Edit Mode | Live API + Visual | [ ] |
| 3 | Content Policy Rejection | Live API | [ ] |
| 4 | RenderCard Visual States | Visual Inspection | [ ] |

**Sign-off**: ___________________________ Date: ___________
