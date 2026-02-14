/**
 * Socket.io OpenTelemetry Tracing Middleware (Phase IV - Phase 3)
 *
 * Creates custom spans for Socket.io events with attributes
 * from the IA doc (Section 1.3 Socket.io Layer).
 *
 * CRITICAL: Message content is NEVER included in trace attributes.
 * Only content length is recorded (privacy by design, IA doc Section 7).
 */

import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';
import type { Socket } from 'socket.io';
import type { AuthenticatedSocket } from '../types/socket.js';

const tracer = trace.getTracer('renovation-agent-socketio', '1.0.0');

/**
 * Set common Socket.io span attributes (IA doc Section 1.3)
 */
function setSocketAttributes(span: Span, socket: Socket, event: string): void {
  span.setAttribute('messaging.system', 'socket.io');
  span.setAttribute('socket.id', socket.id);
  span.setAttribute('socket.event', event);
  span.setAttribute('socket.transport', socket.conn?.transport?.name ?? 'unknown');

  // Add user context if authenticated
  const user = (socket as AuthenticatedSocket).user;
  if (user?.id) {
    span.setAttribute('user.id', user.id);
  }
}

/**
 * Create a traced wrapper for a Socket.io event handler.
 *
 * Wraps the original handler in an OpenTelemetry span with
 * messaging attributes per the IA doc.
 */
export function traceSocketEvent<T extends unknown[]>(
  socket: Socket,
  event: string,
  handler: (...args: T) => void | Promise<void>,
): (...args: T) => void {
  return (...args: T): void => {
    tracer.startActiveSpan(`socket.io ${event}`, (span) => {
      try {
        setSocketAttributes(span, socket, event);
        span.setAttribute('messaging.operation', 'receive');

        const result = handler(...args);

        // Handle async handlers
        if (result instanceof Promise) {
          result
            .then(() => {
              span.setStatus({ code: SpanStatusCode.OK });
            })
            .catch((error: unknown) => {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: error instanceof Error ? error.message : String(error),
              });
              span.recordException(error instanceof Error ? error : new Error(String(error)));
            })
            .finally(() => {
              span.end();
            });
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
        }
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.end();
        throw error;
      }
    });
  };
}

/**
 * Trace a Socket.io connection event.
 * Creates a span for the connection lifecycle.
 */
export function traceConnection(socket: Socket): void {
  const span = tracer.startSpan('socket.io connection');
  setSocketAttributes(span, socket, 'connection');
  span.setAttribute('messaging.operation', 'connection');

  // Get rooms the socket is in (after connection)
  const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
  if (rooms.length > 0) {
    span.setAttribute('socket.room', rooms.join(','));
  }

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Trace a Socket.io disconnect event.
 */
export function traceDisconnect(socket: Socket, reason: string): void {
  const span = tracer.startSpan('socket.io disconnect');
  setSocketAttributes(span, socket, 'disconnect');
  span.setAttribute('messaging.operation', 'disconnect');
  span.setAttribute('socket.disconnect_reason', reason);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Add session and content attributes to the current active span.
 * Called from within a traced event handler to enrich the span.
 *
 * CRITICAL: Only content LENGTH is recorded, never content itself.
 */
export function addMessageAttributes(
  sessionId: string,
  contentLength: number,
  extra?: Record<string, string | number | boolean>,
): void {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return;

  activeSpan.setAttribute('session.id', sessionId);
  activeSpan.setAttribute('socket.room', `session:${sessionId}`);
  activeSpan.setAttribute('socket.content_length', contentLength);

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      activeSpan.setAttribute(key, value);
    }
  }
}

/**
 * Add session join attributes to the current active span.
 */
export function addJoinAttributes(sessionId: string): void {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return;

  activeSpan.setAttribute('session.id', sessionId);
  activeSpan.setAttribute('socket.room', `session:${sessionId}`);
}

/**
 * Record a rate limit event on the current active span.
 */
export function addRateLimitAttributes(exceeded: boolean, tokensRemaining?: number): void {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return;

  activeSpan.setAttribute('rate_limit.exceeded', exceeded);
  if (tokensRemaining !== undefined) {
    activeSpan.setAttribute('rate_limit.tokens_remaining', tokensRemaining);
  }
}

/**
 * Record security validation attributes on the current active span.
 */
export function addSecurityAttributes(
  promptInjection: boolean,
  validationPassed: boolean,
): void {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return;

  activeSpan.setAttribute('security.prompt_injection', promptInjection);
  activeSpan.setAttribute('validation.passed', validationPassed);
}
