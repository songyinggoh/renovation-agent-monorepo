import { z } from 'zod';

/**
 * Zod schemas for BullMQ job data validation.
 *
 * Workers parse job.data through these schemas at entry.
 * Invalid data throws UnrecoverableError (no retry).
 *
 * Matches JobTypes interface in config/queue.ts.
 */

export const imageOptimizeJobSchema = z.object({
  assetId: z.string().uuid(),
  sessionId: z.string().uuid(),
  width: z.number().int().positive().optional(),
  quality: z.number().int().min(1).max(100).optional(),
});

export const emailSendNotificationJobSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(500),
  template: z.string().min(1).max(100),
  data: z.record(z.unknown()),
});

export const docGeneratePlanJobSchema = z.object({
  sessionId: z.string().uuid(),
  roomId: z.string().uuid(),
  format: z.enum(['pdf', 'html']),
});

export const renderGenerateJobSchema = z.object({
  sessionId: z.string().uuid(),
  roomId: z.string().uuid(),
  prompt: z.string().min(1).max(5000),
  assetId: z.string().uuid(),
});

export const aiProcessMessageJobSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().min(1).max(10000),
  userId: z.string().uuid().optional(),
});

export type ImageOptimizeJobData = z.infer<typeof imageOptimizeJobSchema>;
export type EmailSendNotificationJobData = z.infer<typeof emailSendNotificationJobSchema>;
export type DocGeneratePlanJobData = z.infer<typeof docGeneratePlanJobSchema>;
export type RenderGenerateJobData = z.infer<typeof renderGenerateJobSchema>;
export type AiProcessMessageJobData = z.infer<typeof aiProcessMessageJobSchema>;
