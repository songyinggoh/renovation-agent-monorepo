import { Request, Response } from 'express';
import { StyleService } from '../services/style.service.js';
import { Logger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/async.js';

const logger = new Logger({ serviceName: 'StyleController' });
const styleService = new StyleService();

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
