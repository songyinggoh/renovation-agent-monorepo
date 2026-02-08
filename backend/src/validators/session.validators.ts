import { z } from 'zod';

export const createSessionSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  totalBudget: z.number().nonnegative('Budget must be non-negative').optional(),
});
