import { Request, Response } from 'express';
import { ProductService } from '../services/product.service.js';
import { Logger } from '../utils/logger.js';
import { asyncHandler } from '../utils/async.js';

const logger = new Logger({ serviceName: 'ProductController' });
const productService = new ProductService();

/**
 * Search product catalog with optional filters (DB-backed with seed fallback)
 * GET /api/products/search?style=&category=&maxPrice=&roomType=&q=
 */
export const searchProducts = asyncHandler(async (req: Request, res: Response) => {
  // Query params are pre-validated and coerced by validateQuery middleware
  const { style, category, maxPrice, roomType, q } = req.query as {
    style?: string;
    category?: string;
    maxPrice?: number;
    roomType?: string;
    q?: string;
  };

  logger.info('Searching products', {
    style,
    category,
    maxPrice,
    roomType,
    query: q,
  });

  const results = await productService.searchCatalogProducts({
    style,
    category,
    maxPrice,
    roomType,
    query: q,
  });

  res.json({
    products: results,
    count: results.length,
  });
});

/**
 * Get product recommendations for a room
 * GET /api/rooms/:roomId/products
 */
export const getRoomProducts = asyncHandler(async (req: Request, res: Response) => {
  const { roomId } = req.params;
  logger.info('Getting products for room', { roomId });

  const products = await productService.getProductsByRoom(roomId);
  res.json({ products, count: products.length });
});
