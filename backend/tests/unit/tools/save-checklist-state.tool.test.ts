import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mocks are available inside hoisted vi.mock factories
const { mockGetRoomById, mockUpdateRoomChecklist } = vi.hoisted(() => ({
  mockGetRoomById: vi.fn(),
  mockUpdateRoomChecklist: vi.fn(),
}));

// Mock logger to suppress logs during tests
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock RoomService module with stable hoisted references
vi.mock('../../../src/services/room.service.js', () => ({
  RoomService: vi.fn().mockImplementation(() => ({
    getRoomById: mockGetRoomById,
    updateRoomChecklist: mockUpdateRoomChecklist,
  })),
}));

import { saveChecklistStateTool } from '../../../src/tools/save-checklist-state.tool.js';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const ROOM_ID = '660e8400-e29b-41d4-a716-446655440001';
const WRONG_SESSION_ID = '770e8400-e29b-41d4-a716-446655440002';

const mockRoom = {
  id: ROOM_ID,
  sessionId: SESSION_ID,
  name: 'Kitchen',
  type: 'kitchen',
  budget: '15000',
  requirements: null,
  checklist: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const sampleChecklist = [
  {
    id: 'item-1',
    category: 'flooring',
    description: 'Hardwood flooring for main area',
    priority: 'must-have' as const,
    estimatedBudget: 3000,
    completed: false,
  },
  {
    id: 'item-2',
    category: 'lighting',
    description: 'Under-cabinet LED strips',
    priority: 'nice-to-have' as const,
    estimatedBudget: 500,
    completed: false,
  },
  {
    id: 'item-3',
    category: 'paint',
    description: 'Accent wall color',
    priority: 'optional' as const,
    estimatedBudget: 200,
    completed: false,
  },
];

describe('saveChecklistStateTool', () => {
  beforeEach(() => {
    mockGetRoomById.mockReset();
    mockUpdateRoomChecklist.mockReset();
  });

  it('should return error when room is not found', async () => {
    mockGetRoomById.mockResolvedValue(null);

    const result = await saveChecklistStateTool.invoke({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      checklist: sampleChecklist,
    });

    const parsed = JSON.parse(result) as { success: boolean; error: string };

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe(`Room not found: ${ROOM_ID}`);
    expect(mockGetRoomById).toHaveBeenCalledWith(ROOM_ID);
    expect(mockUpdateRoomChecklist).not.toHaveBeenCalled();
  });

  it('should return error when room does not belong to session', async () => {
    mockGetRoomById.mockResolvedValue(mockRoom);

    const result = await saveChecklistStateTool.invoke({
      sessionId: WRONG_SESSION_ID,
      roomId: ROOM_ID,
      checklist: sampleChecklist,
    });

    const parsed = JSON.parse(result) as { success: boolean; error: string };

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Room does not belong to this session');
    expect(mockUpdateRoomChecklist).not.toHaveBeenCalled();
  });

  it('should save checklist and return success with priority counts', async () => {
    mockGetRoomById.mockResolvedValue(mockRoom);
    mockUpdateRoomChecklist.mockResolvedValue({
      ...mockRoom,
      checklist: sampleChecklist,
      updatedAt: new Date('2025-01-02'),
    });

    const result = await saveChecklistStateTool.invoke({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      checklist: sampleChecklist,
    });

    const parsed = JSON.parse(result) as {
      success: boolean;
      message: string;
      roomId: string;
      roomName: string;
      checklistCount: number;
      priorities: { mustHave: number; niceToHave: number; optional: number };
    };

    expect(parsed.success).toBe(true);
    expect(parsed.message).toBe('Saved checklist with 3 items for Kitchen');
    expect(parsed.roomId).toBe(ROOM_ID);
    expect(parsed.roomName).toBe('Kitchen');
    expect(parsed.checklistCount).toBe(3);
    expect(parsed.priorities).toEqual({
      mustHave: 1,
      niceToHave: 1,
      optional: 1,
    });

    expect(mockUpdateRoomChecklist).toHaveBeenCalledWith(ROOM_ID, sampleChecklist);
  });

  it('should correctly count priorities with multiple items of same type', async () => {
    mockGetRoomById.mockResolvedValue(mockRoom);

    const multiPriorityChecklist = [
      { id: 'a', category: 'flooring', description: 'Floors', priority: 'must-have' as const, completed: false },
      { id: 'b', category: 'lighting', description: 'Lights', priority: 'must-have' as const, completed: false },
      { id: 'c', category: 'paint', description: 'Paint', priority: 'must-have' as const, completed: false },
      { id: 'd', category: 'fixtures', description: 'Faucet', priority: 'nice-to-have' as const, completed: false },
    ];

    mockUpdateRoomChecklist.mockResolvedValue({
      ...mockRoom,
      checklist: multiPriorityChecklist,
      updatedAt: new Date(),
    });

    const result = await saveChecklistStateTool.invoke({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      checklist: multiPriorityChecklist,
    });

    const parsed = JSON.parse(result) as {
      success: boolean;
      priorities: { mustHave: number; niceToHave: number; optional: number };
    };

    expect(parsed.success).toBe(true);
    expect(parsed.priorities.mustHave).toBe(3);
    expect(parsed.priorities.niceToHave).toBe(1);
    expect(parsed.priorities.optional).toBe(0);
  });

  it('should return failure JSON when service throws', async () => {
    mockGetRoomById.mockRejectedValue(new Error('Database connection lost'));

    const result = await saveChecklistStateTool.invoke({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      checklist: sampleChecklist,
    });

    const parsed = JSON.parse(result) as { success: boolean; error: string };

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Failed to save checklist');
  });
});
