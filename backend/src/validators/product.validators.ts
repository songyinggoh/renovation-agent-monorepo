import { z } from 'zod';
import { PRODUCT_CATEGORIES, ROOM_TYPES, STYLE_SLUG_REGEX } from './constants.js';

export { PRODUCT_CATEGORIES, ROOM_TYPES, STYLE_SLUG_REGEX } from './constants.js';

export const searchProductsQuerySchema = z.object({
  style: z.string().min(1).max(100).regex(STYLE_SLUG_REGEX, 'Style must be a valid slug (lowercase alphanumeric with hyphens)').optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  maxPrice: z.coerce.number().positive('maxPrice must be positive').optional(),
  roomType: z.enum(ROOM_TYPES).optional(),
  q: z.string().max(200).optional(),
});
