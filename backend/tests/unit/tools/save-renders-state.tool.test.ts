import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks
const { mockSaveRendersState } = vi.hoisted(() => ({
  mockSaveRendersState: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock RenderService — only saveRendersState is used by this tool
vi.mock('../../../src/services/render.service.js', () => ({
  RenderService: vi.fn().mockImplementation(() => ({
    saveRendersState: mockSaveRendersState,
  })),
}));

import { saveRendersStateTool } from '../../../src/tools/save-renders-state.tool.js';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const ROOM_ID = '660e8400-e29b-41d4-a716-446655440001';
const ASSET_ID = '770e8400-e29b-41d4-a716-446655440002';

describe('saveRendersStateTool', () => {
  beforeEach(() => {
    mockSaveRendersState.mockReset();
  });

  it('should have correct name and description', () => {
    expect(saveRendersStateTool.name).toBe('save_renders_state');
    expect(saveRendersStateTool.description).toContain('selected renders');
  });

  it('should return success when all selections are saved', async () => {
    // Service reports all saved, no errors
    mockSaveRendersState.mockResolvedValue({
      saved: [{ roomId: ROOM_ID, assetId: ASSET_ID }],
      errors: [],
    });

    const result = await saveRendersStateTool.invoke({
      sessionId: SESSION_ID,
      selections: [
        { roomId: ROOM_ID, assetId: ASSET_ID, renderType: 'initial' },
      ],
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.saved).toHaveLength(1);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.message).toContain('1 render selection');

    // Service called with correct args
    expect(mockSaveRendersState).toHaveBeenCalledWith(
      SESSION_ID,
      [{ roomId: ROOM_ID, assetId: ASSET_ID, renderType: 'initial' }],
    );
  });

  it('should report partial success when some selections fail', async () => {
    const ROOM_ID_2 = '660e8400-e29b-41d4-a716-446655440099';
    const ASSET_ID_2 = '770e8400-e29b-41d4-a716-446655440099';

    mockSaveRendersState.mockResolvedValue({
      saved: [{ roomId: ROOM_ID, assetId: ASSET_ID }],
      errors: [{ roomId: ROOM_ID_2, assetId: ASSET_ID_2, reason: 'Render asset not found' }],
    });

    const result = await saveRendersStateTool.invoke({
      sessionId: SESSION_ID,
      selections: [
        { roomId: ROOM_ID, assetId: ASSET_ID, renderType: 'initial' },
        { roomId: ROOM_ID_2, assetId: ASSET_ID_2, renderType: 'iteration' },
      ],
    });

    const parsed = JSON.parse(result);
    // success is false when any errors exist
    expect(parsed.success).toBe(false);
    expect(parsed.saved).toHaveLength(1);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].reason).toContain('not found');
  });

  it('should return error when service throws', async () => {
    mockSaveRendersState.mockRejectedValue(new Error('Database connection failed'));

    const result = await saveRendersStateTool.invoke({
      sessionId: SESSION_ID,
      selections: [
        { roomId: ROOM_ID, assetId: ASSET_ID, renderType: 'initial' },
      ],
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Database connection failed');
  });

  it('should accept iteration renderType', async () => {
    mockSaveRendersState.mockResolvedValue({
      saved: [{ roomId: ROOM_ID, assetId: ASSET_ID }],
      errors: [],
    });

    const result = await saveRendersStateTool.invoke({
      sessionId: SESSION_ID,
      selections: [
        { roomId: ROOM_ID, assetId: ASSET_ID, renderType: 'iteration' },
      ],
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);

    // Verify renderType is passed through
    expect(mockSaveRendersState).toHaveBeenCalledWith(
      SESSION_ID,
      [{ roomId: ROOM_ID, assetId: ASSET_ID, renderType: 'iteration' }],
    );
  });

  it('should support multiple selections in one call', async () => {
    const ROOM_ID_2 = '660e8400-e29b-41d4-a716-446655440088';
    const ASSET_ID_2 = '770e8400-e29b-41d4-a716-446655440088';

    mockSaveRendersState.mockResolvedValue({
      saved: [
        { roomId: ROOM_ID, assetId: ASSET_ID },
        { roomId: ROOM_ID_2, assetId: ASSET_ID_2 },
      ],
      errors: [],
    });

    const result = await saveRendersStateTool.invoke({
      sessionId: SESSION_ID,
      selections: [
        { roomId: ROOM_ID, assetId: ASSET_ID, renderType: 'initial' },
        { roomId: ROOM_ID_2, assetId: ASSET_ID_2, renderType: 'initial' },
      ],
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.saved).toHaveLength(2);
  });
});
