import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mocks
const { mockQueueAdd, mockGetDocQueue } = vi.hoisted(() => {
  const mockQueueAdd = vi.fn();
  const mockGetDocQueue = vi.fn(() => ({ add: mockQueueAdd }));
  return { mockQueueAdd, mockGetDocQueue };
});

// Mock logger to suppress logs during tests
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock the doc queue
vi.mock('../../../src/config/queue.js', () => ({
  getDocQueue: mockGetDocQueue,
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

import { generateDocumentTool } from '../../../src/tools/generate-document.tool.js';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const ROOM_ID = '660e8400-e29b-41d4-a716-446655440001';

describe('generateDocumentTool', () => {
  beforeEach(() => {
    mockQueueAdd.mockReset();
    mockQueueAdd.mockResolvedValue({ id: 'job-123' });
  });

  it('should have correct name and description mentioning checklist_pdf and plan_pdf', () => {
    expect(generateDocumentTool.name).toBe('generate_document');
    expect(generateDocumentTool.description).toContain('checklist_pdf');
    expect(generateDocumentTool.description).toContain('plan_pdf');
  });

  it('should enqueue a doc:generate-plan job with sessionId and documentType for checklist_pdf', async () => {
    await generateDocumentTool.invoke({
      sessionId: SESSION_ID,
      documentType: 'checklist_pdf',
    });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'doc:generate-plan',
      expect.objectContaining({
        sessionId: SESSION_ID,
        documentType: 'checklist_pdf',
      })
    );
  });

  it('should include roomId in job data when provided with plan_pdf', async () => {
    await generateDocumentTool.invoke({
      sessionId: SESSION_ID,
      documentType: 'plan_pdf',
      roomId: ROOM_ID,
    });

    expect(mockQueueAdd).toHaveBeenCalledWith(
      'doc:generate-plan',
      expect.objectContaining({
        sessionId: SESSION_ID,
        documentType: 'plan_pdf',
        roomId: ROOM_ID,
      })
    );
  });

  it('should NOT include roomId in job data when not provided for checklist_pdf', async () => {
    await generateDocumentTool.invoke({
      sessionId: SESSION_ID,
      documentType: 'checklist_pdf',
      // roomId intentionally omitted
    });

    const jobData = mockQueueAdd.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(jobData).not.toHaveProperty('roomId');
  });

  it('should return formatAsyncToolResponse result with status started', async () => {
    const result = await generateDocumentTool.invoke({
      sessionId: SESSION_ID,
      documentType: 'checklist_pdf',
    });

    const parsed = JSON.parse(result) as {
      status: string;
      jobId: string;
      message: string;
      estimatedDurationSec: number;
    };

    expect(parsed.status).toBe('started');
    expect(parsed.jobId).toBe('job-123');
    expect(parsed.estimatedDurationSec).toBe(30);
  });

  it('should return failure JSON with error message when queue.add throws', async () => {
    mockQueueAdd.mockRejectedValue(new Error('Queue connection refused'));

    const result = await generateDocumentTool.invoke({
      sessionId: SESSION_ID,
      documentType: 'plan_pdf',
    });

    const parsed = JSON.parse(result) as { success: boolean; error: string };

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Queue connection refused');
  });
});
