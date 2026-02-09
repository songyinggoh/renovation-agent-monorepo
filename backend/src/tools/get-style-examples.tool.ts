import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { StyleService } from '../services/style.service.js';
import { type StyleCatalogEntry } from '../db/schema/styles.schema.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'GetStyleExamplesTool' });

const styleService = new StyleService();

function formatStyleResponse(
  style: StyleCatalogEntry,
  note?: string
): string {
  return JSON.stringify({
    name: style.name,
    slug: style.slug,
    description: style.description,
    colorPalette: style.colorPalette,
    materials: style.materials,
    keywords: style.keywords,
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
        return formatStyleResponse(byName);
      }

      // Try slug match
      const slug = styleName.toLowerCase().replace(/\s+/g, '-');
      const bySlug = await styleService.getStyleBySlug(slug);
      if (bySlug) {
        return formatStyleResponse(bySlug);
      }

      // Try fuzzy search
      const results = await styleService.searchStyles(styleName);
      if (results.length > 0) {
        return formatStyleResponse(results[0]!, `Closest match for "${styleName}"`);
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
      'Get design style information including color palette, materials, and description. Use when the user asks about a specific design style or wants style recommendations.',
    schema: z.object({
      styleName: z
        .string()
        .describe(
          'The name of the design style, e.g., "Modern Minimalist", "Scandinavian", "Industrial", "Japandi", "Mediterranean"'
        ),
    }),
  }
);
