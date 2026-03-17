import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { RenderService } from '../services/render.service.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'RenderController' });
const renderService = new RenderService();

const requestRenderSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID'),
  prompt: z.string().min(10, 'Prompt must be at least 10 characters').max(1000, 'Prompt is too long'),
  mode: z.enum(['from_scratch', 'edit_existing']),
  baseImageUrl: z.string().url().optional(),
});

const approveRenderSchema = z.object({
  approvalStatus: z.enum(['approved', 'rejected']),
});

/**
 * List all renders for a room
 * GET /api/sessions/:sessionId/rooms/:roomId/renders
 */
export async function listRenders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { roomId } = req.params;
    const renders = await renderService.getRenders(roomId);
    res.json({ renders });
  } catch (error) {
    next(error);
  }
}

/**
 * Request a new AI render for a room
 * POST /api/sessions/:sessionId/rooms/:roomId/renders
 */
export async function requestRender(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { roomId } = req.params;

    const parsed = requestRenderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: parsed.error.issues.map((i) => i.message).join(', '),
      });
      return;
    }

    const { sessionId, prompt, mode, baseImageUrl } = parsed.data;
    const result = await renderService.requestRender({ sessionId, roomId, mode, prompt, baseImageUrl });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Approve or reject a render
 * PATCH /api/sessions/:sessionId/rooms/:roomId/renders/:assetId
 */
export async function approveRender(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assetId } = req.params;

    const parsed = approveRenderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: parsed.error.issues.map((i) => i.message).join(', '),
      });
      return;
    }

    await renderService.updateApproval(assetId, parsed.data.approvalStatus);

    res.json({ assetId, approvalStatus: parsed.data.approvalStatus });
  } catch (error) {
    next(error);
  }
}

logger.info('RenderController loaded');
