import { Router } from 'express';
import {
  listStyles,
  getStyleBySlug,
  searchStyles,
  seedStyles,
  getStyleImages,
  seedStyleImages,
} from '../controllers/style.controller.js';
import { optionalAuthMiddleware } from '../middleware/auth.middleware.js';
import { validateQuery } from '../middleware/validate.js';
import { searchStylesQuerySchema, styleImagesQuerySchema } from '../validators/style.validators.js';

const router = Router();

// All style routes support optional authentication (Phases 1-7)
router.use(optionalAuthMiddleware);

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

// Only register seed routes in development
if (process.env.NODE_ENV === 'development') {
  /**
   * @route POST /api/styles/seed
   * @desc Seed the style catalog (dev only)
   */
  router.post('/seed', seedStyles);

  /**
   * @route POST /api/styles/seed-images
   * @desc Seed style moodboard images (dev only)
   */
  router.post('/seed-images', seedStyleImages);
}

/**
 * @route GET /api/styles/:slug/images
 * @desc Get moodboard images for a style
 */
router.get('/:slug/images', validateQuery(styleImagesQuerySchema), getStyleImages);

/**
 * @route GET /api/styles/:slug
 * @desc Get a style by slug
 */
router.get('/:slug', getStyleBySlug);

export default router;
