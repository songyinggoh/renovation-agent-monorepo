import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { RoomService } from '../services/room.service.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'SaveChecklistStateTool' });

const roomService = new RoomService();

const ChecklistItemSchema = z.object({
  id: z.string().describe('Unique item ID'),
  category: z
    .string()
    .describe(
      'Product category: "flooring", "lighting", "furniture", "fixtures", "paint", "hardware"'
    ),
  description: z.string().describe('Description of what is needed'),
  priority: z
    .enum(['must-have', 'nice-to-have', 'optional'])
    .describe('Priority level'),
  estimatedBudget: z
    .number()
    .optional()
    .describe('Estimated budget for this item in USD'),
  completed: z
    .boolean()
    .default(false)
    .describe('Whether this item has been addressed'),
});

export const saveChecklistStateTool = tool(
  async ({ sessionId, roomId, checklist }): Promise<string> => {
    logger.info('Tool invoked: save_checklist_state', {
      sessionId,
      roomId,
      itemCount: checklist.length,
    });

    try {
      // Validate room exists and belongs to session
      const room = await roomService.getRoomById(roomId);
      if (!room) {
        return JSON.stringify({
          success: false,
          error: `Room not found: ${roomId}`,
        });
      }
      if (room.sessionId !== sessionId) {
        return JSON.stringify({
          success: false,
          error: 'Room does not belong to this session',
        });
      }

      // Persist the checklist
      const updated = await roomService.updateRoomChecklist(roomId, checklist);

      const result = {
        success: true,
        message: `Saved checklist with ${checklist.length} items for ${updated.name}`,
        roomId: updated.id,
        roomName: updated.name,
        checklistCount: checklist.length,
        priorities: {
          mustHave: checklist.filter((i) => i.priority === 'must-have').length,
          niceToHave: checklist.filter((i) => i.priority === 'nice-to-have').length,
          optional: checklist.filter((i) => i.priority === 'optional').length,
        },
      };

      logger.info('Checklist state saved', {
        sessionId,
        roomId,
        itemCount: checklist.length,
      });

      return JSON.stringify(result);
    } catch (error) {
      logger.error('save_checklist_state failed', error as Error, {
        sessionId,
        roomId,
      });
      return JSON.stringify({
        success: false,
        error: 'Failed to save checklist',
      });
    }
  },
  {
    name: 'save_checklist_state',
    description:
      'Save the renovation checklist for a specific room. Call this during the CHECKLIST phase to persist the selected product categories and requirements for each room.',
    schema: z.object({
      sessionId: z.string().uuid().describe('The current session ID'),
      roomId: z.string().uuid().describe('The room ID to save checklist for'),
      checklist: z
        .array(ChecklistItemSchema)
        .min(1)
        .describe('List of checklist items for this room'),
    }),
  }
);
