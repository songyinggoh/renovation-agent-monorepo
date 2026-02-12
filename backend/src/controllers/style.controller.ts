import { Request, Response } from 'express';
import { StyleService } from '../services/style.service.js';
import { StyleImageService } from '../services/style-image.service.js';
import { SEED_STYLE_IMAGES } from '../data/index.js';
import { Logger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/async.js';

const logger = new Logger({ serviceName: 'StyleController' });
const styleService = new StyleService();
const styleImageService = new StyleImageService();

/**
 * List all design styles
 * GET /api/styles
 */
export const listStyles = asyncHandler(async (_req: Request, res: Response) => {
  logger.info('Listing all styles');

  const styles = await styleService.getAllStyles();
  res.json({ styles });
});

/**
 * Get a style by slug
 * GET /api/styles/:slug
 */
export const getStyleBySlug = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;
  logger.info('Getting style by slug', { slug });

  const style = await styleService.getStyleBySlug(slug);
  if (!style) {
    throw new NotFoundError('Style not found');
  }
  res.json(style);
});

/**
 * Search styles by query
 * GET /api/styles/search?q=
 */
export const searchStyles = asyncHandler(async (req: Request, res: Response) => {
  // Query params are pre-validated by validateQuery middleware
  const { q: query } = req.query as { q: string };
  logger.info('Searching styles', { query });

  const styles = await styleService.searchStyles(query);
  res.json({ styles, count: styles.length });
});

/**
 * Seed the style catalog (development only)
 * POST /api/styles/seed
 */
export const seedStyles = asyncHandler(async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.warn('Seed endpoint called in non-development environment');
    throw new NotFoundError('Not found');
  }

  logger.info('Seeding style catalog');

  const count = await styleService.seedStyles();
  res.json({ message: `Seeded ${count} styles`, count });
});

/**
 * Get images for a style by slug
 * GET /api/styles/:slug/images
 */
export const getStyleImages = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;
  const { roomType } = req.query as { roomType?: string };
  logger.info('Getting style images', { slug, roomType });

  const style = await styleService.getStyleBySlug(slug);
  if (!style) {
    throw new NotFoundError('Style not found');
  }

  const images = roomType
    ? await styleImageService.getImagesByStyleAndRoom(style.id, roomType)
    : await styleImageService.getImagesByStyle(style.id);

  res.json({ images, count: images.length });
});

/**
 * Seed style images (development only)
 * POST /api/styles/seed-images
 */
export const seedStyleImages = asyncHandler(async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.warn('Seed images endpoint called in non-development environment');
    throw new NotFoundError('Not found');
  }

  logger.info('Seeding style images');

  const count = await styleImageService.seedFromManifest(SEED_STYLE_IMAGES);
  res.json({ message: `Seeded ${count} style images`, count });
});
