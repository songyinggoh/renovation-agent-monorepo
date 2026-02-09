import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { RoomService } from '../services/room.service.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'SaveIntakeStateTool' });

const roomService = new RoomService();

const RoomSchema = z.object({
  name: z.string().describe('Room name, e.g., "Kitchen", "Master Bedroom"'),
  type: z
    .string()
    .describe(
      'Room type: "kitchen", "bathroom", "bedroom", "living", "dining", "office", "basement"'
    ),
  budget: z.number().optional().describe('Budget allocation for this room in USD'),
  requirements: z
    .object({
      stylePreference: z.string().optional().describe('Preferred design style for this room'),
      mustHaves: z.array(z.string()).optional().describe('Must-have features'),
      dimensions: z.string().optional().describe('Room dimensions if provided'),
    })
    .optional()
    .describe('Room-specific requirements'),
});

export const saveIntakeStateTool = tool(
  async ({
    sessionId,
    rooms,
    totalBudget,
    currency,
    stylePreference,
  }): Promise<string> => {
    logger.info('Tool invoked: save_intake_state', {
      sessionId,
      roomCount: rooms.length,
      totalBudget,
      stylePreference,
    });

    try {
      // Update session with budget and style
      if (totalBudget || stylePreference) {
        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (totalBudget) {
          updateData['totalBudget'] = String(totalBudget);
        }
        if (currency) {
          updateData['currency'] = currency;
        }

        await db
          .update(renovationSessions)
          .set(updateData)
          .where(eq(renovationSessions.id, sessionId));
      }

      // Create rooms
      const createdRooms = [];
      for (const room of rooms) {
        const requirements = room.requirements
          ? { ...room.requirements, stylePreference }
          : stylePreference
            ? { stylePreference }
            : null;

        const created = await roomService.createRoom({
          sessionId,
          name: room.name,
          type: room.type,
          budget: room.budget ? String(room.budget) : null,
          requirements,
        });
        createdRooms.push(created);
      }

      const result = {
        success: true,
        message: `Saved ${createdRooms.length} room(s)${totalBudget ? ` with total budget of $${totalBudget}` : ''}${stylePreference ? `, style: ${stylePreference}` : ''}`,
        rooms: createdRooms.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          budget: r.budget,
        })),
      };

      logger.info('Intake state saved', {
        sessionId,
        roomCount: createdRooms.length,
      });

      return JSON.stringify(result);
    } catch (error) {
      logger.error('save_intake_state failed', error as Error, { sessionId });
      return JSON.stringify({
        success: false,
        error: 'Failed to save intake state',
      });
    }
  },
  {
    name: 'save_intake_state',
    description:
      "Save the renovation intake information including rooms, budget, and style preferences. Call this once you have gathered enough information about the user's renovation project during the INTAKE phase.",
    schema: z.object({
      sessionId: z.string().uuid().describe('The current session ID'),
      rooms: z
        .array(RoomSchema)
        .min(1)
        .describe('List of rooms to renovate'),
      totalBudget: z
        .number()
        .optional()
        .describe('Total renovation budget in USD'),
      currency: z.string().optional().describe('Currency code, default USD'),
      stylePreference: z
        .string()
        .optional()
        .describe('Overall design style preference'),
    }),
  }
);
