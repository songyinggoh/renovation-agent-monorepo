import { z } from 'zod';
import { MAX_ATTACHMENTS } from './constants.js';

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
 * Schema for a single message attachment (image asset reference)
 */
export const attachmentSchema = z.object({
  assetId: z.string().uuid({ message: 'Invalid asset ID format' }),
  fileName: z.string().max(255).optional(),
});

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
  attachments: z
    .array(attachmentSchema)
    .max(MAX_ATTACHMENTS, `Cannot attach more than ${MAX_ATTACHMENTS} files`)
    .optional(),
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
 * Injection severity levels
 */
export type InjectionSeverity = 'none' | 'low' | 'medium' | 'high';

/**
 * Result of injection classification
 */
export interface InjectionClassification {
  severity: InjectionSeverity;
  matchedPatterns: string[];
}

/**
 * Prompt injection patterns organized by severity
 *
 * - HIGH: Direct system prompt override / role hijacking — should be BLOCKED
 * - MEDIUM: Instruction manipulation — allowed but flagged
 * - LOW: Suspicious but ambiguous patterns — logged only
 */
const HIGH_SEVERITY_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /system\s*:\s*you\s+are/i, label: 'system_role_override' },
  { pattern: /<\|system\|>/i, label: 'system_tag_injection' },
  { pattern: /<\|im_start\|>/i, label: 'im_start_injection' },
  { pattern: /\[SYSTEM\]/i, label: 'system_bracket_injection' },
  { pattern: /\[INST\]/i, label: 'inst_bracket_injection' },
  { pattern: /assistant\s*:\s*/i, label: 'assistant_role_hijack' },
  { pattern: /```system\b/i, label: 'fenced_system_block' },
];

const MEDIUM_SEVERITY_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /ignore\s+(all\s+)?(previous|above|prior)\s+instructions?/i, label: 'ignore_instructions' },
  { pattern: /disregard\s+(all\s+)?(previous|above|prior)\s+instructions?/i, label: 'disregard_instructions' },
  { pattern: /forget\s+(all\s+)?(previous|above|prior)\s+instructions?/i, label: 'forget_instructions' },
  { pattern: /pretend\s+you\s+are/i, label: 'role_pretend' },
  { pattern: /act\s+as\s+(if\s+)?(you\s+are\s+)?a\s+different/i, label: 'role_switch' },
];

const LOW_SEVERITY_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /reveal\s+(your\s+)?(system\s+)?prompt/i, label: 'prompt_reveal' },
  { pattern: /show\s+me\s+(your\s+)?instructions/i, label: 'instruction_reveal' },
  { pattern: /what\s+are\s+your\s+(system\s+)?instructions/i, label: 'instruction_query' },
];

/**
 * Classify content for prompt injection severity
 *
 * Returns the highest matching severity level and all matched patterns.
 * If no patterns match, returns severity 'none'.
 *
 * @param content - Message content to classify
 * @returns Classification with severity and matched pattern labels
 */
export function classifyInjection(content: string): InjectionClassification {
  const matched: string[] = [];
  let severity: InjectionSeverity = 'none';

  for (const { pattern, label } of HIGH_SEVERITY_PATTERNS) {
    if (pattern.test(content)) {
      matched.push(label);
      severity = 'high';
    }
  }

  for (const { pattern, label } of MEDIUM_SEVERITY_PATTERNS) {
    if (pattern.test(content)) {
      matched.push(label);
      if (severity === 'none') severity = 'medium';
    }
  }

  for (const { pattern, label } of LOW_SEVERITY_PATTERNS) {
    if (pattern.test(content)) {
      matched.push(label);
      if (severity === 'none') severity = 'low';
    }
  }

  return { severity, matchedPatterns: matched };
}

/**
 * Check content for potential prompt injection patterns (legacy boolean API)
 *
 * @param content - Message content to check
 * @returns true if suspicious patterns detected (medium or high severity)
 */
export function detectPromptInjection(content: string): boolean {
  const result = classifyInjection(content);
  return result.severity === 'medium' || result.severity === 'high';
}

/**
 * Sanitize content by detecting potential injection attempts
 *
 * @param content - Message content to sanitize
 * @returns Sanitization result with flag, severity, and warning
 */
export function sanitizeContent(content: string): {
  content: string;
  isSuspicious: boolean;
  severity: InjectionSeverity;
  matchedPatterns: string[];
  warning?: string;
} {
  const classification = classifyInjection(content);

  if (classification.severity !== 'none') {
    return {
      content,
      isSuspicious: true,
      severity: classification.severity,
      matchedPatterns: classification.matchedPatterns,
      warning: 'Message contains patterns that may attempt to manipulate the AI system',
    };
  }

  return {
    content,
    isSuspicious: false,
    severity: 'none',
    matchedPatterns: [],
  };
}
