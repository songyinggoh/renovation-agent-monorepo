/**
 * OpenTelemetry SDK initialization (Phase 1 + Phase 2)
 *
 * MUST be imported before all other modules in server.ts
 * to ensure auto-instrumentation patches are applied early.
 *
 * Phase 1: Core SDK setup with OTLP exporter and custom sampler
 * Phase 2: HTTP & Database auto-instrumentation with requestHook for custom attributes
 *
 * Gracefully no-ops when OTEL_ENABLED=false or in test environment.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import type { ExpressInstrumentationConfig } from '@opentelemetry/instrumentation-express';
import {
  type Sampler,
  SamplingDecision,
  type SamplingResult,
} from '@opentelemetry/sdk-trace-base';
import {
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  context,
  trace,
  type SpanKind,
  type Attributes,
  type Link,
  type Context,
} from '@opentelemetry/api';
import type { Request } from 'express';

import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'Telemetry' });

let sdk: NodeSDK | null = null;

/**
 * Custom sampler implementing the IA doc sampling strategy (Phase 1):
 * - 100% for errors, AI calls, security events, chat messages
 * - 1% for health checks
 * - Configurable baseline (default 10%) for everything else
 */
export class RenovationSampler implements Sampler {
  private baselineRatio: number;

  constructor(baselineRatio: number = 0.1) {
    this.baselineRatio = Math.max(0, Math.min(1, baselineRatio));
  }

  shouldSample(
    _parentContext: Context,
    traceId: string,
    spanName: string,
    _spanKind: SpanKind,
    attributes: Attributes,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _links: Link[],
  ): SamplingResult {
    // Always sample errors (5xx)
    if (attributes['http.status_code'] && Number(attributes['http.status_code']) >= 500) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Always sample AI operations
    if (spanName.startsWith('ai.') || spanName.includes('gemini') || spanName.includes('langgraph')) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Always sample security events
    if (attributes['security.prompt_injection'] === true) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Always sample Socket.io chat messages (core user journey)
    if (spanName.startsWith('socket.io') && spanName.includes('chat:user_message')) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Low sampling for health checks (high volume, low value)
    const httpRoute = attributes['http.route'] as string | undefined;
    if (httpRoute?.startsWith('/health')) {
      return this.ratioSample(traceId, 0.01);
    }

    // Default: baseline ratio sampling
    return this.ratioSample(traceId, this.baselineRatio);
  }

  /**
   * Deterministic ratio-based sampling using trace ID.
   * Ensures consistent sampling decisions for the same trace across services.
   */
  private ratioSample(traceId: string, ratio: number): SamplingResult {
    if (ratio >= 1) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }
    if (ratio <= 0) {
      return { decision: SamplingDecision.NOT_RECORD };
    }

    // Use last 8 hex chars of trace ID for deterministic decision
    const traceIdSuffix = traceId.slice(-8);
    const threshold = Math.floor(ratio * 0xffffffff);
    const traceValue = parseInt(traceIdSuffix, 16);

    return {
      decision: traceValue < threshold
        ? SamplingDecision.RECORD_AND_SAMPLED
        : SamplingDecision.NOT_RECORD,
    };
  }

  toString(): string {
    return `RenovationSampler{baselineRatio=${this.baselineRatio}}`;
  }
}

/**
 * Phase 2: requestHook for Express instrumentation
 *
 * Injects custom attributes into Express HTTP spans:
 * - request.id (from X-Request-ID header set by request-id.middleware.ts)
 * - session.id (from route params)
 * - user.id (from auth middleware)
 * - room.id (from route params)
 * - renovation.phase (from session context, if available)
 * - service.name, deployment.environment (universal context from IA doc section 1.1)
 */
