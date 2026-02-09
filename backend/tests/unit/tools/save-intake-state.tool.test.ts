import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mocks are available inside hoisted vi.mock factories
const { mockDbUpdate, mockDbInsert } = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
  mockDbInsert: vi.fn(),
}));

// Mock logger to suppress logs during tests
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock the database module
vi.mock('../../../src/db/index.js', () => ({
  db: {
    update: mockDbUpdate,
    insert: mockDbInsert,
  },
}));

// Mock drizzle-orm eq function
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ column: _col, value: val })),
}));

// Mock sessions schema
vi.mock('../../../src/db/schema/sessions.schema.js', () => ({
  renovationSessions: {
    id: 'renovation_sessions.id',
  },
}));

// Mock rooms schema
vi.mock('../../../src/db/schema/rooms.schema.js', () => ({
  renovationRooms: {
    id: 'renovation_rooms.id',
    sessionId: 'renovation_rooms.session_id',
  },
}));

import { saveIntakeStateTool } from '../../../src/tools/save-intake-state.tool.js';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

/** Sets up db.update().set().where() chain to resolve successfully */
const setupDbUpdateChain = () => {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbUpdate.mockReturnValue({ set: mockSet });
  return { mockSet, mockWhere };
};

/** Sets up db.insert().values().returning() chain */
const setupDbInsertChain = (returnValues: unknown[]) => {
  const mockReturning = vi.fn().mockResolvedValue(returnValues);
  const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
  mockDbInsert.mockReturnValue({ values: mockValues });
  return { mockValues, mockReturning };
};

describe('saveIntakeStateTool', () => {
  beforeEach(() => {
    mockDbUpdate.mockReset();
    mockDbInsert.mockReset();
  });

  it('should create rooms and update session when budget and style are provided', async () => {
    const { mockSet, mockWhere } = setupDbUpdateChain();

    setupDbInsertChain([
      {
        id: 'room-uuid-1',
        sessionId: SESSION_ID,
        name: 'Kitchen',
        type: 'kitchen',
        budget: '15000',
        requirements: { stylePreference: 'Modern Minimalist' },
        checklist: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await saveIntakeStateTool.invoke({
      sessionId: SESSION_ID,
      rooms: [{ name: 'Kitchen', type: 'kitchen', budget: 15000 }],
      totalBudget: 50000,
      currency: 'USD',
      stylePreference: 'Modern Minimalist',
    });

    const parsed = JSON.parse(result) as {
      success: boolean;
      message: string;
      rooms: Array<{ id: string; name: string; type: string; budget: string }>;
    };

    expect(parsed.success).toBe(true);
    expect(parsed.message).toContain('Saved 1 room(s)');
    expect(parsed.message).toContain('$50000');
    expect(parsed.message).toContain('Modern Minimalist');
    expect(parsed.rooms).toHaveLength(1);
    expect(parsed.rooms[0]).toEqual({
      id: 'room-uuid-1',
      name: 'Kitchen',
      type: 'kitchen',
      budget: '15000',
    });

    // Verify db.update was called for session
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();

    // Verify batch insert was called once (not N times)
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });

  it('should skip session update when no budget or style preference', async () => {
    setupDbInsertChain([
      {
        id: 'room-uuid-2',
        sessionId: SESSION_ID,
        name: 'Bathroom',
        type: 'bathroom',
        budget: null,
        requirements: null,
        checklist: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await saveIntakeStateTool.invoke({
      sessionId: SESSION_ID,
      rooms: [{ name: 'Bathroom', type: 'bathroom' }],
    });

    const parsed = JSON.parse(result) as { success: boolean; rooms: Array<{ id: string }> };

    expect(parsed.success).toBe(true);
    expect(parsed.rooms).toHaveLength(1);

    // db.update should NOT have been called
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('should batch-insert multiple rooms in a single query', async () => {
    setupDbUpdateChain();

    setupDbInsertChain([
      {
        id: 'room-uuid-1',
        sessionId: SESSION_ID,
        name: 'Kitchen',
        type: 'kitchen',
        budget: '20000',
        requirements: null,
        checklist: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'room-uuid-2',
        sessionId: SESSION_ID,
        name: 'Bathroom',
        type: 'bathroom',
        budget: '10000',
        requirements: null,
        checklist: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await saveIntakeStateTool.invoke({
      sessionId: SESSION_ID,
      rooms: [
        { name: 'Kitchen', type: 'kitchen', budget: 20000 },
        { name: 'Bathroom', type: 'bathroom', budget: 10000 },
      ],
      totalBudget: 30000,
    });

    const parsed = JSON.parse(result) as {
      success: boolean;
      rooms: Array<{ id: string; name: string }>;
    };

    expect(parsed.success).toBe(true);
    expect(parsed.rooms).toHaveLength(2);

    // Verify only ONE insert call was made (batch, not N+1)
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });

  it('should return failure JSON when an error is thrown', async () => {
    setupDbUpdateChain();

    const mockReturning = vi.fn().mockRejectedValue(new Error('DB insert failed'));
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    mockDbInsert.mockReturnValue({ values: mockValues });

    const result = await saveIntakeStateTool.invoke({
      sessionId: SESSION_ID,
      rooms: [{ name: 'Kitchen', type: 'kitchen' }],
      totalBudget: 50000,
    });

    const parsed = JSON.parse(result) as { success: boolean; error: string };

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Failed to save intake state');
  });
});
