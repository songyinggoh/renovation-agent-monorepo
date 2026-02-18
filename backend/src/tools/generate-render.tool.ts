import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { RenderService } from '../services/render.service.js';
import { formatAsyncToolResponse } from '../utils/agent-guards.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'GenerateRenderTool' });

const renderService = new RenderService();

export const generateRenderTool = tool(
  async ({ sessionId, roomId, prompt }): Promise<string> => {
    logger.info('Tool invoked: generate_render', {
      sessionId,
      roomId,
      promptLength: prompt.length,
    });

    try {
      const { assetId, jobId } = await renderService.requestRender(
        sessionId,
        roomId,
        prompt
      );

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
      'Generate an AI render of a renovation room. Provide the session ID, room ID, and a detailed prompt describing the desired renovation look. The render generates asynchronously — inform the user it will appear shortly. Write detailed prompts including style, materials, colors, lighting, and furniture.',
    schema: z.object({
      sessionId: z.string().uuid().describe('The current session ID'),
      roomId: z.string().uuid().describe('The room ID to generate a render for'),
      prompt: z
        .string()
        .min(10)
        .max(1000)
        .describe(
          'Detailed render prompt describing the desired renovation look. Include style, materials, colors, lighting, and furniture.'
        ),
    }),
  }
);
