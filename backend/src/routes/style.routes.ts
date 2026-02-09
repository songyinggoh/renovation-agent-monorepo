import { Router } from 'express';
import {
  listStyles,
  getStyleBySlug,
  searchStyles,
  seedStyles,
} from '../controllers/style.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateQuery } from '../middleware/validate.js';
import { searchStylesQuerySchema } from '../validators/style.validators.js';

const router = Router();

// All style routes require authentication
router.use(authMiddleware);

/**
 * @route GET /api/styles
 * @desc List all design styles
 */
router.get('/', listStyles);

/**
 * @route GET /api/styles/search?q=
 * @desc Search styles by query (must be before :slug to avoid conflict)
 */
router.get('/search', validateQuery(searchStylesQuerySchema), searchStyles);

/**
 * @route POST /api/styles/seed
 * @desc Seed the style catalog (dev only)
 */
if (process.env.NODE_ENV === 'development') {
  router.post('/seed', seedStyles);
}

/**
 * @route GET /api/styles/:slug
 * @desc Get a style by slug
 */
router.get('/:slug', getStyleBySlug);

export default router;
