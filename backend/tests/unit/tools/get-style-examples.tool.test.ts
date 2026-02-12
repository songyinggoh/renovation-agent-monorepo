import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so these are available inside hoisted vi.mock factories
const {
  mockGetStyleByName,
  mockGetStyleBySlug,
  mockSearchStyles,
  mockGetAllStyles,
  mockGetImagesByStyle,
} = vi.hoisted(() => ({
  mockGetStyleByName: vi.fn(),
  mockGetStyleBySlug: vi.fn(),
  mockSearchStyles: vi.fn(),
  mockGetAllStyles: vi.fn(),
  mockGetImagesByStyle: vi.fn(),
}));

// Mock logger to suppress logs during tests
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock StyleService module with stable hoisted references
vi.mock('../../../src/services/style.service.js', () => ({
  StyleService: vi.fn().mockImplementation(() => ({
    getStyleByName: mockGetStyleByName,
    getStyleBySlug: mockGetStyleBySlug,
    searchStyles: mockSearchStyles,
    getAllStyles: mockGetAllStyles,
  })),
}));

// Mock StyleImageService module
vi.mock('../../../src/services/style-image.service.js', () => ({
  StyleImageService: vi.fn().mockImplementation(() => ({
    getImagesByStyle: mockGetImagesByStyle,
  })),
}));

import { getStyleExamplesTool } from '../../../src/tools/get-style-examples.tool.js';

const mockStyleEntry = {
  id: 'style-uuid-1',
  name: 'Modern Minimalist',
  slug: 'modern-minimalist',
  description: 'Clean lines and open spaces with a neutral palette',
  colorPalette: [
    { name: 'White', hex: '#FFFFFF' },
    { name: 'Charcoal', hex: '#333333' },
  ],
  materials: ['concrete', 'glass', 'steel'],
  keywords: ['modern', 'minimalist', 'clean'],
  imageUrls: null,
  metadata: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockImages = [
  {
    id: 'img-1',
    styleId: 'style-uuid-1',
    publicUrl: 'https://test.supabase.co/storage/v1/object/public/style-assets/styles/modern-minimalist/living.jpg',
    caption: 'Minimalist living room',
    roomType: 'living',
    altText: 'Clean minimalist living room',
  },
];

describe('getStyleExamplesTool', () => {
  beforeEach(() => {
    mockGetStyleByName.mockReset();
    mockGetStyleBySlug.mockReset();
    mockSearchStyles.mockReset();
    mockGetAllStyles.mockReset();
    mockGetImagesByStyle.mockReset();
    // Default: return empty images
    mockGetImagesByStyle.mockResolvedValue([]);
  });

  it('should return style data with moodboard images when exact name match is found', async () => {
    mockGetStyleByName.mockResolvedValue(mockStyleEntry);
    mockGetImagesByStyle.mockResolvedValue(mockImages);

    const result = await getStyleExamplesTool.invoke({ styleName: 'Modern Minimalist' });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed).toEqual({
      name: 'Modern Minimalist',
      slug: 'modern-minimalist',
      description: 'Clean lines and open spaces with a neutral palette',
      colorPalette: [
        { name: 'White', hex: '#FFFFFF' },
        { name: 'Charcoal', hex: '#333333' },
      ],
      materials: ['concrete', 'glass', 'steel'],
      keywords: ['modern', 'minimalist', 'clean'],
      moodboardImages: [
        {
          url: 'https://test.supabase.co/storage/v1/object/public/style-assets/styles/modern-minimalist/living.jpg',
          caption: 'Minimalist living room',
          roomType: 'living',
          altText: 'Clean minimalist living room',
        },
      ],
    });

    expect(mockGetStyleByName).toHaveBeenCalledWith('Modern Minimalist');
    expect(mockGetImagesByStyle).toHaveBeenCalledWith('style-uuid-1');
    expect(mockGetStyleBySlug).not.toHaveBeenCalled();
    expect(mockSearchStyles).not.toHaveBeenCalled();
  });

  it('should fall back to slug match when name match returns null', async () => {
    mockGetStyleByName.mockResolvedValue(null);
    mockGetStyleBySlug.mockResolvedValue(mockStyleEntry);
    mockGetImagesByStyle.mockResolvedValue([]);

    const result = await getStyleExamplesTool.invoke({ styleName: 'Modern Minimalist' });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed).toHaveProperty('name', 'Modern Minimalist');
    expect(parsed).toHaveProperty('slug', 'modern-minimalist');
    expect(parsed).toHaveProperty('moodboardImages');

    expect(mockGetStyleByName).toHaveBeenCalledWith('Modern Minimalist');
    expect(mockGetStyleBySlug).toHaveBeenCalledWith('modern-minimalist');
    expect(mockSearchStyles).not.toHaveBeenCalled();
  });

  it('should convert styleName to slug with lowercase and dashes', async () => {
    mockGetStyleByName.mockResolvedValue(null);
    mockGetStyleBySlug.mockResolvedValue(null);
    mockSearchStyles.mockResolvedValue([]);
    mockGetAllStyles.mockResolvedValue([]);

    await getStyleExamplesTool.invoke({ styleName: 'Industrial Loft' });

    expect(mockGetStyleBySlug).toHaveBeenCalledWith('industrial-loft');
  });

  it('should fall back to fuzzy search and return first result with note', async () => {
    mockGetStyleByName.mockResolvedValue(null);
    mockGetStyleBySlug.mockResolvedValue(null);
    mockSearchStyles.mockResolvedValue([mockStyleEntry]);
    mockGetImagesByStyle.mockResolvedValue([]);

    const result = await getStyleExamplesTool.invoke({ styleName: 'modern' });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed).toHaveProperty('name', 'Modern Minimalist');
    expect(parsed).toHaveProperty('note', 'Closest match for "modern"');
    expect(parsed).toHaveProperty('moodboardImages');

    expect(mockSearchStyles).toHaveBeenCalledWith('modern');
  });

  it('should return error with available styles when nothing is found', async () => {
    mockGetStyleByName.mockResolvedValue(null);
    mockGetStyleBySlug.mockResolvedValue(null);
    mockSearchStyles.mockResolvedValue([]);
    mockGetAllStyles.mockResolvedValue([
      { ...mockStyleEntry, name: 'Modern Minimalist' },
      { ...mockStyleEntry, name: 'Scandinavian', slug: 'scandinavian' },
    ]);

    const result = await getStyleExamplesTool.invoke({ styleName: 'Nonexistent Style' });
    const parsed = JSON.parse(result) as { error: string; availableStyles: string[] };

    expect(parsed.error).toBe('Style "Nonexistent Style" not found');
    expect(parsed.availableStyles).toEqual(['Modern Minimalist', 'Scandinavian']);

    expect(mockGetAllStyles).toHaveBeenCalled();
  });

  it('should return generic error when service throws', async () => {
    mockGetStyleByName.mockRejectedValue(new Error('Database connection failed'));

    const result = await getStyleExamplesTool.invoke({ styleName: 'Modern' });
    const parsed = JSON.parse(result) as { error: string };

    expect(parsed.error).toBe('Failed to look up style information');
  });

  it('should return empty moodboardImages array when no images exist', async () => {
    mockGetStyleByName.mockResolvedValue(mockStyleEntry);
    mockGetImagesByStyle.mockResolvedValue([]);

    const result = await getStyleExamplesTool.invoke({ styleName: 'Modern Minimalist' });
    const parsed = JSON.parse(result) as Record<string, unknown>;

    expect(parsed).toHaveProperty('moodboardImages');
    expect(parsed.moodboardImages).toEqual([]);
  });
});
