import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { RoomService } from '../services/room.service.js';
import { ProductService } from '../services/product.service.js';
import { Logger } from '../utils/logger.js';
import { PRODUCT_CATEGORIES } from '../validators/constants.js';

const logger = new Logger({ serviceName: 'SaveProductRecommendationTool' });

const roomService = new RoomService();
const productService = new ProductService();

export const saveProductRecommendationTool = tool(
  async ({
    sessionId,
    roomId,
    name,
    category,
    estimatedPrice,
    recommendationReason,
    description,
    productUrl,
    imageUrl,
    metadata,
  }): Promise<string> => {
    logger.info('Tool invoked: save_product_recommendation', {
      sessionId,
      roomId,
      name,
      category,
    });

    try {
      // Validate room exists and belongs to session
      const room = await roomService.getRoomById(roomId);
      if (!room) {
        return JSON.stringify({
          success: false,
          error: 'Room not found',
        });
      }
      if (room.sessionId !== sessionId) {
        return JSON.stringify({
          success: false,
          error: 'Room does not belong to this session',
        });
      }

      // Persist the product recommendation
      const product = await productService.addProductToRoom({
        roomId,
        name,
        category,
        description: description ?? null,
        estimatedPrice: estimatedPrice != null ? String(estimatedPrice) : null,
        productUrl: productUrl ?? null,
        imageUrl: imageUrl ?? null,
        recommendationReason: recommendationReason ?? null,
        metadata: metadata ?? null,
      });

      const result = {
        success: true,
        productId: product.id,
        roomName: room.name,
        message: `Saved product "${name}" to ${room.name}`,
      };

      logger.info('Product recommendation saved', {
        sessionId,
        roomId,
        productId: product.id,
        name,
        category,
      });

      return JSON.stringify(result);
    } catch (error) {
      logger.error('save_product_recommendation failed', error as Error, {
        sessionId,
        roomId,
      });
      return JSON.stringify({
        success: false,
        error: 'Failed to save product recommendation',
      });
    }
  },
  {
    name: 'save_product_recommendation',
    description:
      'Save a product recommendation to a specific room. Call this after the user confirms they like a product from search results, to persist it to their room plan for later use in shopping lists and budget tracking.',
    schema: z.object({
      sessionId: z.string().uuid().describe('The current session ID'),
      roomId: z.string().uuid().describe('The room ID to save the product to'),
      name: z.string().describe('Product name'),
      category: z
        .enum(PRODUCT_CATEGORIES)
        .describe(
          'Product category: "flooring", "lighting", "furniture", "fixtures", "paint", "hardware"'
        ),
      estimatedPrice: z
        .number()
        .optional()
        .describe('Estimated price in USD'),
      recommendationReason: z
        .string()
        .describe('Why this product is recommended for the room'),
      description: z.string().optional().describe('Product description'),
      productUrl: z.string().url().optional().describe('Link to the product page'),
      imageUrl: z.string().url().optional().describe('Link to the product image'),
      metadata: z
        .record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]))
        .optional()
        .describe('Additional product metadata (brand, specs, alternatives)'),
    }),
  }
);
