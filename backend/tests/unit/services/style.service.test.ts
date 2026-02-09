import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { StyleService } from '../../../src/services/style.service.js';
import { db } from '../../../src/db/index.js';
import { styleCatalog } from '../../../src/db/schema/styles.schema.js';

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

// Mock the data module
vi.mock('../../../src/data/index.js', () => ({
  SEED_STYLES: [
    {
      name: 'Modern Minimalist',
      slug: 'modern-minimalist',
      description: 'Clean lines and open spaces',
      colorPalette: [{ name: 'White', hex: '#FFFFFF' }],
      materials: ['concrete', 'glass'],
      keywords: ['modern', 'clean'],
    },
    {
      name: 'Warm Scandinavian',
      slug: 'warm-scandinavian',
      description: 'Cozy Nordic design',
      colorPalette: [{ name: 'Birch', hex: '#F5E6CC' }],
      materials: ['wood', 'linen'],
      keywords: ['scandi', 'cozy'],
    },
  ],
}));

describe('StyleService', () => {
  let styleService: StyleService;

  const mockStyle = {
    id: 'style-id-1',
    name: 'Modern Minimalist',
    slug: 'modern-minimalist',
    description: 'Clean lines and open spaces',
    colorPalette: [{ name: 'White', hex: '#FFFFFF' }],
    materials: ['concrete', 'glass'],
    keywords: ['modern', 'clean'],
    imageUrls: null,
    metadata: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockStyle2 = {
    id: 'style-id-2',
    name: 'Warm Scandinavian',
    slug: 'warm-scandinavian',
    description: 'Cozy Nordic design',
    colorPalette: [{ name: 'Birch', hex: '#F5E6CC' }],
    materials: ['wood', 'linen'],
    keywords: ['scandi', 'cozy'],
    imageUrls: null,
    metadata: null,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  };

  beforeEach(() => {
    styleService = new StyleService();
    vi.clearAllMocks();
  });

  describe('getAllStyles', () => {
    it('should return all styles from the database', async () => {
      const mockStyles = [mockStyle, mockStyle2];

      const mockFrom = vi.fn().mockResolvedValue(mockStyles);
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await styleService.getAllStyles();

      expect(db.select).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(styleCatalog);
      expect(result).toEqual(mockStyles);
      expect(result).toHaveLength(2);
    });

    it('should return an empty array when no styles exist', async () => {
      const mockFrom = vi.fn().mockResolvedValue([]);
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await styleService.getAllStyles();

      expect(result).toEqual([]);
    });

    it('should throw when database query fails', async () => {
      const mockFrom = vi.fn().mockRejectedValue(new Error('Connection error'));
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      await expect(styleService.getAllStyles()).rejects.toThrow('Connection error');
    });
  });

  describe('getStyleBySlug', () => {
    it('should return a style when found by slug', async () => {
      const mockWhere = vi.fn().mockResolvedValue([mockStyle]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await styleService.getStyleBySlug('modern-minimalist');

      expect(result).toEqual(mockStyle);
    });

    it('should return null when style is not found by slug', async () => {
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await styleService.getStyleBySlug('nonexistent-style');

      expect(result).toBeNull();
    });
  });

  describe('getStyleByName', () => {
    it('should return a style when found by name (case-insensitive)', async () => {
      const mockWhere = vi.fn().mockResolvedValue([mockStyle]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await styleService.getStyleByName('Modern Minimalist');

      expect(result).toEqual(mockStyle);
    });

    it('should return null when style is not found by name', async () => {
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await styleService.getStyleByName('Unknown Style');

      expect(result).toBeNull();
    });
  });

  describe('searchStyles', () => {
    it('should return matching styles for a search query', async () => {
      const mockWhere = vi.fn().mockResolvedValue([mockStyle]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await styleService.searchStyles('modern');

      expect(db.select).toHaveBeenCalled();
      expect(result).toEqual([mockStyle]);
    });

    it('should return an empty array when no styles match the query', async () => {
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await styleService.searchStyles('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('seedStyles', () => {
    it('should seed styles and return the inserted count', async () => {
      const mockOnConflictDoNothing = vi.fn().mockResolvedValue({ rowCount: 2 });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
      (db.insert as Mock).mockReturnValue({ values: mockValues });

      const result = await styleService.seedStyles();

      expect(db.insert).toHaveBeenCalledWith(styleCatalog);
      expect(result).toBe(2);
    });

    it('should return 0 when all styles already exist (conflict)', async () => {
      const mockOnConflictDoNothing = vi.fn().mockResolvedValue({ rowCount: 0 });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
      (db.insert as Mock).mockReturnValue({ values: mockValues });

      const result = await styleService.seedStyles();

      expect(result).toBe(0);
    });

    it('should return 0 when rowCount is null', async () => {
      const mockOnConflictDoNothing = vi.fn().mockResolvedValue({ rowCount: null });
      const mockValues = vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
      (db.insert as Mock).mockReturnValue({ values: mockValues });

      const result = await styleService.seedStyles();

      expect(result).toBe(0);
    });
  });
});
