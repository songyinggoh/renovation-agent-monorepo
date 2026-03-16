#!/usr/bin/env tsx
/**
 * Dev Agent CLI — single-shot task execution via the supervisor.
 *
 * Usage:
 *   npm run dev:agent "scaffold a new tool for document generation"
 *   npm run dev:agent "review backend/src/services/chat.service.ts"
 *   npm run dev:agent "run and fix failing tests in backend"
 */

import { randomUUID } from 'node:crypto';
import { HumanMessage } from '@langchain/core/messages';
import { initializeCheckpointer } from '../services/checkpointer.service.js';
import { createDevSupervisor } from './supervisor.js';
import { checkKillSwitch, ensureDevBranch } from './guards.js';
import { DEV_AGENT_NAMES } from './types.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'DevAgentCLI' });

async function main(): Promise<void> {
  // Parse task description from argv
  const taskDescription = process.argv.slice(2).join(' ').trim();

  if (!taskDescription) {
    console.error('Usage: npm run dev:agent "<task description>"');
    console.error('');
    console.error('Examples:');
    console.error('  npm run dev:agent "scaffold a new tool for document generation"');
    console.error('  npm run dev:agent "review backend/src/services/chat.service.ts"');
    console.error('  npm run dev:agent "run and fix failing tests in backend"');
    process.exit(1);
  }

  // Check kill switch before doing anything
  await checkKillSwitch(DEV_AGENT_NAMES.SUPERVISOR);

  // Ensure we're on a dev-agent/* branch (never writes to main/dev)
  const branchName = await ensureDevBranch(taskDescription);

  // Initialize the checkpointer (creates tables if using Postgres)
  await initializeCheckpointer();

  // Create the supervisor graph
  const supervisor = createDevSupervisor();

  // Generate a unique thread ID for this run
  const threadId = `dev-agent:${randomUUID()}`;
  const config = { configurable: { thread_id: threadId } };

  console.log(`\n--- Dev Agent ---`);
  console.log(`Thread:  ${threadId}`);
  console.log(`Branch:  ${branchName}`);
  console.log(`Task:    ${taskDescription}`);
  console.log(`---\n`);

  logger.info('Dev agent CLI started', { threadId, taskDescription });

  // Stream the supervisor's response
  const stream = await supervisor.stream(
    { messages: [new HumanMessage(taskDescription)] },
    { ...config, streamMode: 'updates' },
  );

  for await (const chunk of stream) {
    // Each chunk is { [nodeName]: stateUpdate }
    for (const [nodeName, update] of Object.entries(chunk)) {
      if (nodeName === '__interrupt__') {
        console.log('\n[INTERRUPT] The supervisor is waiting for input.');
        console.log(`Resume with thread: ${threadId}`);
        continue;
      }

      // Extract messages from the update
      const messages = (update as Record<string, unknown>)?.messages;
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          const content = typeof msg === 'object' && msg !== null && 'content' in msg
            ? (msg as { content: unknown }).content
            : msg;

          if (typeof content === 'string' && content.length > 0) {
            console.log(`[${nodeName}] ${content}`);
          }
        }
      }
    }
  }

  console.log(`\n--- Done ---`);
  console.log(`Thread: ${threadId}`);
  logger.info('Dev agent CLI completed', { threadId });
}

main().catch((err: unknown) => {
  logger.error('Dev agent CLI failed', err as Error);
  console.error('Fatal error:', err);
  process.exit(1);
});
