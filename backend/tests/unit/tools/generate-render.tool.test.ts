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

// Mock RenderService — requestRender now takes a single object arg
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
    // Verify new mode parameter is documented in the description
    expect(generateRenderTool.description).toContain('edit_existing');
    expect(generateRenderTool.description).toContain('from_scratch');
  });

  it('should return async tool response on success (from_scratch)', async () => {
    mockRequestRender.mockResolvedValue({
      assetId: 'asset-uuid-1',
      jobId: 'job-123',
    });

    const result = await generateRenderTool.invoke({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      mode: 'from_scratch',
      prompt: 'A modern kitchen with oak flooring and marble countertops',
    });

    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('started');
    expect(parsed.jobId).toBe('job-123');

    // Service now receives a single object with mode, no baseImageUrl
    expect(mockRequestRender).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      mode: 'from_scratch',
      prompt: 'A modern kitchen with oak flooring and marble countertops',
      baseImageUrl: undefined,
    });
  });

  it('should pass baseImageUrl when mode is edit_existing', async () => {
    mockRequestRender.mockResolvedValue({
      assetId: 'asset-uuid-2',
      jobId: 'job-456',
    });

    const baseUrl = 'https://storage.example.com/rooms/kitchen.jpg';

    const result = await generateRenderTool.invoke({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      mode: 'edit_existing',
      prompt: 'Renovate this kitchen with japandi style, light wood cabinets',
      baseImageUrl: baseUrl,
    });

    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('started');
    expect(parsed.jobId).toBe('job-456');

    // Service receives the URL for edit mode
    expect(mockRequestRender).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      mode: 'edit_existing',
      prompt: 'Renovate this kitchen with japandi style, light wood cabinets',
      baseImageUrl: baseUrl,
    });
  });

  it('should return error response when render service fails', async () => {
    mockRequestRender.mockRejectedValue(new Error('Room not found: invalid-id'));

    const result = await generateRenderTool.invoke({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      mode: 'from_scratch',
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
      mode: 'from_scratch',
      prompt: 'Yet another render request',
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Render limit reached');
  });

  it('should return error when edit_existing lacks baseImageUrl', async () => {
    mockRequestRender.mockRejectedValue(
      new Error('baseImageUrl is required when mode is "edit_existing"')
    );

    const result = await generateRenderTool.invoke({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      mode: 'edit_existing',
      prompt: 'Renovate this room in scandinavian style',
      // baseImageUrl intentionally omitted — service should reject
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('baseImageUrl is required');
  });
});
