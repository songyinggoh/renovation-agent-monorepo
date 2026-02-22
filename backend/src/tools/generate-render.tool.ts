import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { RenderService } from '../services/render.service.js';
import { formatAsyncToolResponse } from '../utils/agent-guards.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'GenerateRenderTool' });

const renderService = new RenderService();

export const generateRenderTool = tool(
  async ({ sessionId, roomId, mode, prompt, baseImageUrl }): Promise<string> => {
    logger.info('Tool invoked: generate_render', {
      sessionId,
      roomId,
      mode,
      promptLength: prompt.length,
      hasBaseImage: !!baseImageUrl,
    });

    try {
      const { assetId, jobId } = await renderService.requestRender({
        sessionId,
        roomId,
        mode,
        prompt,
        baseImageUrl,
      });

      logger.info('Render requested successfully', {
        sessionId,
        roomId,
        assetId,
        jobId,
      });

      return formatAsyncToolResponse('generate_render', jobId, 30);
    } catch (error) {
      logger.error('generate_render failed', error as Error, {
        sessionId,
        roomId,
      });
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate render',
      });
    }
  },
  {
    name: 'generate_render',
    description:
      'Generate an AI render of a renovation room. Use mode "edit_existing" with a baseImageUrl to modify an existing room photo, or "from_scratch" to generate a new design. The render generates asynchronously — inform the user it will appear shortly. Write detailed prompts including style, materials, colors, lighting, and furniture.',
    schema: z.object({
      sessionId: z.string().uuid().describe('The current session ID'),
      roomId: z.string().uuid().describe('The room ID to generate a render for'),
      mode: z
        .enum(['edit_existing', 'from_scratch'])
        .describe(
          'Render mode: "edit_existing" modifies an existing room photo (requires baseImageUrl), "from_scratch" generates a new design from prompt only'
        ),
      prompt: z
        .string()
        .min(10)
        .max(1000)
        .describe(
          'Detailed render prompt describing the desired renovation look. Include style, materials, colors, lighting, and furniture.'
        ),
      baseImageUrl: z
        .string()
        .url()
        .optional()
        .describe(
          'URL of the room photo to use as reference when mode is "edit_existing". Ignored for "from_scratch" mode.'
        ),
    }),
  }
);
