import { z } from 'zod';
import { ROOM_TYPES } from './constants.js';

export const searchStylesQuerySchema = z.object({
  q: z.string().min(1, 'Query parameter "q" is required').max(200),
});

export const styleImagesQuerySchema = z.object({
  roomType: z.enum(ROOM_TYPES).optional(),
});
