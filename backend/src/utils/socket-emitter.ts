import type { Server } from 'socket.io';

/**
 * Get the global Socket.io server instance.
 * Returns null if Socket.io has not been initialized yet.
 */
export function getSocketServer(): Server | null {
  return ((global as Record<string, unknown>).io as Server | undefined) ?? null;
}

/**
 * Emit an event to all sockets in a session room.
 * No-op if Socket.io is not initialized.
 */
export function emitToSession(sessionId: string, event: string, data: unknown): void {
  const io = getSocketServer();
  io?.to(`session:${sessionId}`).emit(event, data);
}
