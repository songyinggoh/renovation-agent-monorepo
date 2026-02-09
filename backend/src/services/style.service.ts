import { eq, ilike, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { styleCatalog, type StyleCatalogEntry } from '../db/schema/styles.schema.js';
import { SEED_STYLES } from '../data/index.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'StyleService' });

/**
 * Service for managing the style catalog
 * Handles style lookups, search, and seeding
 */
export class StyleService {
  /**
   * Get all styles in the catalog
   */
  async getAllStyles(): Promise<StyleCatalogEntry[]> {
    logger.info('Fetching all styles');

    try {
      const styles = await db.select().from(styleCatalog);
      logger.info('Styles fetched', { count: styles.length });
      return styles;
    } catch (error) {
      logger.error('Failed to fetch styles', error as Error);
      throw error;
    }
  }

  /**
   * Get a style by its URL-friendly slug
   */
  async getStyleBySlug(slug: string): Promise<StyleCatalogEntry | null> {
    logger.info('Fetching style by slug', { slug });

    try {
      const [style] = await db
        .select()
        .from(styleCatalog)
        .where(eq(styleCatalog.slug, slug));

      return style ?? null;
    } catch (error) {
      logger.error('Failed to fetch style by slug', error as Error, { slug });
      throw error;
    }
  }

  /**
   * Get a style by name (case-insensitive)
   */
  async getStyleByName(name: string): Promise<StyleCatalogEntry | null> {
    logger.info('Fetching style by name', { name });

    try {
      const [style] = await db
        .select()
        .from(styleCatalog)
        .where(ilike(styleCatalog.name, name));

      return style ?? null;
    } catch (error) {
      logger.error('Failed to fetch style by name', error as Error, { name });
      throw error;
    }
  }

  /**
   * Search styles by query (matches name, description, or keywords)
   */
  async searchStyles(query: string): Promise<StyleCatalogEntry[]> {
    logger.info('Searching styles', { query });

    try {
      const pattern = `%${query}%`;
      const styles = await db
        .select()
        .from(styleCatalog)
        .where(
          sql`${styleCatalog.name} ILIKE ${pattern} OR ${styleCatalog.description} ILIKE ${pattern}`
        );

      logger.info('Style search results', { query, count: styles.length });
      return styles;
    } catch (error) {
      logger.error('Failed to search styles', error as Error, { query });
      throw error;
    }
  }

  /**
   * Seed the style catalog with default styles
   * Idempotent: uses onConflictDoNothing on slug
   */
  async seedStyles(): Promise<number> {
    logger.info('Seeding styles', { count: SEED_STYLES.length });

    try {
      const result = await db
        .insert(styleCatalog)
        .values(SEED_STYLES)
        .onConflictDoNothing({ target: styleCatalog.slug });

      const insertedCount = result.rowCount ?? 0;
      logger.info('Styles seeded', { inserted: insertedCount, total: SEED_STYLES.length });
      return insertedCount;
    } catch (error) {
      logger.error('Failed to seed styles', error as Error);
      throw error;
    }
  }
}
