import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { renovationRooms, type RenovationRoom, type NewRenovationRoom } from '../db/schema/rooms.schema.js';
import { type Checklist } from '../validators/checklist.validators.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'RoomService' });

/**
 * Service for managing renovation rooms
 * Handles CRUD operations for renovation_rooms table
 */
export class RoomService {
  /**
   * Create a new room in a session
   */
  async createRoom(room: NewRenovationRoom): Promise<RenovationRoom> {
    logger.info('Creating room', {
      sessionId: room.sessionId,
      name: room.name,
      type: room.type,
    });

    const [created] = await db.insert(renovationRooms).values(room).returning();

    if (!created) {
      throw new Error('Failed to create room: No record returned');
    }

    logger.info('Room created successfully', {
      roomId: created.id,
      sessionId: created.sessionId,
    });

    return created;
  }

  /**
   * Get all rooms for a session
   */
  async getRoomsBySession(sessionId: string): Promise<RenovationRoom[]> {
    logger.info('Fetching rooms for session', { sessionId });

    const rooms = await db
      .select()
      .from(renovationRooms)
      .where(eq(renovationRooms.sessionId, sessionId));

    logger.info('Rooms fetched', { sessionId, count: rooms.length });
    return rooms;
  }

  /**
   * Get a single room by ID
   */
  async getRoomById(roomId: string): Promise<RenovationRoom | null> {
    const [room] = await db
      .select()
      .from(renovationRooms)
      .where(eq(renovationRooms.id, roomId));

    return room ?? null;
  }

  /**
   * Update a room
   */
  async updateRoom(
    roomId: string,
    data: Partial<Omit<NewRenovationRoom, 'id' | 'sessionId' | 'createdAt'>>
  ): Promise<RenovationRoom> {
    logger.info('Updating room', { roomId });

    const [updated] = await db
      .update(renovationRooms)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(renovationRooms.id, roomId))
      .returning();

    if (!updated) {
      throw new Error(`Room not found: ${roomId}`);
    }

    logger.info('Room updated', { roomId });
    return updated;
  }

  /**
   * Delete a room
   */
  async deleteRoom(roomId: string): Promise<void> {
    logger.info('Deleting room', { roomId });
    await db.delete(renovationRooms).where(eq(renovationRooms.id, roomId));
    logger.info('Room deleted', { roomId });
  }

  /**
   * Update the checklist for a room
   */
  async updateRoomChecklist(roomId: string, checklist: Checklist): Promise<RenovationRoom> {
    logger.info('Updating room checklist', { roomId });

    const [updated] = await db
      .update(renovationRooms)
      .set({ checklist, updatedAt: new Date() })
      .where(eq(renovationRooms.id, roomId))
      .returning();

    if (!updated) {
      throw new Error(`Room not found: ${roomId}`);
    }

    logger.info('Room checklist updated', { roomId });
    return updated;
  }
}
