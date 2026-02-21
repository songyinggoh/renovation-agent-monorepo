import { Request, Response } from 'express';
import { z } from 'zod';
import { RenderService } from '../services/render.service.js';
import { Logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/async.js';

const logger = new Logger({ serviceName: 'RenderController' });
const renderService = new RenderService();

const requestRenderSchema = z.object({
  prompt: z.string().min(10).max(1000),
  sessionId: z.string().uuid(),
  baseAssetId: z.string().uuid().optional(),
});

const approveRenderSchema = z.object({
  approvalStatus: z.enum(['approved', 'rejected']),
});

/**
 * List all renders for a room.
 * GET /api/rooms/:roomId/renders
 */
export const listRenders = asyncHandler(async (req: Request, res: Response) => {
  const { roomId } = req.params;

  logger.info('Listing renders', { roomId });

  const renders = await renderService.getRenders(roomId);

  res.json({ renders });
});

/**
 * Request a new AI render for a room.
 * POST /api/rooms/:roomId/renders
 */
export const requestRender = asyncHandler(async (req: Request, res: Response) => {
  const { roomId } = req.params;

  const parsed = requestRenderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation Error',
      details: parsed.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
    return;
  }

  const { prompt, sessionId, baseAssetId } = parsed.data;

  logger.info('Requesting render via REST', { roomId, sessionId, promptLength: prompt.length });

  const result = await renderService.requestRender(sessionId, roomId, prompt, baseAssetId);

  res.status(201).json(result);
});

/**
 * Approve or reject a render.
 * PATCH /api/rooms/:roomId/renders/:assetId
 */
export const approveRender = asyncHandler(async (req: Request, res: Response) => {
  const { roomId, assetId } = req.params;

  const parsed = approveRenderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation Error',
      details: parsed.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message,
      })),
    });
    return;
  }

  const { approvalStatus } = parsed.data;

  logger.info('Updating render approval', { roomId, assetId, approvalStatus });

  await renderService.updateApproval(assetId, approvalStatus);

  res.json({ assetId, approvalStatus });
});
