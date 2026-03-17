import { z } from 'zod';

/**
 * Validator for creating a new AI room render
 * POST /api/sessions/:sessionId/rooms/:roomId/renders
 */
export const createRenderSchema = z.object({
  prompt: z.string().min(10, 'Prompt must be at least 10 characters').max(1000, 'Prompt is too long'),
  mode: z.enum(['from_scratch', 'edit_existing']),
  baseImageUrl: z.string().url().optional(),
});

/**
 * Validator for updating a render's metadata (e.g. approval)
 * PATCH /api/sessions/:sessionId/rooms/:roomId/renders/:assetId
 */
export const updateRenderSchema = z.object({
  approvalStatus: z.enum(['approved', 'rejected']).optional(),
  caption: z.string().max(255).optional(),
});

export type CreateRenderInput = z.infer<typeof createRenderSchema>;
export type UpdateRenderInput = z.infer<typeof updateRenderSchema>;
