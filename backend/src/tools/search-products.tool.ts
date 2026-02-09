import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ProductService } from '../services/product.service.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'SearchProductsTool' });

const productService = new ProductService();

export const searchProductsTool = tool(
  async ({ query, style, category, maxPrice, roomType }): Promise<string> => {
    logger.info('Tool invoked: search_products', {
      query,
      style,
      category,
      maxPrice,
      roomType,
    });

    try {
      const results = productService.searchSeedProducts({
        query,
        style,
        category,
        maxPrice,
        roomType,
      });

      if (results.length === 0) {
        return JSON.stringify({
          message: 'No products found matching your criteria',
          filters: { query, style, category, maxPrice, roomType },
          suggestion: 'Try broadening your search with fewer filters',
        });
      }

      // Return top 5 results with relevant fields
      const products = results.slice(0, 5).map((p) => ({
        name: p.name,
        category: p.category,
        description: p.description,
        price: `$${p.estimatedPrice}`,
        brand: p.metadata?.brand ?? null,
        material: p.metadata?.material ?? null,
        compatibleStyles: p.metadata?.style ?? null,
      }));

      return JSON.stringify({
        products,
        totalMatches: results.length,
        showing: products.length,
      });
    } catch (error) {
      logger.error('search_products failed', error as Error);
      return JSON.stringify({ error: 'Failed to search products' });
    }
  },
  {
    name: 'search_products',
    description:
      'Search for renovation products by style, category, price range, or room type. Returns matching products with prices and descriptions. Use when the user asks about product options, pricing, or recommendations.',
    schema: z.object({
      query: z
        .string()
        .optional()
        .describe('Free-text search for product name or description'),
      style: z
        .string()
        .optional()
        .describe(
          'Design style filter, e.g., "modern-minimalist", "warm-scandinavian", "industrial-loft", "japandi", "mediterranean"'
        ),
      category: z
        .string()
        .optional()
        .describe(
          'Product category: "flooring", "lighting", "furniture", "fixtures", "paint", "hardware"'
        ),
      maxPrice: z
        .number()
        .optional()
        .describe('Maximum price in USD'),
      roomType: z
        .string()
        .optional()
        .describe(
          'Room type filter: "kitchen", "bathroom", "bedroom", "living", "dining", "office"'
        ),
    }),
  }
);
