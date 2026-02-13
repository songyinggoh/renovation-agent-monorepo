import { z } from 'zod';

/**
 * Validation schemas for Socket.io message payloads
 *
 * Security considerations:
 * - UUID format validation prevents injection attacks via sessionId
 * - Max length prevents DoS attacks via large messages
 * - Trim prevents accidental whitespace issues
 * - Content sanitization should be applied before passing to AI
 */

/**
 * Schema for chat:user_message event payload
 */
export const chatUserMessageSchema = z.object({
  sessionId: z
    .string()
    .uuid({ message: 'Invalid session ID format' }),
  content: z
    .string()
    .trim()
    .min(1, 'Message content cannot be empty')
    .max(10000, 'Message content cannot exceed 10,000 characters'),
});

/**
 * Schema for chat:join_session event payload
 */
export const chatJoinSessionSchema = z.object({
  sessionId: z
    .string()
    .uuid({ message: 'Invalid session ID format' }),
});

/**
 * Type inference from schemas
 */
export type ChatUserMessagePayload = z.infer<typeof chatUserMessageSchema>;
export type ChatJoinSessionPayload = z.infer<typeof chatJoinSessionSchema>;

/**
 * Basic prompt injection detection patterns
 * These patterns catch common injection attempts like:
 * - System prompt override attempts
 * - Role hijacking
 * - Instruction injection
 */
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/i,
  /disregard\s+(all\s+)?(previous|above|prior)\s+instructions?/i,
  /forget\s+(all\s+)?(previous|above|prior)\s+instructions?/i,
  /system\s*:\s*you\s+are/i,
  /assistant\s*:\s*/i,
  /\[SYSTEM\]/i,
  /\[INST\]/i,
  /<\|system\|>/i,
  /<\|im_start\|>/i,
];

/**
 * Check content for potential prompt injection patterns
 *
 * Note: This is a basic heuristic defense and should be paired with:
 * - Proper prompt engineering (clear role definitions)
 * - Output filtering
 * - Rate limiting (already implemented)
 * - User reputation systems (future)
 *
 * @param content - Message content to check
 * @returns true if suspicious patterns detected
 */
export function detectPromptInjection(content: string): boolean {
  return PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Sanitize content by detecting potential injection attempts
 *
 * @param content - Message content to sanitize
 * @returns Sanitization result with flag and warning
 */
export function sanitizeContent(content: string): {
  content: string;
  isSuspicious: boolean;
  warning?: string;
} {
  const isSuspicious = detectPromptInjection(content);

  if (isSuspicious) {
    return {
      content,
      isSuspicious: true,
      warning: 'Message contains patterns that may attempt to manipulate the AI system',
    };
  }

  return {
    content,
    isSuspicious: false,
  };
}
