import { z } from 'zod';

export const searchProductsQuerySchema = z.object({
  style: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  maxPrice: z.coerce.number().positive('maxPrice must be positive').optional(),
  roomType: z.string().max(100).optional(),
  q: z.string().max(200).optional(),
});
