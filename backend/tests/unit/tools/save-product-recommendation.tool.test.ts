import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so mocks are available inside hoisted vi.mock factories
const { mockGetRoomById, mockAddProductToRoom } = vi.hoisted(() => ({
  mockGetRoomById: vi.fn(),
  mockAddProductToRoom: vi.fn(),
}));

// Mock logger to suppress logs during tests
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock RoomService module with stable hoisted references
vi.mock('../../../src/services/room.service.js', () => ({
  RoomService: vi.fn().mockImplementation(() => ({
    getRoomById: mockGetRoomById,
  })),
}));

// Mock ProductService module with stable hoisted references
vi.mock('../../../src/services/product.service.js', () => ({
  ProductService: vi.fn().mockImplementation(() => ({
    addProductToRoom: mockAddProductToRoom,
  })),
}));

import { saveProductRecommendationTool } from '../../../src/tools/save-product-recommendation.tool.js';

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000';
const ROOM_ID = '660e8400-e29b-41d4-a716-446655440001';
const WRONG_SESSION_ID = '770e8400-e29b-41d4-a716-446655440002';
const PRODUCT_ID = '880e8400-e29b-41d4-a716-446655440003';

const mockRoom = {
  id: ROOM_ID,
  sessionId: SESSION_ID,
  name: 'Kitchen',
  type: 'kitchen',
  budget: '15000',
  requirements: null,
  checklist: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const sampleProductInput = {
  sessionId: SESSION_ID,
  roomId: ROOM_ID,
  name: 'Oak Hardwood Flooring',
  category: 'flooring',
  estimatedPrice: 4500,
  recommendationReason: 'Matches the warm scandinavian style preference and fits within budget',
};

describe('saveProductRecommendationTool', () => {
  beforeEach(() => {
    mockGetRoomById.mockReset();
    mockAddProductToRoom.mockReset();
  });

  it('should return error when room is not found', async () => {
    mockGetRoomById.mockResolvedValue(null);

    const result = await saveProductRecommendationTool.invoke(sampleProductInput);

    const parsed = JSON.parse(result) as { success: boolean; error: string };

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe(`Room not found: ${ROOM_ID}`);
    expect(mockGetRoomById).toHaveBeenCalledWith(ROOM_ID);
    expect(mockAddProductToRoom).not.toHaveBeenCalled();
  });

  it('should return error when room does not belong to session', async () => {
    mockGetRoomById.mockResolvedValue(mockRoom);

    const result = await saveProductRecommendationTool.invoke({
      ...sampleProductInput,
      sessionId: WRONG_SESSION_ID,
    });

    const parsed = JSON.parse(result) as { success: boolean; error: string };

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Room does not belong to this session');
    expect(mockAddProductToRoom).not.toHaveBeenCalled();
  });

  it('should save product and return success with productId and roomName', async () => {
    mockGetRoomById.mockResolvedValue(mockRoom);
    mockAddProductToRoom.mockResolvedValue({
      id: PRODUCT_ID,
      roomId: ROOM_ID,
      name: 'Oak Hardwood Flooring',
      category: 'flooring',
      description: null,
      estimatedPrice: '4500',
      currency: 'USD',
      productUrl: null,
      imageUrl: null,
      recommendationReason: sampleProductInput.recommendationReason,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await saveProductRecommendationTool.invoke(sampleProductInput);

    const parsed = JSON.parse(result) as {
      success: boolean;
      productId: string;
      roomName: string;
      message: string;
    };

    expect(parsed.success).toBe(true);
    expect(parsed.productId).toBe(PRODUCT_ID);
    expect(parsed.roomName).toBe('Kitchen');
    expect(parsed.message).toBe('Saved product "Oak Hardwood Flooring" to Kitchen');

    expect(mockAddProductToRoom).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      name: 'Oak Hardwood Flooring',
      category: 'flooring',
      description: null,
      estimatedPrice: '4500',
      productUrl: null,
      imageUrl: null,
      recommendationReason: sampleProductInput.recommendationReason,
      metadata: null,
    });
  });

  it('should pass optional fields when provided', async () => {
    mockGetRoomById.mockResolvedValue(mockRoom);
    mockAddProductToRoom.mockResolvedValue({
      id: PRODUCT_ID,
      roomId: ROOM_ID,
      name: 'Oak Hardwood Flooring',
      category: 'flooring',
      description: 'Premium oak hardwood',
      estimatedPrice: '4500',
      currency: 'USD',
      productUrl: 'https://example.com/product',
      imageUrl: 'https://example.com/image.jpg',
      recommendationReason: sampleProductInput.recommendationReason,
      metadata: { brand: 'FloorCo' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await saveProductRecommendationTool.invoke({
      ...sampleProductInput,
      description: 'Premium oak hardwood',
      productUrl: 'https://example.com/product',
      imageUrl: 'https://example.com/image.jpg',
      metadata: { brand: 'FloorCo' },
    });

    const parsed = JSON.parse(result) as { success: boolean; productId: string };

    expect(parsed.success).toBe(true);
    expect(parsed.productId).toBe(PRODUCT_ID);

    expect(mockAddProductToRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Premium oak hardwood',
        productUrl: 'https://example.com/product',
        imageUrl: 'https://example.com/image.jpg',
        metadata: { brand: 'FloorCo' },
      })
    );
  });

  it('should return failure JSON when service throws', async () => {
    mockGetRoomById.mockRejectedValue(new Error('Database connection lost'));

    const result = await saveProductRecommendationTool.invoke(sampleProductInput);

    const parsed = JSON.parse(result) as { success: boolean; error: string };

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe('Failed to save product recommendation');
  });
});
