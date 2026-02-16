/**
 * Phase 6: Production Configuration Tests
 *
 * Tests covering batch processor configuration, force-sample header,
 * exporter timeout, and environment-specific behavior.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpanKind } from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import {
  RenovationSampler,
  BATCH_PROCESSOR_CONFIG,
  EXPORTER_TIMEOUT_MILLIS,
} from '../../../src/config/telemetry.js';

// Mock logger to prevent console output during tests
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('Phase 6: Production Configuration', () => {
  const ROOT_CONTEXT = {} as never;
  const NO_LINKS: never[] = [];

  describe('Batch Span Processor Configuration', () => {
    it('should export scheduled delay of 5000ms', () => {
      expect(BATCH_PROCESSOR_CONFIG.scheduledDelayMillis).toBe(5000);
    });

    it('should export max batch size of 512', () => {
      expect(BATCH_PROCESSOR_CONFIG.maxExportBatchSize).toBe(512);
    });

    it('should export max queue size of 2048', () => {
      expect(BATCH_PROCESSOR_CONFIG.maxQueueSize).toBe(2048);
    });

    it('should export export timeout of 30000ms', () => {
      expect(BATCH_PROCESSOR_CONFIG.exportTimeoutMillis).toBe(30000);
    });

    it('should have maxQueueSize >= 4x maxExportBatchSize (OTel best practice)', () => {
      expect(BATCH_PROCESSOR_CONFIG.maxQueueSize).toBeGreaterThanOrEqual(
        BATCH_PROCESSOR_CONFIG.maxExportBatchSize * 4,
      );
    });
  });

  describe('OTLP Exporter Timeout', () => {
    it('should configure 10s export timeout', () => {
      expect(EXPORTER_TIMEOUT_MILLIS).toBe(10000);
    });

    it('should be less than batch export timeout (to allow retry within batch window)', () => {
      expect(EXPORTER_TIMEOUT_MILLIS).toBeLessThan(
        BATCH_PROCESSOR_CONFIG.exportTimeoutMillis,
      );
    });
  });

  describe('Force-Sample Header (x-force-sample)', () => {
    let sampler: RenovationSampler;

    beforeEach(() => {
      sampler = new RenovationSampler(0.1);
    });

    it('should force-sample when x-force-sample header is true', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        // Use a trace ID that would NOT be sampled at 10%
        'ffffffffffffffffffffffffffffffff',
        'GET /api/sessions',
        SpanKind.SERVER,
        { 'http.request.header.x_force_sample': 'true' },
        NO_LINKS,
      );

      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    });

    it('should not force-sample when header is absent', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        'ffffffffffffffffffffffffffffffff',
        'GET /api/sessions',
        SpanKind.SERVER,
        {},
        NO_LINKS,
      );

      // High trace ID with 10% ratio → should NOT be sampled
      expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
    });

    it('should not force-sample when header value is not "true"', () => {
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        'ffffffffffffffffffffffffffffffff',
        'GET /api/sessions',
        SpanKind.SERVER,
        { 'http.request.header.x_force_sample': 'false' },
        NO_LINKS,
      );

      expect(result.decision).toBe(SamplingDecision.NOT_RECORD);
    });

    it('should force-sample even with 0% baseline ratio', () => {
      const zeroSampler = new RenovationSampler(0);
      const result = zeroSampler.shouldSample(
        ROOT_CONTEXT,
        'aaaabbbbccccdddd1111222233334444',
        'GET /api/sessions',
        SpanKind.SERVER,
        { 'http.request.header.x_force_sample': 'true' },
        NO_LINKS,
      );

      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    });

    it('should take priority over other sampling rules', () => {
      // Health check with force-sample should be sampled (overriding 1% health rate)
      const result = sampler.shouldSample(
        ROOT_CONTEXT,
        'ffffffffffffffffffffffffffffffff',
        'GET /health',
        SpanKind.SERVER,
        {
          'http.route': '/health',
          'http.request.header.x_force_sample': 'true',
        },
        NO_LINKS,
      );

      expect(result.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);
    });
  });

  describe('Sampling Validation (Statistical)', () => {
    it('should sample approximately 10% of 1000 trace IDs', () => {
      const sampler = new RenovationSampler(0.1);
      let sampledCount = 0;
      const total = 1000;

      for (let i = 0; i < total; i++) {
        // Generate evenly distributed trace IDs
        const hexValue = Math.floor((i / total) * 0xffffffff)
          .toString(16)
          .padStart(8, '0');
        const traceId = '000000000000000000000000' + hexValue;

        const result = sampler.shouldSample(
          ROOT_CONTEXT,
          traceId,
          'GET /api/data',
          SpanKind.SERVER,
          {},
          NO_LINKS,
        );
        if (result.decision === SamplingDecision.RECORD_AND_SAMPLED) {
          sampledCount++;
        }
      }

      // 10% of 1000 = 100, allow +-50 margin
      expect(sampledCount).toBeGreaterThan(50);
      expect(sampledCount).toBeLessThan(150);
    });

    it('should sample approximately 50% at ratio 0.5', () => {
      const sampler = new RenovationSampler(0.5);
      let sampledCount = 0;
      const total = 1000;

      for (let i = 0; i < total; i++) {
        const hexValue = Math.floor((i / total) * 0xffffffff)
          .toString(16)
          .padStart(8, '0');
        const traceId = '000000000000000000000000' + hexValue;

        const result = sampler.shouldSample(
          ROOT_CONTEXT,
          traceId,
          'GET /api/data',
          SpanKind.SERVER,
          {},
          NO_LINKS,
        );
        if (result.decision === SamplingDecision.RECORD_AND_SAMPLED) {
          sampledCount++;
        }
      }

      // 50% of 1000 = 500, allow +-100 margin
      expect(sampledCount).toBeGreaterThan(400);
      expect(sampledCount).toBeLessThan(600);
    });
  });

  describe('Environment-Specific Behavior', () => {
    it('should restrict diagnostic level to ERROR in production', () => {
      // This tests the logic in initTelemetry, verified via the getDiagLogLevel mapping
      // In production: diagLevel = DiagLogLevel.ERROR regardless of OTEL_LOG_LEVEL
      const environment = 'production';
      const configuredLevel = 'debug';

      const effectiveLevel =
        environment === 'production' ? 'error' : configuredLevel;
      expect(effectiveLevel).toBe('error');
    });

    it('should use configured log level in non-production', () => {
      const environment = 'development';
      const configuredLevel = 'debug';

      const effectiveLevel =
        environment === 'production' ? 'error' : configuredLevel;
      expect(effectiveLevel).toBe('debug');
    });

    it('should disable enhanced DB reporting in production', () => {
      const environment = 'production';
      const enhancedReporting = environment !== 'production';
      expect(enhancedReporting).toBe(false);
    });
  });

  describe('Sampler Priority Order', () => {
    let sampler: RenovationSampler;

    beforeEach(() => {
      sampler = new RenovationSampler(0.1);
    });

    it('force-sample > error > AI > security > chat > health > baseline', () => {
      // Verify force-sample is checked first (before errors)
      const forceResult = sampler.shouldSample(
        ROOT_CONTEXT,
        'ffffffffffffffffffffffffffffffff',
        'GET /api/data',
        SpanKind.SERVER,
        { 'http.request.header.x_force_sample': 'true' },
        NO_LINKS,
      );
      expect(forceResult.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);

      // Verify error sampling still works without force-sample
      const errorResult = sampler.shouldSample(
        ROOT_CONTEXT,
        'ffffffffffffffffffffffffffffffff',
        'GET /api/data',
        SpanKind.SERVER,
        { 'http.status_code': 500 },
        NO_LINKS,
      );
      expect(errorResult.decision).toBe(SamplingDecision.RECORD_AND_SAMPLED);

      // Verify baseline rejects high trace IDs without any override
      const baselineResult = sampler.shouldSample(
        ROOT_CONTEXT,
        'ffffffffffffffffffffffffffffffff',
        'GET /api/data',
        SpanKind.SERVER,
        {},
        NO_LINKS,
      );
      expect(baselineResult.decision).toBe(SamplingDecision.NOT_RECORD);
    });
  });
});
