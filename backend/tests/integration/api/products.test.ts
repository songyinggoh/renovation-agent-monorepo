import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { getApp } from './setup.js';
import { ProductService } from '../../../src/services/product.service.js';

// Mock the product service
vi.mock('../../../src/services/product.service.js', () => ({
  ProductService: vi.fn().mockImplementation(() => ({
    searchCatalogProducts: vi.fn(),
    getProductsByRoom: vi.fn(),
  })),
}));

let app: Application;
let mockProductService: {
  searchCatalogProducts: ReturnType<typeof vi.fn>;
  getProductsByRoom: ReturnType<typeof vi.fn>;
};

beforeAll(async () => {
  app = await getApp();
  // Capture the instance created by the controller during module load
  const instance = vi.mocked(ProductService).mock.results.find(r => r.type === 'return');
  if (instance) {
    mockProductService = instance.value as typeof mockProductService;
  }
});

beforeEach(() => {
  // Reset individual method mocks without clearing constructor results
  mockProductService.searchCatalogProducts.mockReset();
  mockProductService.getProductsByRoom.mockReset();
});

const sampleProducts = [
  {
    id: 'prod-1',
    name: 'Concrete Floor Tile',
    category: 'flooring',
    estimatedPrice: '45.00',
    metadata: { style: ['modern-minimalist'], roomTypes: ['kitchen'] },
  },
  {
    id: 'prod-2',
    name: 'Oak Hardwood',
    category: 'flooring',
    estimatedPrice: '120.00',
    metadata: { style: ['warm-scandinavian'], roomTypes: ['living-room'] },
  },
];

describe('Product Endpoints', () => {
  describe('GET /api/products/search', () => {
    it('should return products with no filters', async () => {
      mockProductService.searchCatalogProducts.mockResolvedValue(sampleProducts);

      const res = await request(app)
        .get('/api/products/search')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(2);
      expect(res.body.count).toBe(2);
    });

    it('should pass filters to the service', async () => {
      mockProductService.searchCatalogProducts.mockResolvedValue([sampleProducts[0]]);

      const res = await request(app)
        .get('/api/products/search?style=modern&category=flooring')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(1);
      expect(mockProductService.searchCatalogProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          style: 'modern',
          category: 'flooring',
        }),
      );
    });

    it('should return 400 for invalid maxPrice', async () => {
      const res = await request(app)
        .get('/api/products/search?maxPrice=abc')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });

    it('should return 400 for negative maxPrice', async () => {
      const res = await request(app)
        .get('/api/products/search?maxPrice=-10')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });
  });

  describe('GET /api/rooms/:roomId/products', () => {
    it('should return products for a room', async () => {
      mockProductService.getProductsByRoom.mockResolvedValue(sampleProducts);

      const res = await request(app)
        .get('/api/rooms/room-123/products')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(2);
      expect(res.body.count).toBe(2);
    });

    it('should return empty array for room with no products', async () => {
      mockProductService.getProductsByRoom.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/rooms/room-999/products')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(0);
      expect(res.body.count).toBe(0);
    });
  });
});
