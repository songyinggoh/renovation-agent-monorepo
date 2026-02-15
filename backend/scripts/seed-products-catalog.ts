/**
 * Seed the products_catalog table from SEED_PRODUCTS data.
 * Idempotent: uses onConflictDoNothing on product name.
 */

import { db, pool } from '../src/db/index.js';
import { productsCatalog } from '../src/db/schema/products-catalog.schema.js';
import { SEED_PRODUCTS } from '../src/data/index.js';
import { Logger } from '../src/utils/logger.js';

const logger = new Logger({ serviceName: 'SeedProductsCatalog' });

async function main(): Promise<void> {
  try {
    logger.info('Starting products catalog seed', { count: SEED_PRODUCTS.length });

    const values = SEED_PRODUCTS.map((p) => ({
      name: p.name,
      category: p.category,
      description: p.description,
      estimatedPrice: p.estimatedPrice,
      currency: p.currency,
      productUrl: p.productUrl,
      imageUrl: p.imageUrl,
      recommendationReason: p.recommendationReason,
      metadata: p.metadata,
    }));

    const result = await db
      .insert(productsCatalog)
      .values(values)
      .onConflictDoNothing({ target: productsCatalog.name });

    const inserted = result.rowCount ?? 0;
    logger.info('Products catalog seeded', { inserted, total: SEED_PRODUCTS.length });

    if (inserted === 0) {
      logger.info('All products already exist (idempotent seed)');
    }
  } catch (error) {
    logger.error('Seed failed', error as Error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
