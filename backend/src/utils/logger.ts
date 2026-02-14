// A simple structured logger to be used across the application.
// Phase IV: Injects trace_id and span_id for log-trace correlation.

import { getRequestId } from '../middleware/request-id.middleware.js';
import { trace, isSpanContextValid } from '@opentelemetry/api';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogMetadata {
  [key: string]: unknown;
}

interface LogObject extends LogMetadata {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  requestId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export class Logger {
  private serviceName: string;

  constructor(options: { serviceName: string }) {
    this.serviceName = options.serviceName;
  }

  private log(level: LogLevel, message: string, error?: Error, metadata?: LogMetadata) {
    const requestId = getRequestId();
    const traceContext = getTraceContext();

    const logObject: LogObject = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      ...(requestId && { requestId }),
      ...traceContext,
      ...metadata,
    };

    if (error) {
      logObject.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    const output = JSON.stringify(logObject, null, 2);

    switch (level) {
      case 'DEBUG':
        console.debug(output);
        break;
      case 'INFO':
        console.info(output);
        break;
      case 'WARN':
        console.warn(output);
        break;
      case 'ERROR':
        console.error(output);
        break;
    }
  }

  debug(message: string, metadata?: LogMetadata) {
    this.log('DEBUG', message, undefined, metadata);
  }

  info(message: string, metadata?: LogMetadata) {
    this.log('INFO', message, undefined, metadata);
  }

  warn(message: string, error?: Error, metadata?: LogMetadata) {
    this.log('WARN', message, error, metadata);
  }

  error(message: string, error: Error, metadata?: LogMetadata) {
    this.log('ERROR', message, error, metadata);
  }
}

/**
 * Extract trace_id and span_id from the active OpenTelemetry span.
 * Returns empty object when no valid span is active (graceful no-op).
 */
function getTraceContext(): { trace_id?: string; span_id?: string } {
  try {
    const activeSpan = trace.getActiveSpan();
    if (!activeSpan) return {};

    const spanContext = activeSpan.spanContext();
    if (!isSpanContextValid(spanContext)) return {};

    return {
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
    };
  } catch {
    return {};
  }
}
