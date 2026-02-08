import { z } from 'zod';

export const createRoomSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  type: z.string().trim().min(1, 'Type is required'),
  budget: z.number().nonnegative('Budget must be non-negative').optional(),
  requirements: z.record(z.unknown()).optional(),
});

export const updateRoomSchema = createRoomSchema.partial();
