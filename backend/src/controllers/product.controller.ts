import { Request, Response } from 'express';
import { ProductService } from '../services/product.service.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'ProductController' });
const productService = new ProductService();

/**
 * Search seed products with optional filters
 * GET /api/products/search?style=&category=&maxPrice=&roomType=&q=
 */
export const searchProducts = (req: Request, res: Response) => {
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

  try {
    const results = productService.searchSeedProducts({
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
  } catch (error) {
    logger.error('Failed to search products', error as Error);
    res.status(500).json({ error: 'Failed to search products' });
  }
};

/**
 * Get product recommendations for a room
 * GET /api/rooms/:roomId/products
 */
export const getRoomProducts = async (req: Request, res: Response) => {
  const roomId = req.params.roomId;
  if (!roomId) {
    res.status(400).json({ error: 'roomId is required' });
    return;
  }
  logger.info('Getting products for room', { roomId });

  try {
    const products = await productService.getProductsByRoom(roomId);
    res.json({ products, count: products.length });
  } catch (error) {
    logger.error('Failed to get room products', error as Error, { roomId });
    res.status(500).json({ error: 'Failed to retrieve room products' });
  }
};
