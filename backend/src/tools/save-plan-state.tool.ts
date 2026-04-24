import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { renovationSessions } from '../db/schema/sessions.schema.js';
import { RenovationPlanSchema } from '../db/jsonb-schemas.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'SavePlanStateTool' });

export const savePlanStateTool = tool(
  async ({ sessionId, plan }): Promise<string> => {
    logger.info('Tool invoked: save_plan_state', {
      sessionId,
      totalBudget: plan.totalBudget,
      roomCount: plan.rooms.length,
    });

    try {
      // Validate plan data with RenovationPlanSchema
      const validated = RenovationPlanSchema.safeParse(plan);
      if (!validated.success) {
        const issues = validated.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ');
        logger.warn('Invalid plan data', undefined, { sessionId, issues });
        return JSON.stringify({
          success: false,
          error: `Invalid plan data: ${issues}`,
        });
      }

      // Verify session exists
      const [session] = await db
        .select({ id: renovationSessions.id })
        .from(renovationSessions)
        .where(eq(renovationSessions.id, sessionId))
        .limit(1);

      if (!session) {
        return JSON.stringify({
          success: false,
          error: 'Session not found',
        });
      }

      // Persist planData to the JSONB column
      await db
        .update(renovationSessions)
        .set({
          planData: validated.data,
          updatedAt: new Date(),
        })
        .where(eq(renovationSessions.id, sessionId));

      const result = {
        success: true,
        message: `Renovation plan saved successfully. Total: $${validated.data.totalBudget.toLocaleString()}, ${validated.data.totalDays} days, ${validated.data.rooms.length} rooms.`,
        sessionId,
        totalBudget: validated.data.totalBudget,
        totalDays: validated.data.totalDays,
        roomCount: validated.data.rooms.length,
      };

      logger.info('Plan state saved', {
        sessionId,
        totalBudget: validated.data.totalBudget,
        totalDays: validated.data.totalDays,
        roomCount: validated.data.rooms.length,
      });

      return JSON.stringify(result);
    } catch (error) {
      logger.error('save_plan_state failed', error as Error, { sessionId });
      return JSON.stringify({
        success: false,
        error: 'Failed to save plan state',
      });
    }
  },
  {
    name: 'save_plan_state',
    description:
      'Save the complete structured renovation plan to the database. Call this once the plan is fully elaborated with rooms, tasks, budget, and timeline. This data is required before generating a plan PDF document.',
    schema: z.object({
      sessionId: z.string().uuid().describe('The current session ID'),
      plan: RenovationPlanSchema.describe('The complete renovation plan object'),
    }),
  }
);
