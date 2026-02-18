import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks
const { mockRequestRender } = vi.hoisted(() => ({
  mockRequestRender: vi.fn(),
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock RenderService
vi.mock('../../../src/services/render.service.js', () => ({
  RenderService: vi.fn().mockImplementation(() => ({
    requestRender: mockRequestRender,
  })),
}));

// Mock agent-guards
vi.mock('../../../src/utils/agent-guards.js', () => ({
  formatAsyncToolResponse: vi.fn((toolName: string, jobId: string, estimatedSec?: number) =>
    JSON.stringify({
      status: 'started',
      jobId,
      message: `${toolName} job started (ID: ${jobId}).`,
      ...(estimatedSec !== undefined ? { estimatedDurationSec: estimatedSec } : {}),
    })
  ),
}));

import { generateRenderTool } from '../../../src/tools/generate-render.tool.js';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const ROOM_ID = '660e8400-e29b-41d4-a716-446655440001';

describe('generateRenderTool', () => {
  beforeEach(() => {
    mockRequestRender.mockReset();
  });

  it('should have correct name and description', () => {
    expect(generateRenderTool.name).toBe('generate_render');
    expect(generateRenderTool.description).toContain('AI render');
  });

  it('should return async tool response on success', async () => {
    mockRequestRender.mockResolvedValue({
      assetId: 'asset-uuid-1',
      jobId: 'job-123',
    });

    const result = await generateRenderTool.invoke({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      prompt: 'A modern kitchen with oak flooring and marble countertops',
    });

    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('started');
    expect(parsed.jobId).toBe('job-123');

    expect(mockRequestRender).toHaveBeenCalledWith(
      SESSION_ID,
      ROOM_ID,
      'A modern kitchen with oak flooring and marble countertops'
    );
  });

  it('should return error response when render service fails', async () => {
    mockRequestRender.mockRejectedValue(new Error('Room not found: invalid-id'));

    const result = await generateRenderTool.invoke({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      prompt: 'A modern kitchen with oak flooring and marble countertops',
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Room not found');
  });

  it('should return error when rate limit is exceeded', async () => {
    mockRequestRender.mockRejectedValue(
      new Error('Render limit reached (10/hour). Please wait before requesting more renders.')
    );

    const result = await generateRenderTool.invoke({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      prompt: 'Yet another render request',
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Render limit reached');
  });
});
