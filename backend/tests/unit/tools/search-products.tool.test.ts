import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SeedProduct } from '../../../src/data/seed-products.js';

// Use vi.hoisted so mock is available inside hoisted vi.mock factory
const { mockSearchSeedProducts } = vi.hoisted(() => ({
  mockSearchSeedProducts: vi.fn(),
}));

// Mock logger to suppress logs during tests
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock ProductService module with stable hoisted reference
vi.mock('../../../src/services/product.service.js', () => ({
  ProductService: vi.fn().mockImplementation(() => ({
    searchSeedProducts: mockSearchSeedProducts,
  })),
}));

import { searchProductsTool } from '../../../src/tools/search-products.tool.js';

const makeSeedProduct = (overrides: Partial<SeedProduct> = {}): SeedProduct => ({
  name: 'White Oak Engineered Hardwood',
  category: 'flooring',
  description: 'Wide-plank engineered white oak with matte finish.',
  estimatedPrice: '8.50',
  currency: 'USD',
  productUrl: null,
  imageUrl: null,
  recommendationReason: 'Premium look with excellent durability.',
  metadata: {
    brand: 'Artisan Floors',
    style: ['modern-minimalist', 'warm-scandinavian'],
    roomTypes: ['living', 'bedroom'],
    material: 'engineered oak',
    dimensions: '7" x 48"',
  },
  ...overrides,
});

describe('searchProductsTool', () => {
  beforeEach(() => {
    mockSearchSeedProducts.mockReset();
  });

  it('should return mapped products when results are found', async () => {
    const seedProducts = [makeSeedProduct()];
    mockSearchSeedProducts.mockReturnValue(seedProducts);

    const result = await searchProductsTool.invoke({ query: 'oak' });
    const parsed = JSON.parse(result) as {
      products: Array<{
        name: string;
        category: string;
        description: string;
        price: string;
        brand: string;
        material: string | null;
        compatibleStyles: string[];
      }>;
      totalMatches: number;
      showing: number;
    };

    expect(parsed.products).toHaveLength(1);
    expect(parsed.products[0]).toEqual({
      name: 'White Oak Engineered Hardwood',
      category: 'flooring',
      description: 'Wide-plank engineered white oak with matte finish.',
      price: '$8.50',
      brand: 'Artisan Floors',
      material: 'engineered oak',
      compatibleStyles: ['modern-minimalist', 'warm-scandinavian'],
    });
    expect(parsed.totalMatches).toBe(1);
    expect(parsed.showing).toBe(1);
  });

  it('should limit results to top 5', async () => {
    const seedProducts = Array.from({ length: 8 }, (_, i) =>
      makeSeedProduct({ name: `Product ${i + 1}` })
    );
    mockSearchSeedProducts.mockReturnValue(seedProducts);

    const result = await searchProductsTool.invoke({ category: 'flooring' });
    const parsed = JSON.parse(result) as {
      products: Array<{ name: string }>;
      totalMatches: number;
      showing: number;
    };

    expect(parsed.products).toHaveLength(5);
    expect(parsed.totalMatches).toBe(8);
    expect(parsed.showing).toBe(5);
  });

  it('should pass all filter parameters to searchSeedProducts', async () => {
    mockSearchSeedProducts.mockReturnValue([makeSeedProduct()]);

    await searchProductsTool.invoke({
      query: 'oak',
      style: 'modern-minimalist',
      category: 'flooring',
      maxPrice: 10,
      roomType: 'living',
    });

    expect(mockSearchSeedProducts).toHaveBeenCalledWith({
      query: 'oak',
      style: 'modern-minimalist',
      category: 'flooring',
      maxPrice: 10,
      roomType: 'living',
    });
  });

  it('should return no-match message when results are empty', async () => {
    mockSearchSeedProducts.mockReturnValue([]);

    const result = await searchProductsTool.invoke({ query: 'nonexistent' });
    const parsed = JSON.parse(result) as {
      message: string;
      filters: Record<string, unknown>;
      suggestion: string;
    };

    expect(parsed.message).toBe('No products found matching your criteria');
    expect(parsed.suggestion).toBe('Try broadening your search with fewer filters');
    expect(parsed.filters).toHaveProperty('query', 'nonexistent');
  });

  it('should handle null material in product metadata', async () => {
    const product = makeSeedProduct();
    delete product.metadata.material;
    mockSearchSeedProducts.mockReturnValue([product]);

    const result = await searchProductsTool.invoke({ query: 'oak' });
    const parsed = JSON.parse(result) as {
      products: Array<{ material: string | null }>;
    };

    expect(parsed.products[0]?.material).toBeNull();
  });

  it('should return error JSON when service throws', async () => {
    mockSearchSeedProducts.mockImplementation(() => {
      throw new Error('Unexpected failure');
    });

    const result = await searchProductsTool.invoke({ query: 'oak' });
    const parsed = JSON.parse(result) as { error: string };

    expect(parsed.error).toBe('Failed to search products');
  });
});
