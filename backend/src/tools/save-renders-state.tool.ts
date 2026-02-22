import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { RenderService } from '../services/render.service.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'SaveRendersStateTool' });

const renderService = new RenderService();

/**
 * Schema for a single render selection: which render the agent chose
 * for a room and whether it's the initial design or a later iteration.
 */
const RenderSelectionSchema = z.object({
  roomId: z.string().uuid().describe('The room this render belongs to'),
  assetId: z
    .string()
    .uuid()
    .describe('The render asset ID (from a completed generate_render call)'),
  renderType: z
    .enum(['initial', 'iteration'])
    .describe(
      '"initial" for the first accepted render of a room, "iteration" for revised versions'
    ),
});

export const saveRendersStateTool = tool(
  async ({ sessionId, selections }): Promise<string> => {
    logger.info('Tool invoked: save_renders_state', {
      sessionId,
      selectionCount: selections.length,
    });

    try {
      const result = await renderService.saveRendersState(sessionId, selections);

      logger.info('Renders state saved', {
        sessionId,
        savedCount: result.saved.length,
        errorCount: result.errors.length,
      });

      return JSON.stringify({
        success: result.errors.length === 0,
        saved: result.saved,
        errors: result.errors,
        message:
          result.errors.length === 0
            ? `Saved ${result.saved.length} render selection(s) successfully`
            : `Saved ${result.saved.length}, failed ${result.errors.length}`,
      });
    } catch (error) {
      logger.error('save_renders_state failed', error as Error, { sessionId });
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save renders state',
      });
    }
  },
  {
    name: 'save_renders_state',
    description:
      'Save the selected renders for rooms in a session. Call this after the user approves render(s) to persist which render is the chosen design for each room and whether it is the initial version or an iteration. This data is used for PDF report generation and the before/after comparison UI.',
    schema: z.object({
      sessionId: z.string().uuid().describe('The current session ID'),
      selections: z
        .array(RenderSelectionSchema)
        .min(1)
        .max(50)
        .describe('Array of render selections — one per room-render pair'),
    }),
  }
);
