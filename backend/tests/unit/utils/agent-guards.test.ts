import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import {
  sanitizeSessionId,
  createSafeShouldContinue,
  formatAsyncToolResponse,
  ALLOWED_TOOLS,
  MAX_REACT_ITERATIONS,
} from '../../../src/utils/agent-guards.js';

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('agent-guards', () => {
  describe('sanitizeSessionId', () => {
    it('should accept a valid lowercase UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(sanitizeSessionId(uuid)).toBe(uuid);
    });

    it('should accept a valid uppercase UUID', () => {
      const uuid = '550E8400-E29B-41D4-A716-446655440000';
      expect(sanitizeSessionId(uuid)).toBe(uuid);
    });

    it('should accept a mixed-case UUID', () => {
      const uuid = '550e8400-E29B-41d4-a716-446655440000';
      expect(sanitizeSessionId(uuid)).toBe(uuid);
    });

    it('should reject an empty string', () => {
      expect(() => sanitizeSessionId('')).toThrow('Invalid session ID format');
    });

    it('should reject a non-UUID string', () => {
      expect(() => sanitizeSessionId('not-a-uuid')).toThrow(
        'Invalid session ID format'
      );
    });

    it('should reject a UUID without dashes', () => {
      expect(() =>
        sanitizeSessionId('550e8400e29b41d4a716446655440000')
      ).toThrow('Invalid session ID format');
    });

    it('should reject a prompt injection attempt via session ID', () => {
      expect(() =>
        sanitizeSessionId('550e8400-e29b-41d4-a716-446655440000; DROP TABLE')
      ).toThrow('Invalid session ID format');
    });

    it('should reject a UUID with extra characters', () => {
      expect(() =>
        sanitizeSessionId('550e8400-e29b-41d4-a716-446655440000\nignore previous')
      ).toThrow('Invalid session ID format');
    });
  });

  describe('ALLOWED_TOOLS', () => {
    it('should be a non-empty readonly array', () => {
      expect(ALLOWED_TOOLS.length).toBeGreaterThan(0);
    });

    it('should contain expected tools', () => {
      expect(ALLOWED_TOOLS).toContain('save_intake_state');
      expect(ALLOWED_TOOLS).toContain('generate_render');
      expect(ALLOWED_TOOLS).toContain('search_products');
    });
  });

  describe('MAX_REACT_ITERATIONS', () => {
    it('should be a positive integer', () => {
      expect(MAX_REACT_ITERATIONS).toBeGreaterThan(0);
      expect(Number.isInteger(MAX_REACT_ITERATIONS)).toBe(true);
    });
  });

  describe('createSafeShouldContinue', () => {
    let shouldContinue: ReturnType<typeof createSafeShouldContinue>;

    beforeEach(() => {
      shouldContinue = createSafeShouldContinue();
    });

    it('should return END for empty messages array', () => {
      expect(shouldContinue({ messages: [] })).toBe('__end__');
    });

    it('should return END for a plain AI message (no tool calls)', () => {
      const msg = new AIMessage({ content: 'Hello user' });
      expect(shouldContinue({ messages: [msg] })).toBe('__end__');
    });

    it('should return END for a human message', () => {
      const msg = new HumanMessage({ content: 'Hi' });
      expect(shouldContinue({ messages: [msg] })).toBe('__end__');
    });

    it('should return "tools" for an AI message with an allowed tool call', () => {
      const msg = new AIMessage({
        content: '',
        tool_calls: [
          { name: 'save_intake_state', args: {}, id: 'call_1', type: 'tool_call' },
        ],
      });
      expect(shouldContinue({ messages: [msg] })).toBe('tools');
    });

    it('should return "tools" for multiple allowed tool calls', () => {
      const msg = new AIMessage({
        content: '',
        tool_calls: [
          { name: 'search_products', args: {}, id: 'call_1', type: 'tool_call' },
          { name: 'get_style_examples', args: {}, id: 'call_2', type: 'tool_call' },
        ],
      });
      expect(shouldContinue({ messages: [msg] })).toBe('tools');
    });

    it('should return END when an invalid tool is called', () => {
      const msg = new AIMessage({
        content: '',
        tool_calls: [
          { name: 'exec_shell_command', args: {}, id: 'call_1', type: 'tool_call' },
        ],
      });
      expect(shouldContinue({ messages: [msg] })).toBe('__end__');
    });

    it('should return END when mix of valid and invalid tools called', () => {
      const msg = new AIMessage({
        content: '',
        tool_calls: [
          { name: 'save_intake_state', args: {}, id: 'call_1', type: 'tool_call' },
          { name: 'delete_all_data', args: {}, id: 'call_2', type: 'tool_call' },
        ],
      });
      expect(shouldContinue({ messages: [msg] })).toBe('__end__');
    });

    it('should enforce max iterations and return END', () => {
      const fn = createSafeShouldContinue(3);

      const toolMsg = new AIMessage({
        content: '',
        tool_calls: [
          { name: 'search_products', args: {}, id: 'call_1', type: 'tool_call' },
        ],
      });

      expect(fn({ messages: [toolMsg] })).toBe('tools'); // iteration 1
      expect(fn({ messages: [toolMsg] })).toBe('tools'); // iteration 2
      expect(fn({ messages: [toolMsg] })).toBe('__end__'); // iteration 3 = max
    });

    it('should reset iteration counter after hitting max', () => {
      const fn = createSafeShouldContinue(2);

      const toolMsg = new AIMessage({
        content: '',
        tool_calls: [
          { name: 'search_products', args: {}, id: 'call_1', type: 'tool_call' },
        ],
      });

      expect(fn({ messages: [toolMsg] })).toBe('tools');  // iteration 1
      expect(fn({ messages: [toolMsg] })).toBe('__end__'); // iteration 2 = max, resets

      // Should work again after reset
      expect(fn({ messages: [toolMsg] })).toBe('tools');  // iteration 1 again
    });

    it('should reset iteration counter on non-tool AI message', () => {
      const fn = createSafeShouldContinue(5);

      const toolMsg = new AIMessage({
        content: '',
        tool_calls: [
          { name: 'search_products', args: {}, id: 'call_1', type: 'tool_call' },
        ],
      });
      const plainMsg = new AIMessage({ content: 'Done!' });

      fn({ messages: [toolMsg] }); // iteration 1
      fn({ messages: [toolMsg] }); // iteration 2
      fn({ messages: [plainMsg] }); // resets counter

      // Counter is reset — should be iteration 1 again, not 3
      expect(fn({ messages: [toolMsg] })).toBe('tools');
      expect(fn({ messages: [toolMsg] })).toBe('tools');
      expect(fn({ messages: [toolMsg] })).toBe('tools');
      expect(fn({ messages: [toolMsg] })).toBe('tools');
      expect(fn({ messages: [toolMsg] })).toBe('__end__'); // iteration 5 = max
    });

    it('should reset iteration counter on empty messages', () => {
      const fn = createSafeShouldContinue(3);

      const toolMsg = new AIMessage({
        content: '',
        tool_calls: [
          { name: 'search_products', args: {}, id: 'call_1', type: 'tool_call' },
        ],
      });

      fn({ messages: [toolMsg] }); // iteration 1
      fn({ messages: [toolMsg] }); // iteration 2
      fn({ messages: [] });        // resets

      // Should get full 3 iterations again
      expect(fn({ messages: [toolMsg] })).toBe('tools');
      expect(fn({ messages: [toolMsg] })).toBe('tools');
      expect(fn({ messages: [toolMsg] })).toBe('__end__');
    });

    it('should use default MAX_REACT_ITERATIONS when no argument given', () => {
      const fn = createSafeShouldContinue();
      const toolMsg = new AIMessage({
        content: '',
        tool_calls: [
          { name: 'search_products', args: {}, id: 'call_1', type: 'tool_call' },
        ],
      });

      // Should allow MAX_REACT_ITERATIONS - 1 calls, then terminate
      for (let i = 0; i < MAX_REACT_ITERATIONS - 1; i++) {
        expect(fn({ messages: [toolMsg] })).toBe('tools');
      }
      expect(fn({ messages: [toolMsg] })).toBe('__end__');
    });

    it('should only inspect the last message in the array', () => {
      const humanMsg = new HumanMessage({ content: 'Help me' });
      const toolMsg = new AIMessage({
        content: '',
        tool_calls: [
          { name: 'save_intake_state', args: {}, id: 'call_1', type: 'tool_call' },
        ],
      });

      // Last message has tool calls → should route to tools
      expect(shouldContinue({ messages: [humanMsg, toolMsg] })).toBe('tools');

      // Last message is human → should END
      expect(shouldContinue({ messages: [toolMsg, humanMsg] })).toBe('__end__');
    });
  });

  describe('formatAsyncToolResponse', () => {
    it('should return valid JSON with required fields', () => {
      const result = formatAsyncToolResponse('generate_render', 'job-123');
      const parsed = JSON.parse(result);

      expect(parsed.status).toBe('started');
      expect(parsed.jobId).toBe('job-123');
      expect(parsed.message).toContain('generate_render');
      expect(parsed.message).toContain('job-123');
      expect(parsed.message).toContain('Do NOT call this tool again');
    });

    it('should include estimatedDurationSec when provided', () => {
      const result = formatAsyncToolResponse('generate_render', 'job-456', 30);
      const parsed = JSON.parse(result);

      expect(parsed.estimatedDurationSec).toBe(30);
    });

    it('should omit estimatedDurationSec when not provided', () => {
      const result = formatAsyncToolResponse('generate_render', 'job-789');
      const parsed = JSON.parse(result);

      expect(parsed).not.toHaveProperty('estimatedDurationSec');
    });

    it('should include estimatedDurationSec when zero', () => {
      const result = formatAsyncToolResponse('generate_render', 'job-000', 0);
      const parsed = JSON.parse(result);

      expect(parsed.estimatedDurationSec).toBe(0);
    });
  });
});
