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
  const { style, category, maxPrice, roomType, q } = req.query;

  logger.info('Searching products', {
    style,
    category,
    maxPrice,
    roomType,
    query: q,
  });

  try {
    const results = productService.searchSeedProducts({
      style: style as string | undefined,
      category: category as string | undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      roomType: roomType as string | undefined,
      query: q as string | undefined,
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
  const { roomId } = req.params;
  logger.info('Getting products for room', { roomId });

  try {
    const products = await productService.getProductsByRoom(roomId!);
    res.json({ products, count: products.length });
  } catch (error) {
    logger.error('Failed to get room products', error as Error, { roomId });
    res.status(500).json({ error: 'Failed to retrieve room products' });
  }
};
