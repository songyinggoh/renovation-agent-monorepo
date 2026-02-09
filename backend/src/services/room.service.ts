import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { renovationRooms, type RenovationRoom, type NewRenovationRoom } from '../db/schema/rooms.schema.js';
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

    try {
      const [created] = await db.insert(renovationRooms).values(room).returning();

      if (!created) {
        throw new Error('Failed to create room: No record returned');
      }

      logger.info('Room created successfully', {
        roomId: created.id,
        sessionId: created.sessionId,
      });

      return created;
    } catch (error) {
      logger.error('Failed to create room', error as Error, {
        sessionId: room.sessionId,
      });
      throw error;
    }
  }

  /**
   * Get all rooms for a session
   */
  async getRoomsBySession(sessionId: string): Promise<RenovationRoom[]> {
    logger.info('Fetching rooms for session', { sessionId });

    try {
      const rooms = await db
        .select()
        .from(renovationRooms)
        .where(eq(renovationRooms.sessionId, sessionId));

      logger.info('Rooms fetched', { sessionId, count: rooms.length });
      return rooms;
    } catch (error) {
      logger.error('Failed to fetch rooms', error as Error, { sessionId });
      throw error;
    }
  }

  /**
   * Get a single room by ID
   */
  async getRoomById(roomId: string): Promise<RenovationRoom | null> {
    logger.info('Fetching room', { roomId });

    try {
      const [room] = await db
        .select()
        .from(renovationRooms)
        .where(eq(renovationRooms.id, roomId));

      return room ?? null;
    } catch (error) {
      logger.error('Failed to fetch room', error as Error, { roomId });
      throw error;
    }
  }

  /**
   * Update a room
   */
  async updateRoom(
    roomId: string,
    data: Partial<Omit<NewRenovationRoom, 'id' | 'sessionId' | 'createdAt'>>
  ): Promise<RenovationRoom> {
    logger.info('Updating room', { roomId });

    try {
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
    } catch (error) {
      logger.error('Failed to update room', error as Error, { roomId });
      throw error;
    }
  }

  /**
   * Delete a room
   */
  async deleteRoom(roomId: string): Promise<void> {
    logger.info('Deleting room', { roomId });

    try {
      await db.delete(renovationRooms).where(eq(renovationRooms.id, roomId));
      logger.info('Room deleted', { roomId });
    } catch (error) {
      logger.error('Failed to delete room', error as Error, { roomId });
      throw error;
    }
  }

  /**
   * Update the checklist for a room
   */
  async updateRoomChecklist(roomId: string, checklist: unknown): Promise<RenovationRoom> {
    logger.info('Updating room checklist', { roomId });

    try {
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
    } catch (error) {
      logger.error('Failed to update room checklist', error as Error, { roomId });
      throw error;
    }
  }
}
