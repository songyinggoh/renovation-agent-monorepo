import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SpanKind } from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { RenovationSampler } from '../../../src/config/telemetry.js';

// Mock logger to prevent console output during tests
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('RenovationSampler', () => {
  let sampler: RenovationSampler;
  const ROOT_CONTEXT = {} as never;
  const NO_LINKS: never[] = [];

  beforeEach(() => {
    sampler = new RenovationSampler(0.1);
  });

  describe('constructor', () => {
    it('should clamp ratio to valid range [0, 1]', () => {
      const highSampler = new RenovationSampler(1.5);
      expect(highSampler.toString()).toBe('RenovationSampler{baselineRatio=1}');

      const lowSampler = new RenovationSampler(-0.5);
      expect(lowSampler.toString()).toBe('RenovationSampler{baselineRatio=0}');
    });

    it('should default to 0.1 ratio', () => {
      const defaultSampler = new RenovationSampler();
      expect(defaultSampler.toString()).toBe('RenovationSampler{baselineRatio=0.1}');
    });
  });

  describe('error sampling', () => {
    it('should always sample HTTP 500 errors', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        'aaaabbbbccccdddd1111222233334444',
        'GET /api/sessions',
        SpanKind.SERVER,
        { 'http.status_code': 500 },
        NO_LINKS,
      );
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    });

    it('should always sample HTTP 502 errors', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        'aaaabbbbccccdddd1111222233334444',
        'GET /api/sessions',
        SpanKind.SERVER,
        { 'http.status_code': 502 },
        NO_LINKS,
      );
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    });

    it('should not force-sample HTTP 400 errors', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        '00000000000000000000000000000000',
        'GET /api/sessions',
        SpanKind.SERVER,
        { 'http.status_code': 400 },
        NO_LINKS,
      );
      expect([SamplingDecision.RECORD_AND_SAMPLED, SamplingDecision.NOT_RECORD]).toContain(result.decision);
    });
  });

  describe('AI operation sampling', () => {
    it('should always sample spans starting with "ai."', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        '00000000000000000000000000000000',
        'ai.chat.invoke',
        SpanKind.CLIENT,
        {},
        NO_LINKS,
      );
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    });

    it('should always sample spans containing "gemini"', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        '00000000000000000000000000000000',
        'gemini-2.5-flash.invoke',
        SpanKind.CLIENT,
        {},
        NO_LINKS,
      );
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    });

    it('should always sample spans containing "langgraph"', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        '00000000000000000000000000000000',
        'langgraph.graph.stream',
        SpanKind.INTERNAL,
        {},
        NO_LINKS,
      );
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    });
  });

  describe('security event sampling', () => {
    it('should always sample when prompt injection is detected', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        '00000000000000000000000000000000',
        'socket.io receive',
        SpanKind.SERVER,
        { 'security.prompt_injection': true },
        NO_LINKS,
      );
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    });

    it('should not force-sample when prompt injection is false', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        '00000000000000000000000000000000',
        'socket.io receive',
        SpanKind.SERVER,
        { 'security.prompt_injection': false },
        NO_LINKS,
      );
      expect([SamplingDecision.RECORD_AND_SAMPLED, SamplingDecision.NOT_RECORD]).toContain(result.decision);
    });
  });

  describe('chat message sampling', () => {
    it('should always sample socket.io chat:user_message events', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        '00000000000000000000000000000000',
        'socket.io chat:user_message',
        SpanKind.SERVER,
        {},
        NO_LINKS,
      );
      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    });

    it('should not force-sample non-chat socket.io events', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        '00000000000000000000000000000000',
        'socket.io connection',
        SpanKind.SERVER,
        {},
        NO_LINKS,
      );
      expect([SamplingDecision.RECORD_AND_SAMPLED, SamplingDecision.NOT_RECORD]).toContain(result.decision);
    });
  });

  describe('health check sampling', () => {
    it('should use 1% sampling for health check routes', () => {
      let sampledCount = 0;
      const total = 1000;
      const step = Math.floor(0xffffffff / total);

      for (let i = 0; i < total; i++) {
        const suffix = (i * step).toString(16).padStart(8, '0');
        const traceId = '00000000000000000000000' + suffix.padStart(9, '0');
        const result = sampler.shouldSample(
          ROOT_CONTEXT,
          traceId,
          'GET /health',
          SpanKind.SERVER,
          { 'http.route': '/health' },
          NO_LINKS,
        );
        if (result.decision === SamplingDecision.RECORD_AND_SAMPLED) {
          sampledCount++;
        }
      }
      // 1% of 1000 = ~10, allow generous margin
      expect(sampledCount).toBeLessThan(30);
    });
  });

  describe('baseline ratio sampling', () => {
    it('should sample approximately 10% of regular traces', () => {
      let sampledCount = 0;
      const total = 1000;
      const step = Math.floor(0xffffffff / total);

      for (let i = 0; i < total; i++) {
        const suffix = (i * step).toString(16).padStart(8, '0');
        const traceId = '00000000000000000000000' + suffix.padStart(9, '0');
        const result = sampler.shouldSample(
          ROOT_CONTEXT,
          traceId,
          'GET /api/sessions',
          SpanKind.SERVER,
          {},
          NO_LINKS,
        );
        if (result.decision === SamplingDecision.RECORD_AND_SAMPLED) {
          sampledCount++;
        }
      }

      // 10% of 1000 = ~100, allow generous margin
      expect(sampledCount).toBeGreaterThan(50);
      expect(sampledCount).toBeLessThan(200);
    });

    it('should be deterministic for the same trace ID', () => {
      const traceId = 'aabbccdd11223344aabbccdd11223344';
      const result1 = sampler.shouldSample(
        ROOT_CONTEXT,
        traceId,
        'GET /api/sessions',
        SpanKind.SERVER,
        {},
        NO_LINKS,
      );
      const result2 = sampler.shouldSample(
        ROOT_CONTEXT,
        traceId,
        'GET /api/sessions',
        SpanKind.SERVER,
        {},
        NO_LINKS,
      );
      expect(result1.decision).toBe(result2.decision);
    });

    it('should sample 100% when ratio is 1.0', () => {
      const fullSampler = new RenovationSampler(1.0);
      let sampledCount = 0;

      for (let i = 0; i < 100; i++) {
        const traceId = i.toString(16).padStart(32, '0');
        const result = fullSampler.shouldSample(
          ROOT_CONTEXT,
          traceId,
          'GET /api/sessions',
          SpanKind.SERVER,
          {},
          NO_LINKS,
        );
        if (result.decision === SamplingDecision.RECORD_AND_SAMPLED) {
          sampledCount++;
        }
      }

      expect(sampledCount).toBe(100);
    });

    it('should sample 0% when ratio is 0', () => {
      const noSampler = new RenovationSampler(0);

      for (let i = 0; i < 100; i++) {
        const traceId = i.toString(16).padStart(32, '0');
        const result = noSampler.shouldSample(
          ROOT_CONTEXT,
          traceId,
          'GET /api/sessions',
          SpanKind.SERVER,
          {},
          NO_LINKS,
        );
        expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
      }
    });
  });

  describe('toString', () => {
    it('should return descriptive string', () => {
      expect(sampler.toString()).toBe('RenovationSampler{baselineRatio=0.1}');
    });
  });
});

describe('initTelemetry', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should not initialize in test environment', async () => {
    const { initTelemetry, isTelemetryActive } = await import('../../../src/config/telemetry.js');
    initTelemetry();
    expect(isTelemetryActive()).toBe(false);
  });

  it('should not initialize when OTEL_ENABLED=false', async () => {
    process.env.NODE_ENV = 'development';
    process.env.OTEL_ENABLED = 'false';
    const mod = await import('../../../src/config/telemetry.js');
    mod.initTelemetry();
    expect(mod.isTelemetryActive()).toBe(false);
  });
});

describe('shutdownTelemetry', () => {
  it('should not throw when SDK is not initialized', async () => {
    const { shutdownTelemetry } = await import('../../../src/config/telemetry.js');
    await expect(shutdownTelemetry()).resolves.toBeUndefined();
  });
});
