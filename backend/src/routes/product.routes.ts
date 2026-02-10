import { Router } from 'express';
import { searchProducts, getRoomProducts } from '../controllers/product.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateQuery } from '../middleware/validate.js';
import { verifyRoomOwnership } from '../middleware/ownership.middleware.js';
import { searchProductsQuerySchema } from '../validators/product.validators.js';

const router = Router();

// All product routes require authentication
router.use(authMiddleware);

/**
 * @route GET /api/products/search?style=&category=&maxPrice=&roomType=&q=
 * @desc Search seed products with optional filters
 */
router.get('/products/search', validateQuery(searchProductsQuerySchema), searchProducts);

/**
 * @route GET /api/rooms/:roomId/products
 * @desc Get product recommendations for a room
 */
router.get('/rooms/:roomId/products', verifyRoomOwnership, getRoomProducts);

export default router;
