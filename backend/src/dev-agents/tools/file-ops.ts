/**
 * File operation tools for dev agents.
 *
 * Provides file_read, file_write, and file_edit tools using Node.js fs.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { Logger } from '../../utils/logger.js';

const logger = new Logger({ serviceName: 'DevTools:FileOps' });

/**
 * file_read - Read file contents from disk.
 */
export const fileReadTool = tool(
  async ({ path }): Promise<string> => {
    logger.info('Tool invoked: file_read', { path });
    try {
      const content = await readFile(path, 'utf-8');
      return content;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file';
      logger.error('file_read failed', error as Error, { path });
      return JSON.stringify({ success: false, error: message });
    }
  },
  {
    name: 'file_read',
    description: 'Read the contents of a file at the given path. Returns the file content as a string.',
    schema: z.object({
      path: z.string().describe('Absolute or relative path to the file to read'),
    }),
  },
);

/**
 * file_write - Write or create a file on disk.
 * Creates parent directories if they do not exist.
 */
export const fileWriteTool = tool(
  async ({ path, content }): Promise<string> => {
    logger.info('Tool invoked: file_write', { path, contentLength: content.length });
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf-8');
      return JSON.stringify({ success: true, path, bytesWritten: Buffer.byteLength(content, 'utf-8') });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to write file';
      logger.error('file_write failed', error as Error, { path });
      return JSON.stringify({ success: false, error: message });
    }
  },
  {
    name: 'file_write',
    description: 'Write content to a file, creating parent directories if needed. Overwrites existing files.',
    schema: z.object({
      path: z.string().describe('Absolute or relative path to the file to write'),
      content: z.string().describe('The full content to write to the file'),
    }),
  },
);

/**
 * file_edit - Replace a specific string occurrence in a file.
 */
export const fileEditTool = tool(
  async ({ path, oldString, newString }): Promise<string> => {
    logger.info('Tool invoked: file_edit', {
      path,
      oldStringLength: oldString.length,
      newStringLength: newString.length,
    });
    try {
      const content = await readFile(path, 'utf-8');

      if (!content.includes(oldString)) {
        return JSON.stringify({
          success: false,
          error: 'oldString not found in file',
        });
      }

      const occurrences = content.split(oldString).length - 1;
      if (occurrences > 1) {
        return JSON.stringify({
          success: false,
          error: `oldString found ${occurrences} times — must be unique. Provide more surrounding context.`,
        });
      }

      const updated = content.replace(oldString, newString);
      await writeFile(path, updated, 'utf-8');

      return JSON.stringify({ success: true, path });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to edit file';
      logger.error('file_edit failed', error as Error, { path });
      return JSON.stringify({ success: false, error: message });
    }
  },
  {
    name: 'file_edit',
    description:
      'Replace a specific string in a file. The oldString must appear exactly once in the file. Provide enough surrounding context to ensure uniqueness.',
    schema: z.object({
      path: z.string().describe('Absolute or relative path to the file to edit'),
      oldString: z.string().describe('The exact text to find and replace (must be unique in the file)'),
      newString: z.string().describe('The replacement text'),
    }),
  },
);
