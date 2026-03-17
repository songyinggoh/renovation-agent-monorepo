import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mocks are available inside hoisted vi.mock factories
const { mockDbSelect, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
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
    select: mockDbSelect,
    update: mockDbUpdate,
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
    planData: 'renovation_sessions.plan_data',
    updatedAt: 'renovation_sessions.updated_at',
  },
}));

// Mock jsonb-schemas — re-export a real-ish RenovationPlanSchema so safeParse works
vi.mock('../../../src/db/jsonb-schemas.js', async () => {
  const { z } = await import('zod');

  const RenovationTaskSchema = z.object({
    id: z.string(),
    description: z.string(),
    estimatedCost: z.number().nonnegative(),
    duration: z.number().int().positive(),
    tradeCategory: z.enum([
      'electrical', 'plumbing', 'carpentry', 'painting',
      'flooring', 'tiling', 'hvac', 'general',
    ]),
    priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
    dependencies: z.array(z.string()).default([]),
  }).passthrough();

  const RenovationRoomPlanSchema = z.object({
    roomId: z.string(),
    roomName: z.string(),
    tasks: z.array(RenovationTaskSchema).min(1),
    estimatedCost: z.number().nonnegative(),
    estimatedDays: z.number().int().positive(),
  }).passthrough();

  const RenovationPlanSchema = z.object({
    summary: z.string(),
    totalBudget: z.number().nonnegative(),
    totalDays: z.number().int().positive(),
    startDate: z.string().optional(),
    rooms: z.array(RenovationRoomPlanSchema),
    contractors: z.array(z.object({
      specialty: z.string(),
      estimatedCost: z.number().nonnegative(),
      notes: z.string().optional(),
    }).passthrough()).default([]),
    warnings: z.array(z.string()).default([]),
    generatedAt: z.string(),
  }).passthrough();

  return { RenovationPlanSchema };
});

import { savePlanStateTool } from '../../../src/tools/save-plan-state.tool.js';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';

const VALID_PLAN = {
  summary: 'Complete kitchen renovation',
  totalBudget: 25000,
  totalDays: 21,
  generatedAt: '2026-03-16T00:00:00Z',
  rooms: [{
    roomId: 'room-uuid-1',
    roomName: 'Kitchen',
    estimatedCost: 25000,
    estimatedDays: 21,
    tasks: [{
      id: 'task-1',
      description: 'Install new cabinets',
      estimatedCost: 10000,
      duration: 5,
      tradeCategory: 'carpentry' as const,
    }],
  }],
};

/** Sets up db.select().from().where().limit() chain */
const setupDbSelectChain = (returnValue: unknown[]) => {
  const mockLimit = vi.fn().mockResolvedValue(returnValue);
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbSelect.mockReturnValue({ from: mockFrom });
  return { mockFrom, mockWhere, mockLimit };
};

/** Sets up db.update().set().where() chain to resolve successfully */
const setupDbUpdateChain = () => {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  mockDbUpdate.mockReturnValue({ set: mockSet });
  return { mockSet, mockWhere };
};

describe('savePlanStateTool', () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
    mockDbUpdate.mockReset();
  });

  it('should have correct tool name', () => {
    expect(savePlanStateTool.name).toBe('save_plan_state');
  });

  it('should save a valid plan and return success JSON with budget, days, and room count', async () => {
    setupDbSelectChain([{ id: SESSION_ID }]);
    const { mockSet, mockWhere } = setupDbUpdateChain();

    const result = await savePlanStateTool.invoke({
      sessionId: SESSION_ID,
      plan: VALID_PLAN,
    });

    const parsed = JSON.parse(result) as {
      success: boolean;
      message: string;
      sessionId: string;
      totalBudget: number;
      totalDays: number;
      roomCount: number;
    };

    expect(parsed.success).toBe(true);
    expect(parsed.sessionId).toBe(SESSION_ID);
    expect(parsed.totalBudget).toBe(25000);
    expect(parsed.totalDays).toBe(21);
    expect(parsed.roomCount).toBe(1);
    expect(parsed.message).toContain('25,000');
    expect(parsed.message).toContain('21 days');
    expect(parsed.message).toContain('1 rooms');

    // Verify DB update was called
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalled();
    expect(mockWhere).toHaveBeenCalled();
  });

  it('should throw when plan has missing required fields (tool schema validates before handler)', async () => {
    // LangGraph's tool() validates the Zod schema before calling the handler,
    // so an invalid plan never reaches our safeParse — it throws at the framework level.
    const invalidPlan = {
      // missing summary, totalBudget, totalDays, generatedAt, rooms
    };

    await expect(
      savePlanStateTool.invoke({ sessionId: SESSION_ID, plan: invalidPlan as never })
    ).rejects.toThrow();

    // DB should NOT have been called
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('should return failure JSON when session is not found', async () => {
    // DB select returns empty array — session does not exist
    setupDbSelectChain([]);

    const result = await savePlanStateTool.invoke({
      sessionId: SESSION_ID,
      plan: VALID_PLAN,
    });

    const parsed = JSON.parse(result) as { success: boolean; error: string };

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Session not found');

    // DB update should NOT have been called
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('should return failure JSON when DB update throws an error', async () => {
    setupDbSelectChain([{ id: SESSION_ID }]);

    // db.update().set().where() rejects
    const mockWhere = vi.fn().mockRejectedValue(new Error('DB connection lost'));
    const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
    mockDbUpdate.mockReturnValue({ set: mockSet });

    const result = await savePlanStateTool.invoke({
      sessionId: SESSION_ID,
      plan: VALID_PLAN,
    });

    const parsed = JSON.parse(result) as { success: boolean; error: string };

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Failed to save plan state');
  });
});
