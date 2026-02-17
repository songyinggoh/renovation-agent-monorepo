import { randomUUID } from 'crypto';
import { eq, and, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  productRecommendations,
  type ProductRecommendation,
  type NewProductRecommendation,
} from '../db/schema/products.schema.js';
import {
  productsCatalog,
  type ProductCatalogEntry,
} from '../db/schema/products-catalog.schema.js';
import { SEED_PRODUCTS, type SeedProduct } from '../data/index.js';
import { Logger } from '../utils/logger.js';
import { escapeLikePattern } from '../utils/sql.js';

const logger = new Logger({ serviceName: 'ProductService' });

export interface ProductSearchFilters {
  style?: string | string[];
  category?: string;
  maxPrice?: number;
  roomType?: string;
  query?: string;
}

/**
 * Service for managing product recommendations
 * Handles DB-backed catalog search and per-room product CRUD
 */
export class ProductService {
  private static catalogIsSeeded: boolean | null = null;

  /**
   * Search the products_catalog table with filtering.
   * Falls back to in-memory seed data if the DB table is empty.
   */
  async searchCatalogProducts(filters: ProductSearchFilters): Promise<ProductCatalogEntry[]> {
    logger.info('Searching products catalog', { filters });

    try {
      const conditions = [];

      if (filters.category) {
        conditions.push(eq(productsCatalog.category, filters.category));
      }
      if (filters.maxPrice != null) {
        conditions.push(
          sql`CAST(${productsCatalog.estimatedPrice} AS numeric) <= ${filters.maxPrice}`
        );
      }
      if (filters.query) {
        const pattern = `%${escapeLikePattern(filters.query)}%`;
        conditions.push(
          sql`(${productsCatalog.name} ILIKE ${pattern} OR ${productsCatalog.description} ILIKE ${pattern})`
        );
      }
      if (filters.style) {
        const styles = (Array.isArray(filters.style) ? filters.style : [filters.style]).filter(Boolean);
        if (styles.length > 0) {
          const styleConditions = styles.map((s) => {
            const styleSlug = s.toLowerCase().replace(/\s+/g, '-');
            return sql`${productsCatalog.metadata}->'style' @> ${JSON.stringify([styleSlug])}::jsonb`;
          });
          if (styleConditions.length === 1) {
            conditions.push(styleConditions[0]!);
          } else {
            const combined = or(...styleConditions);
            if (combined) conditions.push(combined);
          }
        }
      }
      if (filters.roomType) {
        const room = filters.roomType.toLowerCase();
        conditions.push(
          sql`${productsCatalog.metadata}->'roomTypes' @> ${JSON.stringify([room])}::jsonb`
        );
      }

      const results = await db
        .select()
        .from(productsCatalog)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .limit(50);

      if (results.length > 0) {
        ProductService.catalogIsSeeded = true;
        logger.info('Catalog search results', { filters, count: results.length });
        return results;
      }

      // Only probe the table when we haven't confirmed it has data yet
      if (ProductService.catalogIsSeeded === null) {
        const [probe] = await db.select({ id: productsCatalog.id }).from(productsCatalog).limit(1);
        ProductService.catalogIsSeeded = !!probe;
      }

      if (!ProductService.catalogIsSeeded) {
        logger.warn('products_catalog table is empty, falling back to in-memory search');
        return this.searchSeedProductsAsEntries(filters);
      }

      logger.info('Catalog search results', { filters, count: 0 });
      return [];
    } catch (error) {
      // Table might not exist yet — fall back to in-memory
      logger.warn('Catalog query failed, falling back to in-memory search', error as Error);
      return this.searchSeedProductsAsEntries(filters);
    }
  }

  /**
   * In-memory seed product search (legacy fallback).
   * Returns results shaped as ProductCatalogEntry for compatibility.
   */
  private searchSeedProductsAsEntries(filters: ProductSearchFilters): ProductCatalogEntry[] {
    const seedResults = this.searchSeedProducts(filters);
    return seedResults.map((p) => ({
      id: randomUUID(),
      name: p.name,
      category: p.category,
      description: p.description,
      estimatedPrice: p.estimatedPrice,
      currency: p.currency,
      productUrl: p.productUrl,
      imageUrl: p.imageUrl,
      recommendationReason: p.recommendationReason,
      metadata: p.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  }

  /**
   * In-memory seed product search (kept for backward compatibility)
   */
  private searchSeedProducts(filters: ProductSearchFilters): SeedProduct[] {
    let results = [...SEED_PRODUCTS];

    if (filters.category) {
      results = results.filter((p) => p.category === filters.category);
    }
    if (filters.style) {
      const styles = Array.isArray(filters.style) ? filters.style : [filters.style];
      const styleSlugs = styles.map((s) => s.toLowerCase().replace(/\s+/g, '-'));
      results = results.filter((p) =>
        p.metadata.style.some((s) => styleSlugs.includes(s))
      );
    }
    if (filters.maxPrice != null) {
      results = results.filter(
        (p) => Number(p.estimatedPrice) <= filters.maxPrice!
      );
    }
    if (filters.roomType) {
      const room = filters.roomType.toLowerCase();
      results = results.filter((p) => p.metadata.roomTypes.includes(room));
    }
    if (filters.query) {
      const q = filters.query.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }

    return results;
  }

  async getProductsByRoom(roomId: string): Promise<ProductRecommendation[]> {
    logger.info('Fetching products for room', { roomId });

    const products = await db
      .select()
      .from(productRecommendations)
      .where(eq(productRecommendations.roomId, roomId));

    logger.info('Products fetched', { roomId, count: products.length });
    return products;
  }

  async addProductToRoom(
    product: NewProductRecommendation
  ): Promise<ProductRecommendation> {
    logger.info('Adding product to room', {
      roomId: product.roomId,
      name: product.name,
    });

    const [created] = await db
      .insert(productRecommendations)
      .values(product)
      .returning();

    if (!created) {
      throw new Error('Failed to add product: No record returned');
    }

    logger.info('Product added', {
      productId: created.id,
      roomId: created.roomId,
    });
    return created;
  }
}
