import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { renovationRooms } from '../db/schema/rooms.schema.js';
import { Logger } from '../utils/logger.js';
import { emitToSession } from '../utils/socket-emitter.js';

const logger = new Logger({ serviceName: 'SaveIntakeStateTool' });

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
      // Update session with budget, style, and phase transition
      const updateData = {
        updatedAt: new Date(),
        phase: 'CHECKLIST' as const,
        ...(totalBudget && { totalBudget: String(totalBudget) }),
        ...(currency && { currency }),
        ...(stylePreference && { stylePreferences: { preferredStyle: stylePreference } }),
      };

      await db
        .update(renovationSessions)
        .set(updateData)
        .where(eq(renovationSessions.id, sessionId));

      // Create rooms (batch insert)
      const roomValues = rooms.map((room) => {
        let requirements: Record<string, unknown> | null = null;
        if (room.requirements) {
          requirements = { ...room.requirements, stylePreference };
        } else if (stylePreference) {
          requirements = { stylePreference };
        }

        return {
          sessionId,
          name: room.name,
          type: room.type,
          budget: room.budget ? String(room.budget) : null,
          requirements,
        };
      });

      const createdRooms = await db
        .insert(renovationRooms)
        .values(roomValues)
        .returning();

      const roomSummaries = createdRooms.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        budget: r.budget,
      }));

      const result = {
        success: true,
        message: `Saved ${createdRooms.length} room(s)${totalBudget ? ` with total budget of $${totalBudget}` : ''}${stylePreference ? `, style: ${stylePreference}` : ''}. Transitioning to CHECKLIST phase.`,
        rooms: roomSummaries,
        phase: 'CHECKLIST' as const,
      };

      // Emit Socket.io events for real-time UI updates
      emitToSession(sessionId, 'session:rooms_updated', { sessionId, rooms: roomSummaries });
      emitToSession(sessionId, 'session:phase_changed', { sessionId, phase: 'CHECKLIST' });

      logger.info('Intake state saved, transitioning to CHECKLIST', {
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
