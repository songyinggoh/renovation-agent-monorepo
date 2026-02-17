import { eq, ilike, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { styleCatalog, type StyleCatalogEntry } from '../db/schema/styles.schema.js';
import { SEED_STYLES } from '../data/index.js';
import { Logger } from '../utils/logger.js';
import { escapeLikePattern } from '../utils/sql.js';

const logger = new Logger({ serviceName: 'StyleService' });

/**
 * Service for managing the style catalog
 * Handles style lookups, search, and seeding
 */
export class StyleService {
  async getAllStyles(): Promise<StyleCatalogEntry[]> {
    logger.info('Fetching all styles');

    const styles = await db.select().from(styleCatalog);
    logger.info('Styles fetched', { count: styles.length });
    return styles;
  }

  async getStyleBySlug(slug: string): Promise<StyleCatalogEntry | null> {
    const [style] = await db
      .select()
      .from(styleCatalog)
      .where(eq(styleCatalog.slug, slug));

    return style ?? null;
  }

  async getStyleByName(name: string): Promise<StyleCatalogEntry | null> {
    const [style] = await db
      .select()
      .from(styleCatalog)
      .where(ilike(styleCatalog.name, name));

    return style ?? null;
  }

  async searchStyles(query: string): Promise<StyleCatalogEntry[]> {
    logger.info('Searching styles', { query });

    const pattern = `%${escapeLikePattern(query)}%`;
    const styles = await db
      .select()
      .from(styleCatalog)
      .where(
        sql`${styleCatalog.name} ILIKE ${pattern} OR ${styleCatalog.description} ILIKE ${pattern}`
      );

    logger.info('Style search results', { query, count: styles.length });
    return styles;
  }

  async seedStyles(): Promise<number> {
    logger.info('Seeding styles', { count: SEED_STYLES.length });

    const result = await db
      .insert(styleCatalog)
      .values(SEED_STYLES)
      .onConflictDoNothing({ target: styleCatalog.slug });

    const insertedCount = result.rowCount ?? 0;
    logger.info('Styles seeded', { inserted: insertedCount, total: SEED_STYLES.length });
    return insertedCount;
  }
}
