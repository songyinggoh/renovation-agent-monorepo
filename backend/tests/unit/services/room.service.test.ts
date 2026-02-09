import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { RoomService } from '../../../src/services/room.service.js';
import { db } from '../../../src/db/index.js';
import { renovationRooms } from '../../../src/db/schema/rooms.schema.js';

// Mock the database module
vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock logger to suppress logs during tests
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

describe('RoomService', () => {
  let roomService: RoomService;

  const mockRoom = {
    id: 'room-id-1',
    sessionId: 'session-id-1',
    name: 'Kitchen',
    type: 'kitchen',
    budget: '15000.00',
    requirements: { dimensions: '10x12', style: 'modern' },
    checklist: null,
    plan: null,
    renderUrls: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    roomService = new RoomService();
    vi.clearAllMocks();
  });

  describe('createRoom', () => {
    it('should create a room and return the created record', async () => {
      const newRoom = {
        sessionId: 'session-id-1',
        name: 'Kitchen',
        type: 'kitchen',
        budget: '15000.00',
      };

      const mockReturning = vi.fn().mockResolvedValue([mockRoom]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      (db.insert as Mock).mockReturnValue({ values: mockValues });

      const result = await roomService.createRoom(newRoom);

      expect(db.insert).toHaveBeenCalledWith(renovationRooms);
      expect(mockValues).toHaveBeenCalledWith(newRoom);
      expect(mockReturning).toHaveBeenCalled();
      expect(result).toEqual(mockRoom);
    });

    it('should throw error if no record is returned after insert', async () => {
      const newRoom = {
        sessionId: 'session-id-1',
        name: 'Kitchen',
        type: 'kitchen',
      };

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      (db.insert as Mock).mockReturnValue({ values: mockValues });

      await expect(roomService.createRoom(newRoom)).rejects.toThrow(
        'Failed to create room: No record returned'
      );
    });
  });

  describe('getRoomsBySession', () => {
    it('should return all rooms for a session', async () => {
      const mockRooms = [
        mockRoom,
        { ...mockRoom, id: 'room-id-2', name: 'Living Room', type: 'living' },
      ];

      const mockWhere = vi.fn().mockResolvedValue(mockRooms);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await roomService.getRoomsBySession('session-id-1');

      expect(db.select).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(renovationRooms);
      expect(result).toEqual(mockRooms);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when session has no rooms', async () => {
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await roomService.getRoomsBySession('empty-session');

      expect(result).toEqual([]);
    });
  });

  describe('getRoomById', () => {
    it('should return a room when found by id', async () => {
      const mockWhere = vi.fn().mockResolvedValue([mockRoom]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await roomService.getRoomById('room-id-1');

      expect(result).toEqual(mockRoom);
    });

    it('should return null when room is not found', async () => {
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await roomService.getRoomById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('updateRoom', () => {
    it('should update a room and return the updated record', async () => {
      const updatedRoom = { ...mockRoom, name: 'Updated Kitchen', updatedAt: new Date('2024-02-01') };

      const mockReturning = vi.fn().mockResolvedValue([updatedRoom]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      (db.update as Mock).mockReturnValue({ set: mockSet });

      const result = await roomService.updateRoom('room-id-1', { name: 'Updated Kitchen' });

      expect(db.update).toHaveBeenCalledWith(renovationRooms);
      expect(result).toEqual(updatedRoom);
    });

    it('should throw "Room not found" when update returns no record', async () => {
      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      (db.update as Mock).mockReturnValue({ set: mockSet });

      await expect(roomService.updateRoom('nonexistent-id', { name: 'Test' })).rejects.toThrow(
        'Room not found: nonexistent-id'
      );
    });
  });

  describe('deleteRoom', () => {
    it('should delete a room without throwing', async () => {
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      (db.delete as Mock).mockReturnValue({ where: mockWhere });

      await expect(roomService.deleteRoom('room-id-1')).resolves.toBeUndefined();

      expect(db.delete).toHaveBeenCalledWith(renovationRooms);
    });

    it('should throw when database delete fails', async () => {
      const mockWhere = vi.fn().mockRejectedValue(new Error('Database error'));
      (db.delete as Mock).mockReturnValue({ where: mockWhere });

      await expect(roomService.deleteRoom('room-id-1')).rejects.toThrow('Database error');
    });
  });

  describe('updateRoomChecklist', () => {
    it('should update the checklist and return the updated room', async () => {
      const checklist = [
        { item: 'Remove old cabinets', completed: false },
        { item: 'Install new countertop', completed: false },
      ];
      const updatedRoom = { ...mockRoom, checklist, updatedAt: new Date('2024-02-01') };

      const mockReturning = vi.fn().mockResolvedValue([updatedRoom]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      (db.update as Mock).mockReturnValue({ set: mockSet });

      const result = await roomService.updateRoomChecklist('room-id-1', checklist);

      expect(db.update).toHaveBeenCalledWith(renovationRooms);
      expect(result).toEqual(updatedRoom);
      expect(result.checklist).toEqual(checklist);
    });

    it('should throw "Room not found" when checklist update returns no record', async () => {
      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ returning: mockReturning });
      const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
      (db.update as Mock).mockReturnValue({ set: mockSet });

      await expect(
        roomService.updateRoomChecklist('nonexistent-id', [{ item: 'Test', completed: false }])
      ).rejects.toThrow('Room not found: nonexistent-id');
    });
  });
});
