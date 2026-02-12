import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { StyleService } from '../services/style.service.js';
import { StyleImageService } from '../services/style-image.service.js';
import { type StyleCatalogEntry } from '../db/schema/styles.schema.js';
import { type StyleImageWithUrl } from '../services/style-image.service.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'GetStyleExamplesTool' });

const styleService = new StyleService();
const styleImageService = new StyleImageService();

function formatStyleResponse(
  style: StyleCatalogEntry,
  images: StyleImageWithUrl[],
  note?: string
): string {
  return JSON.stringify({
    name: style.name,
    slug: style.slug,
    description: style.description,
    colorPalette: style.colorPalette,
    materials: style.materials,
    keywords: style.keywords,
    moodboardImages: images.map((img) => ({
      url: img.publicUrl,
      caption: img.caption,
      roomType: img.roomType,
      altText: img.altText,
    })),
    ...(note && { note }),
  });
}

export const getStyleExamplesTool = tool(
  async ({ styleName }): Promise<string> => {
    logger.info('Tool invoked: get_style_examples', { styleName });

    try {
      // Try exact name match first
      const byName = await styleService.getStyleByName(styleName);
      if (byName) {
        const images = await styleImageService.getImagesByStyle(byName.id);
        return formatStyleResponse(byName, images);
      }

      // Try slug match
      const slug = styleName.toLowerCase().replace(/\s+/g, '-');
      const bySlug = await styleService.getStyleBySlug(slug);
      if (bySlug) {
        const images = await styleImageService.getImagesByStyle(bySlug.id);
        return formatStyleResponse(bySlug, images);
      }

      // Try fuzzy search
      const results = await styleService.searchStyles(styleName);
      if (results.length > 0) {
        const match = results[0]!;
        const images = await styleImageService.getImagesByStyle(match.id);
        return formatStyleResponse(match, images, `Closest match for "${styleName}"`);
      }

      // No match - return available styles
      const allStyles = await styleService.getAllStyles();
      return JSON.stringify({
        error: `Style "${styleName}" not found`,
        availableStyles: allStyles.map((s) => s.name),
      });
    } catch (error) {
      logger.error('get_style_examples failed', error as Error, { styleName });
      return JSON.stringify({ error: 'Failed to look up style information' });
    }
  },
  {
    name: 'get_style_examples',
    description:
      'Get design style information including color palette, materials, description, and moodboard reference images. Use when the user asks about a specific design style, wants style recommendations, or needs visual inspiration for their renovation.',
    schema: z.object({
      styleName: z
        .string()
        .describe(
          'The name of the design style, e.g., "Modern Minimalist", "Scandinavian", "Industrial", "Japandi", "Mediterranean"'
        ),
    }),
  }
);