function createExpressRequestHook(): ExpressInstrumentationConfig['requestHook'] {
  return (span, info): void => {
    try {
      // Phase 2.1: Inject request.id from request headers
      // The request-id.middleware.ts sets X-Request-ID header
      const requestId = info.request.headers['x-request-id'];
      if (requestId && typeof requestId === 'string') {
        span.setAttribute('request.id', requestId);
      }

      // Phase 2.2: Inject session.id and room.id from route params
      // Use intersection type to add custom properties without extending Request
      type RequestWithExtras = Request & {
        params?: Record<string, string>;
        user?: { id: string };
        session?: { phase: string };
      };
      const req = info.request as RequestWithExtras;

      if (req.params) {
        if (req.params.sessionId) {
          span.setAttribute('session.id', req.params.sessionId);
        }
        if (req.params.roomId) {
          span.setAttribute('room.id', req.params.roomId);
        }
      }

      // Phase 2.3: Inject user.id from auth middleware (req.user set by auth.middleware.ts)
      if (req.user?.id) {
        span.setAttribute('user.id', req.user.id);
      }

      // Phase 2.4: Inject renovation.phase if available in request context
      // This would be set by controllers after DB lookup
      if (req.session?.phase) {
        span.setAttribute('renovation.phase', req.session.phase);
      }

      // Phase 2.5: Add universal context attributes (IA doc section 1.1)
      span.setAttribute('service.name', process.env.OTEL_SERVICE_NAME || 'renovation-agent-backend');
      span.setAttribute('deployment.environment', process.env.NODE_ENV || 'development');
    } catch (error) {
      // requestHook should never throw and break request processing
      logger.warn('Failed to inject custom span attributes', undefined, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

/**
 * Phase 2: Extract table name from SQL statement for db.sql.table attribute
 * Helper for potential custom pg instrumentation hooks
 */
export function extractTableName(sql: string): string | undefined {
  if (!sql) return undefined;

  // Try FROM clause (SELECT)
  let match = sql.match(/FROM\s+(\w+)/i);
  if (match) return match[1];

  // Try INTO clause (INSERT)
  match = sql.match(/INTO\s+(\w+)/i);
  if (match) return match[1];

  // Try UPDATE table
  match = sql.match(/UPDATE\s+(\w+)/i);
  if (match) return match[1];

  return undefined;
}

/**
 * Map OTEL_LOG_LEVEL env var to DiagLogLevel
 */
function getDiagLogLevel(level: string): DiagLogLevel {
  const levels: Record<string, DiagLogLevel> = {
    none: DiagLogLevel.NONE,
    error: DiagLogLevel.ERROR,
    warn: DiagLogLevel.WARN,
    info: DiagLogLevel.INFO,
    debug: DiagLogLevel.DEBUG,
    verbose: DiagLogLevel.VERBOSE,
    all: DiagLogLevel.ALL,
  };
  return levels[level] ?? DiagLogLevel.INFO;
}

/**
 * Initialize OpenTelemetry SDK (Phase 1 + Phase 2)
 *
 * Call once during application startup, before any other imports.
 * No-ops gracefully when OTEL_ENABLED=false or in test environment.
 */
export function initTelemetry(): void {
  // Read from process.env directly to avoid circular dependencies
  // (env.ts imports logger.ts, telemetry needs to load first)
  const otelEnabled = process.env.OTEL_ENABLED !== 'false';
  const isTest = process.env.NODE_ENV === 'test';

  if (!otelEnabled || isTest) {
    logger.info('OpenTelemetry disabled', {
      otelEnabled,
      isTest,
    });
    return;
  }

  const serviceName = process.env.OTEL_SERVICE_NAME || 'renovation-agent-backend';
  const environment = process.env.NODE_ENV || 'development';
  const parsedSamplerArg = parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '0.1');
  const samplerArg = Number.isNaN(parsedSamplerArg) ? 0.1 : parsedSamplerArg;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const logLevel = process.env.OTEL_LOG_LEVEL || 'info';

  // Set diagnostic logger - restrict to ERROR in production to prevent internal state leakage
  const diagLevel = environment === 'production'
    ? DiagLogLevel.ERROR
    : getDiagLogLevel(logLevel);
  diag.setLogger(new DiagConsoleLogger(), diagLevel);

  // Configure OTLP exporter (sends traces to Jaeger/Datadog/Honeycomb)
  const traceExporter = new OTLPTraceExporter({
    ...(endpoint && { url: `${endpoint}/v1/traces` }),
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
      ? parseHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS)
      : undefined,
  });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    }),
    traceExporter,
    sampler: new RenovationSampler(samplerArg),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Phase 2: Enable Express instrumentation with custom requestHook
        '@opentelemetry/instrumentation-express': {
          enabled: true,
          requestHook: createExpressRequestHook(),
        },
        // Phase 2: Enable HTTP instrumentation with header sanitization
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          // Prevent sensitive headers from appearing in traces
          headersToSpanAttributes: {
            server: {
              requestHeaders: ['content-type', 'accept', 'user-agent'],
              responseHeaders: ['content-type'],
            },
          },
        },
        // Phase 2: Enable pg (PostgreSQL) instrumentation
        // enhancedDatabaseReporting disabled in production to prevent PII leak in query parameters
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
          enhancedDatabaseReporting: environment !== 'production',
        },
        // Phase 1: Enable ioredis instrumentation
        '@opentelemetry/instrumentation-ioredis': {
          enabled: true,
        },
        // Disable instrumentations we don't need (reduce overhead)
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  });

  sdk.start();

  logger.info('OpenTelemetry initialized (Phase 1 + Phase 2)', {
    serviceName,
    environment,
    samplerArg,
    hasEndpoint: !!endpoint,
    endpoint: endpoint || 'default (localhost:4318)',
    phase2Features: {
      expressRequestHook: true,
      enhancedDatabaseReporting: environment !== 'production',
      customAttributes: ['request.id', 'session.id', 'user.id', 'room.id', 'renovation.phase'],
    },
  });
}

/**
 * Gracefully shutdown OpenTelemetry SDK
 *
 * Flushes remaining spans before process exit.
 * Safe to call multiple times (no-ops if not initialized).
 */
export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) {
    return;
  }

  try {
    await sdk.shutdown();
    logger.info('OpenTelemetry shut down successfully');
  } catch (error) {
    logger.error('OpenTelemetry shutdown failed', error as Error);
  }
}

/**
 * Parse OTLP headers from env var format: "key1=value1,key2=value2"
 */
function parseHeaders(headersStr: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const pair of headersStr.split(',')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      headers[pair.slice(0, eqIdx).trim()] = pair.slice(eqIdx + 1).trim();
    }
  }
  return headers;
}

/**
 * Check if telemetry SDK is active
 */
export function isTelemetryActive(): boolean {
  return sdk !== null;
}

// Re-export OpenTelemetry API for use in custom instrumentation (Phase 3+)
export { context, trace };
