import { trace } from '@opentelemetry/api';
import type { Server as SocketIOServer } from 'socket.io';
import type { Logger } from '../utils/logger.js';
import type { AgentEvent } from './types.js';

/**
 * AgentEventEmitter — session-scoped event fan-out.
 *
 * Every agent event is multiplexed to three destinations:
 * 1. Socket.io -> frontend (session room)
 * 2. Logger -> structured logs
 * 3. OTel -> span events (if active span exists)
 *
 * Created per processMessage() call, not a singleton.
 */
export class AgentEventEmitter {
  constructor(
    private readonly io: SocketIOServer,
    private readonly logger: Logger,
    private readonly sessionId: string,
  ) {}

  emit(event: AgentEvent): void {
    // 1. Socket.io -> frontend (session room)
    this.io.to(this.sessionId).emit(event.type, event);

    // 2. Logger -> structured logs (error events at error level)
    if (event.type === 'agent:error') {
      this.logger.error(event.type, new Error(event.error), event as unknown as Record<string, unknown>);
    } else {
      this.logger.info(event.type, event as unknown as Record<string, unknown>);
    }

    // 3. OTel -> span event (if active span)
    const span = trace.getActiveSpan();
    if (span) {
      const attrs: Record<string, string | number | boolean> = { 'agent.event.type': event.type };
      if ('phase' in event && event.phase) attrs['agent.event.phase'] = event.phase;
      if ('tool' in event && event.tool) attrs['agent.event.tool'] = event.tool;
      if ('sessionId' in event && event.sessionId) attrs['agent.event.sessionId'] = event.sessionId;
      span.addEvent(event.type, attrs);
    }
  }
}
