import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getDocQueue } from '../config/queue.js';
import { formatAsyncToolResponse } from '../utils/agent-guards.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'GenerateDocumentTool' });

export const generateDocumentTool = tool(
  async ({ sessionId, documentType, roomId }): Promise<string> => {
    logger.info('Tool invoked: generate_document', {
      sessionId,
      documentType,
      roomId,
    });

    try {
      const queue = getDocQueue();
      const job = await queue.add('doc:generate-plan', {
        sessionId,
        documentType,
        ...(roomId ? { roomId } : {}),
      });

      logger.info('Document generation job enqueued', {
        jobId: job.id,
        sessionId,
        documentType,
        roomId,
      });

      return formatAsyncToolResponse('generate_document', job.id ?? sessionId, 30);
    } catch (error) {
      logger.error('generate_document failed', error as Error, {
        sessionId,
        documentType,
      });
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate document',
      });
    }
  },
  {
    name: 'generate_document',
    description:
      'Generate a PDF document for the renovation session. Use documentType "checklist_pdf" to generate a checklist PDF (optionally scoped to a room with roomId), or "plan_pdf" to generate the full renovation plan PDF (requires save_plan_state to have been called first). The document generates asynchronously — inform the user it will appear shortly.',
    schema: z.object({
      sessionId: z.string().uuid().describe('The current session ID'),
      documentType: z
        .enum(['checklist_pdf', 'plan_pdf'])
        .describe(
          'Type of document to generate: "checklist_pdf" for room checklists, "plan_pdf" for the full renovation plan'
        ),
      roomId: z
        .string()
        .uuid()
        .optional()
        .describe(
          'Optional room ID to scope a checklist PDF to a single room. Ignored for plan_pdf.'
        ),
    }),
  }
);
