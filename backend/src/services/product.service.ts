import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  productRecommendations,
  type ProductRecommendation,
  type NewProductRecommendation,
} from '../db/schema/products.schema.js';
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
 * Handles seed product search (in-memory) and DB-backed room product CRUD
 */
export class ProductService {
  searchSeedProducts(filters: ProductSearchFilters): SeedProduct[] {
    logger.info('Searching seed products', { filters });

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

    logger.info('Seed product search results', {
      filters,
      count: results.length,
    });

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
