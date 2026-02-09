import { z } from 'zod';

/**
 * Query param validator for product search
 * GET /api/products/search?style=&category=&maxPrice=&roomType=&q=
 */
export const productSearchQuerySchema = z.object({
  style: z.string().optional(),
  category: z.string().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  roomType: z.string().optional(),
  q: z.string().optional(),
});

/**
 * Query param validator for style search
 * GET /api/styles/search?q=
 */
export const styleSearchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
});
