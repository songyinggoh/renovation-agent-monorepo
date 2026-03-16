#!/usr/bin/env tsx
/**
 * SOP Workflow CLI — full development pipeline with pause/resume/approve.
 *
 * Usage:
 *   # Start a new workflow
 *   npm run dev:workflow "add pagination to sessions API"
 *
 *   # Resume a paused workflow
 *   npm run dev:workflow:resume <thread-id>
 *
 *   # Approve a plan (after interrupt)
 *   npm run dev:workflow:approve <thread-id>
 */

import { randomUUID } from 'node:crypto';
import { initializeCheckpointer } from '../services/checkpointer.service.js';
import { createSOPWorkflow } from './workflow/sop-graph.js';
import { checkKillSwitch } from './guards.js';
import { DEV_AGENT_NAMES } from './types.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'SOPWorkflowCLI' });

type CliMode = 'start' | 'resume' | 'approve';

interface CliArgs {
  mode: CliMode;
  threadId: string;
  taskDescription: string;
}

/**
 * Parse CLI arguments into structured args.
 *
 * Patterns:
 *   dev:workflow "task description"          → start
 *   dev:workflow:resume <thread-id>          → resume
 *   dev:workflow:approve <thread-id>         → approve
 *   dev:workflow --resume <thread-id>        → resume
 *   dev:workflow --approve <thread-id>       → approve
 */
function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  // --resume <thread-id>
  if (args[0] === '--resume') {
    const threadId = args[1];
    if (!threadId) {
      console.error('Error: --resume requires a thread ID');
      process.exit(1);
    }
    return { mode: 'resume', threadId, taskDescription: '' };
  }

  // --approve <thread-id>
  if (args[0] === '--approve') {
    const threadId = args[1];
    if (!threadId) {
      console.error('Error: --approve requires a thread ID');
      process.exit(1);
    }
    return { mode: 'approve', threadId, taskDescription: '' };
  }

  // Default: start a new workflow with the task description
  const taskDescription = args.join(' ').trim();
  if (!taskDescription) {
    printUsage();
    process.exit(1);
  }

  return {
    mode: 'start',
    threadId: `sop:${randomUUID()}`,
    taskDescription,
  };
}

function printUsage(): void {
  console.error('Usage:');
  console.error('  npm run dev:workflow "task description"     Start new workflow');
  console.error('  npm run dev:workflow:resume <thread-id>     Resume paused workflow');
  console.error('  npm run dev:workflow:approve <thread-id>    Approve plan and continue');
  console.error('');
  console.error('Examples:');
  console.error('  npm run dev:workflow "add pagination to sessions API"');
  console.error('  npm run dev:workflow:resume sop:abc123');
  console.error('  npm run dev:workflow:approve sop:abc123');
}

/**
 * Stream graph output to stdout, handling interrupts.
 */
async function streamGraph(
  graph: Awaited<ReturnType<typeof createSOPWorkflow>>,
  input: Record<string, unknown> | null,
  config: { configurable: { thread_id: string } },
): Promise<void> {
  const stream = await graph.stream(input, {
    ...config,
    streamMode: 'updates',
  });

  for await (const chunk of stream) {
    for (const [nodeName, update] of Object.entries(chunk)) {
      if (nodeName === '__interrupt__') {
        console.log('\n========================================');
        console.log('WORKFLOW PAUSED — Awaiting approval');
        console.log('========================================');
        console.log(`Thread: ${config.configurable.thread_id}`);
        console.log('');
        console.log('To approve and continue:');
        console.log(`  npm run dev:workflow:approve ${config.configurable.thread_id}`);
        console.log('');
        console.log('To resume without approving:');
        console.log(`  npm run dev:workflow:resume ${config.configurable.thread_id}`);
        console.log('========================================\n');
        continue;
      }

      // Log the current phase
      const stateUpdate = update as Record<string, unknown>;
      if (stateUpdate?.currentPhase) {
        console.log(`\n--- Phase: ${String(stateUpdate.currentPhase)} ---`);
      }

      // Extract and print any text content
      const keys = ['researchOutput', 'plan', 'implementationLog', 'testOutput', 'reviewOutput'];
      for (const key of keys) {
        if (typeof stateUpdate?.[key] === 'string' && stateUpdate[key]) {
          const content = stateUpdate[key] as string;
          // Truncate long outputs for CLI readability
          const display = content.length > 2000
            ? content.slice(0, 2000) + '\n... (truncated)'
            : content;
          console.log(`[${nodeName}] ${display}`);
        }
      }

      // Log pass/fail status
      if (typeof stateUpdate?.testsPassed === 'boolean') {
        console.log(`[${nodeName}] Tests: ${stateUpdate.testsPassed ? 'PASSED' : 'FAILED'}`);
      }
      if (typeof stateUpdate?.qualityGatesPassed === 'boolean') {
        console.log(`[${nodeName}] Quality gates: ${stateUpdate.qualityGatesPassed ? 'PASSED' : 'FAILED'}`);
      }
      if (typeof stateUpdate?.reviewPassed === 'boolean') {
        console.log(`[${nodeName}] Review: ${stateUpdate.reviewPassed ? 'PASSED' : 'NEEDS ATTENTION'}`);
      }
    }
  }
}

async function main(): Promise<void> {
  const cliArgs = parseArgs(process.argv);

  // Check kill switch before doing anything
  await checkKillSwitch(DEV_AGENT_NAMES.SUPERVISOR);

  // Initialize the checkpointer
  await initializeCheckpointer();

  // Create the SOP workflow graph
  const sopGraph = createSOPWorkflow();
  const config = { configurable: { thread_id: cliArgs.threadId } };

  console.log(`\n=== SOP Workflow CLI ===`);
  console.log(`Mode:    ${cliArgs.mode}`);
  console.log(`Thread:  ${cliArgs.threadId}`);
  if (cliArgs.taskDescription) {
    console.log(`Task:    ${cliArgs.taskDescription}`);
  }
  console.log(`========================\n`);

  logger.info('SOP workflow CLI started', {
    mode: cliArgs.mode,
    threadId: cliArgs.threadId,
    taskDescription: cliArgs.taskDescription || undefined,
  });

  switch (cliArgs.mode) {
    case 'start': {
      // Start a new workflow with the task description
      await streamGraph(
        sopGraph,
        { taskDescription: cliArgs.taskDescription },
        config,
      );
      break;
    }

    case 'resume': {
      // Resume from checkpoint — pass null to continue from last state
      console.log('Resuming workflow from checkpoint...');
      await streamGraph(sopGraph, null, config);
      break;
    }

    case 'approve': {
      // Update state with approved=true, then continue
      console.log('Approving plan and resuming workflow...');
      await sopGraph.updateState(config, { approved: true });
      await streamGraph(sopGraph, null, config);
      break;
    }
  }

  console.log(`\n=== Workflow Complete ===`);
  console.log(`Thread: ${cliArgs.threadId}`);
  logger.info('SOP workflow CLI completed', { threadId: cliArgs.threadId });
}

main().catch((err: unknown) => {
  logger.error('SOP workflow CLI failed', err as Error);
  console.error('Fatal error:', err);
  process.exit(1);
});
