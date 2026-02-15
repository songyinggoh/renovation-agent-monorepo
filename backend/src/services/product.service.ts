import { eq, and, lte, sql } from 'drizzle-orm';
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

const logger = new Logger({ serviceName: 'ProductService' });

export interface ProductSearchFilters {
  style?: string;
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
      if (filters.maxPrice) {
        conditions.push(lte(productsCatalog.estimatedPrice, String(filters.maxPrice)));
      }
      if (filters.query) {
        const pattern = `%${filters.query}%`;
        conditions.push(
          sql`(${productsCatalog.name} ILIKE ${pattern} OR ${productsCatalog.description} ILIKE ${pattern})`
        );
      }
      if (filters.style) {
        const styleSlug = filters.style.toLowerCase().replace(/\s+/g, '-');
        conditions.push(
          sql`${productsCatalog.metadata}->'style' @> ${JSON.stringify([styleSlug])}::jsonb`
        );
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

      // Fall back to in-memory search if DB table is empty (not yet seeded)
      if (results.length === 0) {
        const totalCount = await db.select().from(productsCatalog).limit(1);
        if (totalCount.length === 0) {
          logger.warn('products_catalog table is empty, falling back to in-memory search');
          return this.searchSeedProductsAsEntries(filters);
        }
      }

      logger.info('Catalog search results', { filters, count: results.length });
      return results;
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
      id: '', // No DB ID for in-memory results
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
  searchSeedProducts(filters: ProductSearchFilters): SeedProduct[] {
    let results = [...SEED_PRODUCTS];

    if (filters.category) {
      results = results.filter((p) => p.category === filters.category);
    }
    if (filters.style) {
      const styleSlug = filters.style.toLowerCase().replace(/\s+/g, '-');
      results = results.filter((p) =>
        p.metadata.style.some(
          (s) => s === styleSlug || s.includes(filters.style!.toLowerCase())
        )
      );
    }
    if (filters.maxPrice) {
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
