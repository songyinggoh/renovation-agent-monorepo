import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

const { mockGetRenders, mockRequestRender, mockUpdateApproval } = vi.hoisted(() => ({
  mockGetRenders: vi.fn(),
  mockRequestRender: vi.fn(),
  mockUpdateApproval: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(), error: vi.fn(), warn: vi.fn(),
  })),
}));

vi.mock('../../../src/services/render.service.js', () => ({
  RenderService: vi.fn().mockImplementation(() => ({
    getRenders: mockGetRenders,
    requestRender: mockRequestRender,
    updateApproval: mockUpdateApproval,
  })),
}));

vi.mock('../../../src/utils/async.js', () => ({
  asyncHandler: (fn: (...args: unknown[]) => unknown) => fn,
}));

import { listRenders, requestRender, approveRender } from '../../../src/controllers/render.controller.js';

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    params: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const ROOM_ID = '00000000-0000-4000-a000-000000000002';
const SESSION_ID = '00000000-0000-4000-a000-000000000001';
const ASSET_ID = '00000000-0000-4000-a000-000000000003';

describe('RenderController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listRenders', () => {
    it('should return renders for a room', async () => {
      const renders = [{ id: ASSET_ID, assetType: 'render', status: 'ready' }];
      mockGetRenders.mockResolvedValue(renders);

      const req = mockReq({ params: { roomId: ROOM_ID } });
      const res = mockRes();

      await listRenders(req, res, vi.fn());

      expect(mockGetRenders).toHaveBeenCalledWith(ROOM_ID);
      expect(res.json).toHaveBeenCalledWith({ renders });
    });
  });

  describe('requestRender', () => {
    it('should create a render and return 201', async () => {
      mockRequestRender.mockResolvedValue({ assetId: ASSET_ID, jobId: 'job-1' });

      const req = mockReq({
        params: { roomId: ROOM_ID },
        body: { prompt: 'Modern kitchen with marble countertops', sessionId: SESSION_ID },
      });
      const res = mockRes();

      await requestRender(req, res, vi.fn());

      expect(mockRequestRender).toHaveBeenCalledWith(SESSION_ID, ROOM_ID, 'Modern kitchen with marble countertops', undefined);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ assetId: ASSET_ID, jobId: 'job-1' });
    });

    it('should return 400 for prompt too short', async () => {
      const req = mockReq({
        params: { roomId: ROOM_ID },
        body: { prompt: 'short', sessionId: SESSION_ID },
      });
      const res = mockRes();

      await requestRender(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Validation Error' }));
    });

    it('should return 400 for missing sessionId', async () => {
      const req = mockReq({
        params: { roomId: ROOM_ID },
        body: { prompt: 'Modern kitchen with marble countertops' },
      });
      const res = mockRes();

      await requestRender(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should pass baseAssetId when provided', async () => {
      mockRequestRender.mockResolvedValue({ assetId: ASSET_ID, jobId: 'job-1' });

      const req = mockReq({
        params: { roomId: ROOM_ID },
        body: {
          prompt: 'Modern kitchen with marble countertops',
          sessionId: SESSION_ID,
          baseAssetId: ASSET_ID,
        },
      });
      const res = mockRes();

      await requestRender(req, res, vi.fn());

      expect(mockRequestRender).toHaveBeenCalledWith(SESSION_ID, ROOM_ID, 'Modern kitchen with marble countertops', ASSET_ID);
    });
  });

  describe('approveRender', () => {
    it('should approve a render', async () => {
      mockUpdateApproval.mockResolvedValue(undefined);

      const req = mockReq({
        params: { roomId: ROOM_ID, assetId: ASSET_ID },
        body: { approvalStatus: 'approved' },
      });
      const res = mockRes();

      await approveRender(req, res, vi.fn());

      expect(mockUpdateApproval).toHaveBeenCalledWith(ASSET_ID, 'approved');
      expect(res.json).toHaveBeenCalledWith({ assetId: ASSET_ID, approvalStatus: 'approved' });
    });

    it('should reject a render', async () => {
      mockUpdateApproval.mockResolvedValue(undefined);

      const req = mockReq({
        params: { roomId: ROOM_ID, assetId: ASSET_ID },
        body: { approvalStatus: 'rejected' },
      });
      const res = mockRes();

      await approveRender(req, res, vi.fn());

      expect(mockUpdateApproval).toHaveBeenCalledWith(ASSET_ID, 'rejected');
    });

    it('should return 400 for invalid approval status', async () => {
      const req = mockReq({
        params: { roomId: ROOM_ID, assetId: ASSET_ID },
        body: { approvalStatus: 'maybe' },
      });
      const res = mockRes();

      await approveRender(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
