import { z } from 'zod';

export const searchStylesQuerySchema = z.object({
  q: z.string().min(1, 'Query parameter "q" is required').max(200),
});
