import { type Request, type Response, type NextFunction } from 'express';
import { RenderService } from '../services/render.service.js';
import { createRenderSchema, updateRenderSchema } from '../validators/render.validators.js';

const renderService = new RenderService();

/**
 * Request a new AI render for a room
 * POST /api/sessions/:sessionId/rooms/:roomId/renders
 */
export const requestRender = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId } = req.params;

    const parsed = createRenderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    const { sessionId, mode, prompt, baseImageUrl } = parsed.data;

    const result = await renderService.requestRender({
      sessionId,
      roomId,
      mode,
      prompt,
      baseImageUrl,
    });

    return res.status(201).json({
      assetId: result.assetId,
      jobId: result.jobId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List all renders for a room
 * GET /api/sessions/:sessionId/rooms/:roomId/renders
 */
export const listRenders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { roomId } = req.params;
    const renders = await renderService.getRenders(roomId);

    return res.json({ renders });
  } catch (error) {
    next(error);
  }
};

/**
 * Update render metadata (approval, caption)
 * PATCH /api/sessions/:sessionId/rooms/:roomId/renders/:assetId
 */
export const approveRender = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { assetId } = req.params;

    const parsed = updateRenderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: parsed.error.issues.map((i) => i.message),
      });
    }

    const { approvalStatus } = parsed.data;

    if (approvalStatus) {
      await renderService.updateApproval(assetId, approvalStatus as 'approved' | 'rejected');
    }

    return res.json({
      assetId,
      approvalStatus,
    });
  } catch (error) {
    next(error);
  }
};
