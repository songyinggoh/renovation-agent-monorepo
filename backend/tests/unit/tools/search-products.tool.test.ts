import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProductCatalogEntry } from '../../../src/db/schema/products-catalog.schema.js';

// Use vi.hoisted so mock is available inside hoisted vi.mock factory
const { mockSearchCatalogProducts } = vi.hoisted(() => ({
  mockSearchCatalogProducts: vi.fn(),
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
    searchCatalogProducts: mockSearchCatalogProducts,
  })),
}));

import { searchProductsTool } from '../../../src/tools/search-products.tool.js';

const makeCatalogProduct = (overrides: Partial<ProductCatalogEntry> = {}): ProductCatalogEntry => ({
  id: 'cat-1',
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
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

describe('searchProductsTool', () => {
  beforeEach(() => {
    mockSearchCatalogProducts.mockReset();
  });

  it('should return mapped products when results are found', async () => {
    const products = [makeCatalogProduct()];
    mockSearchCatalogProducts.mockResolvedValue(products);

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
      price: 'USD 8.50',
      brand: 'Artisan Floors',
      material: 'engineered oak',
      compatibleStyles: ['modern-minimalist', 'warm-scandinavian'],
    });
    expect(parsed.totalMatches).toBe(1);
    expect(parsed.showing).toBe(1);
  });

  it('should limit results to top 5', async () => {
    const products = Array.from({ length: 8 }, (_, i) =>
      makeCatalogProduct({ id: `cat-${i}`, name: `Product ${i + 1}` })
    );
    mockSearchCatalogProducts.mockResolvedValue(products);

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

  it('should pass all filter parameters to searchCatalogProducts', async () => {
    mockSearchCatalogProducts.mockResolvedValue([makeCatalogProduct()]);

    await searchProductsTool.invoke({
      query: 'oak',
      style: 'modern-minimalist',
      category: 'flooring',
      maxPrice: 10,
      roomType: 'living',
    });

    expect(mockSearchCatalogProducts).toHaveBeenCalledWith({
      query: 'oak',
      style: 'modern-minimalist',
      category: 'flooring',
      maxPrice: 10,
      roomType: 'living',
    });
  });

  it('should return no-match message when results are empty', async () => {
    mockSearchCatalogProducts.mockResolvedValue([]);

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
    const product = makeCatalogProduct({
      metadata: {
        brand: 'Artisan Floors',
        style: ['modern-minimalist'],
        roomTypes: ['living'],
      },
    });
    mockSearchCatalogProducts.mockResolvedValue([product]);

    const result = await searchProductsTool.invoke({ query: 'oak' });
    const parsed = JSON.parse(result) as {
      products: Array<{ material: string | null }>;
    };

    expect(parsed.products[0]?.material).toBeNull();
  });

  it('should return error JSON when service throws', async () => {
    mockSearchCatalogProducts.mockRejectedValue(new Error('Unexpected failure'));

    const result = await searchProductsTool.invoke({ query: 'oak' });
    const parsed = JSON.parse(result) as { error: string };

    expect(parsed.error).toBe('Failed to search products');
  });
});
