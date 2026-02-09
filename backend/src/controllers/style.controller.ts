import { Request, Response } from 'express';
import { StyleService } from '../services/style.service.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'StyleController' });
const styleService = new StyleService();

/**
 * List all design styles
 * GET /api/styles
 */
export const listStyles = async (_req: Request, res: Response) => {
  logger.info('Listing all styles');

  try {
    const styles = await styleService.getAllStyles();
    res.json({ styles });
  } catch (error) {
    logger.error('Failed to list styles', error as Error);
    res.status(500).json({ error: 'Failed to retrieve styles' });
  }
};

/**
 * Get a style by slug
 * GET /api/styles/:slug
 */
export const getStyleBySlug = async (req: Request, res: Response) => {
  const { slug } = req.params;
  logger.info('Getting style by slug', { slug });

  try {
    if (!slug) {
      res.status(400).json({ error: 'slug is required' });
      return;
    }
    const style = await styleService.getStyleBySlug(slug);
    if (!style) {
      return res.status(404).json({ error: 'Style not found' });
    }
    res.json(style);
  } catch (error) {
    logger.error('Failed to get style', error as Error, { slug });
    res.status(500).json({ error: 'Failed to retrieve style' });
  }
};

/**
 * Search styles by query
 * GET /api/styles/search?q=
 */
export const searchStyles = async (req: Request, res: Response) => {
  // Validate query parameter is string not array
  const q = req.query.q;
  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Query parameter q must be a non-empty string' });
  }
  const query = q;
  logger.info('Searching styles', { query });

  try {
    const styles = await styleService.searchStyles(query);
    res.json({ styles, count: styles.length });
  } catch (error) {
    logger.error('Failed to search styles', error as Error, { query });
    res.status(500).json({ error: 'Failed to search styles' });
  }
};

/**
 * Seed the style catalog (development only)
 * POST /api/styles/seed
 */
export const seedStyles = async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV !== 'development') {
    logger.warn('Seed endpoint called in non-development environment');
    res.status(404).json({ error: 'Not found' });
    return;
  }

  logger.info('Seeding style catalog');

  try {
    const count = await styleService.seedStyles();
    res.json({ message: `Seeded ${count} styles`, count });
  } catch (error) {
    logger.error('Failed to seed styles', error as Error);
    res.status(500).json({ error: 'Failed to seed styles' });
  }
};
