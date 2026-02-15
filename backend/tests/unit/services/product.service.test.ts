import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { ProductService } from '../../../src/services/product.service.js';
import { db } from '../../../src/db/index.js';
import { productRecommendations } from '../../../src/db/schema/products.schema.js';

// Mock the database module
vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
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

// Mock the data module with test products
vi.mock('../../../src/data/index.js', () => ({
  SEED_PRODUCTS: [
    {
      name: 'Oak Floor',
      category: 'flooring',
      description: 'Hardwood floor',
      estimatedPrice: '8.50',
      currency: 'USD',
      productUrl: null,
      imageUrl: null,
      recommendationReason: 'Good',
      metadata: {
        brand: 'TestBrand',
        style: ['modern-minimalist', 'warm-scandinavian'],
        roomTypes: ['living', 'bedroom'],
        material: 'oak',
      },
    },
    {
      name: 'Pendant Light',
      category: 'lighting',
      description: 'Modern pendant',
      estimatedPrice: '150',
      currency: 'USD',
      productUrl: null,
      imageUrl: null,
      recommendationReason: 'Nice',
      metadata: {
        brand: 'LightCo',
        style: ['modern-minimalist'],
        roomTypes: ['kitchen', 'dining'],
      },
    },
    {
      name: 'Leather Sofa',
      category: 'furniture',
      description: 'Italian leather',
      estimatedPrice: '2000',
      currency: 'USD',
      productUrl: null,
      imageUrl: null,
      recommendationReason: 'Luxury',
      metadata: {
        brand: 'SofaCo',
        style: ['industrial-loft'],
        roomTypes: ['living'],
      },
    },
  ],
}));

describe('ProductService', () => {
  let productService: ProductService;

  beforeEach(() => {
    productService = new ProductService();
    vi.clearAllMocks();
  });

  describe('searchSeedProducts', () => {
    it('should return all products when no filters are applied', () => {
      const result = productService.searchSeedProducts({});

      expect(result).toHaveLength(3);
    });

    it('should filter by category', () => {
      const result = productService.searchSeedProducts({ category: 'flooring' });

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Oak Floor');
    });

    it('should filter by style slug', () => {
      const result = productService.searchSeedProducts({ style: 'modern-minimalist' });

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.name)).toContain('Oak Floor');
      expect(result.map((p) => p.name)).toContain('Pendant Light');
    });

    it('should filter by maxPrice', () => {
      const result = productService.searchSeedProducts({ maxPrice: 100 });

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Oak Floor');
    });

    it('should filter by roomType', () => {
      const result = productService.searchSeedProducts({ roomType: 'kitchen' });

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Pendant Light');
    });

    it('should filter by text query matching name', () => {
      const result = productService.searchSeedProducts({ query: 'leather' });

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Leather Sofa');
    });

    it('should filter by text query matching description', () => {
      const result = productService.searchSeedProducts({ query: 'hardwood' });

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Oak Floor');
    });

    it('should combine multiple filters', () => {
      const result = productService.searchSeedProducts({
        category: 'flooring',
        style: 'modern-minimalist',
        maxPrice: 10,
        roomType: 'living',
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Oak Floor');
    });

    it('should return empty array when no products match filters', () => {
      const result = productService.searchSeedProducts({
        category: 'flooring',
        roomType: 'kitchen',
      });

      expect(result).toEqual([]);
    });

    it('should handle style filter with partial match', () => {
      const result = productService.searchSeedProducts({ style: 'industrial' });

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Leather Sofa');
    });
  });

  describe('getProductsByRoom', () => {
    it('should return products for a given room', async () => {
      const mockProducts = [
        {
          id: 'prod-1',
          roomId: 'room-1',
          name: 'Oak Floor',
          category: 'flooring',
          description: 'Hardwood floor',
          estimatedPrice: '8.50',
          currency: 'USD',
          productUrl: null,
          imageUrl: null,
          recommendationReason: 'Good',
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockWhere = vi.fn().mockResolvedValue(mockProducts);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await productService.getProductsByRoom('room-1');

      expect(db.select).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(productRecommendations);
      expect(result).toEqual(mockProducts);
    });

    it('should return empty array when room has no products', async () => {
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await productService.getProductsByRoom('empty-room');

      expect(result).toEqual([]);
    });
  });

  describe('searchCatalogProducts', () => {
    const mockCatalogProduct = {
      id: 'cat-1',
      name: 'Oak Floor',
      category: 'flooring',
      description: 'Hardwood floor',
      estimatedPrice: '8.50',
      currency: 'USD',
      productUrl: null,
      imageUrl: null,
      recommendationReason: 'Good',
      metadata: {
        brand: 'TestBrand',
        style: ['modern-minimalist'],
        roomTypes: ['living'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return products from DB when catalog is populated', async () => {
      const mockLimit = vi.fn().mockResolvedValue([mockCatalogProduct]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await productService.searchCatalogProducts({ category: 'flooring' });

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Oak Floor');
    });

    it('should fall back to in-memory when DB query throws', async () => {
      const mockFrom = vi.fn().mockImplementation(() => {
        throw new Error('relation does not exist');
      });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await productService.searchCatalogProducts({ category: 'flooring' });

      // Falls back to in-memory SEED_PRODUCTS (mocked with 3 items, 1 flooring)
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Oak Floor');
    });

    it('should fall back to in-memory when catalog table is empty', async () => {
      // First query returns empty results
      const mockLimit1 = vi.fn().mockResolvedValue([]);
      const mockWhere1 = vi.fn().mockReturnValue({ limit: mockLimit1 });
      const mockFrom1 = vi.fn().mockReturnValue({ where: mockWhere1 });

      // Second query (count check) also returns empty
      const mockLimit2 = vi.fn().mockResolvedValue([]);
      const mockFrom2 = vi.fn().mockReturnValue({ limit: mockLimit2 });

      (db.select as Mock)
        .mockReturnValueOnce({ from: mockFrom1 })  // main query
        .mockReturnValueOnce({ from: mockFrom2 });  // empty table check

      const result = await productService.searchCatalogProducts({});

      // Falls back to all in-memory SEED_PRODUCTS (3 items)
      expect(result).toHaveLength(3);
    });
  });

  describe('addProductToRoom', () => {
    it('should add a product and return the created record', async () => {
      const newProduct = {
        roomId: 'room-1',
        name: 'Oak Floor',
        category: 'flooring',
        description: 'Hardwood floor',
        estimatedPrice: '8.50',
        currency: 'USD',
        productUrl: null,
        imageUrl: null,
        recommendationReason: 'Good',
        metadata: null,
      };

      const mockCreated = {
        id: 'prod-1',
        ...newProduct,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockReturning = vi.fn().mockResolvedValue([mockCreated]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      (db.insert as Mock).mockReturnValue({ values: mockValues });

      const result = await productService.addProductToRoom(newProduct);

      expect(db.insert).toHaveBeenCalledWith(productRecommendations);
      expect(mockValues).toHaveBeenCalledWith(newProduct);
      expect(result).toEqual(mockCreated);
    });

    it('should throw error if no record is returned after insert', async () => {
      const newProduct = {
        roomId: 'room-1',
        name: 'Oak Floor',
        category: 'flooring',
      };

      const mockReturning = vi.fn().mockResolvedValue([]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      (db.insert as Mock).mockReturnValue({ values: mockValues });

      await expect(productService.addProductToRoom(newProduct)).rejects.toThrow(
        'Failed to add product: No record returned'
      );
    });
  });
});
