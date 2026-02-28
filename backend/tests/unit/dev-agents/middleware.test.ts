import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { createCostTrackingMiddleware } from '../../../src/dev-agents/cost-tracking.js';
import {
  createDevAgentMiddleware,
  TOOL_CALL_LIMITS,
  MODEL_CALL_LIMITS,
} from '../../../src/dev-agents/middleware.js';
import { DEV_AGENT_NAMES } from '../../../src/dev-agents/types.js';

describe('createCostTrackingMiddleware', () => {
  it('returns a middleware with name "cost_tracking"', () => {
    const mw = createCostTrackingMiddleware('test-agent');
    expect(mw.name).toBe('cost_tracking');
  });

  it('has a wrapModelCall hook', () => {
    const mw = createCostTrackingMiddleware('test-agent');
    expect(mw.wrapModelCall).toBeDefined();
    expect(typeof mw.wrapModelCall).toBe('function');
  });
});

describe('createDevAgentMiddleware', () => {
  it('returns an array of 4 middleware', () => {
    const stack = createDevAgentMiddleware('scaffold-agent');
    expect(stack).toHaveLength(4);
  });

  it('includes ToolCallLimitMiddleware', () => {
    const stack = createDevAgentMiddleware('scaffold-agent');
    expect(stack[0].name).toBe('ToolCallLimitMiddleware');
  });

  it('includes ModelCallLimitMiddleware', () => {
    const stack = createDevAgentMiddleware('scaffold-agent');
    expect(stack[1].name).toBe('ModelCallLimitMiddleware');
  });

  it('includes modelFallbackMiddleware', () => {
    const stack = createDevAgentMiddleware('scaffold-agent');
    expect(stack[2].name).toBe('modelFallbackMiddleware');
  });

  it('includes cost_tracking middleware', () => {
    const stack = createDevAgentMiddleware('scaffold-agent');
    expect(stack[3].name).toBe('cost_tracking');
  });

  it('has limits defined for every agent name', () => {
    const allNames = Object.values(DEV_AGENT_NAMES);
    for (const name of allNames) {
      expect(TOOL_CALL_LIMITS[name]).toBeGreaterThan(0);
      expect(MODEL_CALL_LIMITS[name]).toBeGreaterThan(0);
    }
  });

  it('gives implement-agent the highest tool call limit', () => {
    const implementLimit = TOOL_CALL_LIMITS['implement-agent'];
    const scaffoldLimit = TOOL_CALL_LIMITS['scaffold-agent'];
    expect(implementLimit).toBeGreaterThan(scaffoldLimit);
  });
});
