import { Router } from 'express';
import { searchProducts, getRoomProducts } from '../controllers/product.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// All product routes require authentication
router.use(authMiddleware);

/**
 * @route GET /api/products/search?style=&category=&maxPrice=&roomType=&q=
 * @desc Search seed products with optional filters
 */
router.get('/products/search', searchProducts);

/**
 * @route GET /api/rooms/:roomId/products
 * @desc Get product recommendations for a room
 */
router.get('/rooms/:roomId/products', getRoomProducts);

export default router;
