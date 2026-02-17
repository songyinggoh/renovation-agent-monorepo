import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { StyleImageService } from '../../../src/services/style-image.service.js';
import { db } from '../../../src/db/index.js';
import { styleImages } from '../../../src/db/schema/style-images.schema.js';

// Mock the database module
vi.mock('../../../src/db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock Supabase admin
vi.mock('../../../src/config/supabase.js', () => ({
  supabaseAdmin: null,
}));

// Mock env config
vi.mock('../../../src/config/env.js', () => ({
  env: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_STYLE_BUCKET: 'style-assets',
  },
  isStorageEnabled: vi.fn().mockReturnValue(false),
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock errors
vi.mock('../../../src/utils/errors.js', () => ({
  NotFoundError: class NotFoundError extends Error {
    statusCode = 404;
    constructor(msg: string) {
      super(msg);
      this.name = 'NotFoundError';
    }
  },
}));

describe('StyleImageService', () => {
  let service: StyleImageService;

  const mockImage = {
    id: 'img-1',
    styleId: 'style-1',
    storagePath: 'styles/japandi/living-zen.jpg',
    filename: 'living-zen.jpg',
    contentType: 'image/jpeg',
    fileSize: 150000,
    width: 800,
    height: 600,
    caption: 'Zen Japandi living room',
    altText: 'Japandi living room with low furniture',
    roomType: 'living',
    tags: ['zen', 'low-furniture'],
    displayOrder: 0,
    sourceUrl: 'https://images.unsplash.com/photo-123',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockImage2 = {
    ...mockImage,
    id: 'img-2',
    storagePath: 'styles/japandi/kitchen-wabi.jpg',
    filename: 'kitchen-wabi.jpg',
    roomType: 'kitchen',
    caption: 'Wabi-sabi kitchen',
    displayOrder: 1,
  };

  const mockStyle = {
    id: 'style-1',
    name: 'Japandi',
    slug: 'japandi',
    description: 'Japanese-Scandinavian fusion',
    colorPalette: [],
    materials: [],
    keywords: [],
    imageUrls: null,
    metadata: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    service = new StyleImageService();
    vi.clearAllMocks();
  });

  describe('getImagesByStyle', () => {
    it('should return images with public URLs for a style', async () => {
      const mockOrderBy = vi.fn().mockResolvedValue([mockImage, mockImage2]);
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await service.getImagesByStyle('style-1');

      expect(db.select).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith(styleImages);
      expect(result).toHaveLength(2);
      // isStorageEnabled() is mocked as false, so publicUrl falls back to sourceUrl
      expect(result[0].publicUrl).toBe('https://images.unsplash.com/photo-123');
      expect(result[1].publicUrl).toBe('https://images.unsplash.com/photo-123');
    });

    it('should fall back to sourceUrl when storage is not enabled', async () => {
      // isStorageEnabled is mocked as false, so resolvePublicUrl should use sourceUrl
      const imgWithSourceUrl = {
        ...mockImage,
        sourceUrl: 'https://images.unsplash.com/photo-custom',
      };
      const mockOrderBy = vi.fn().mockResolvedValue([imgWithSourceUrl]);
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await service.getImagesByStyle('style-1');

      expect(result[0].publicUrl).toBe('https://images.unsplash.com/photo-custom');
    });

    it('should fall back to buildPublicUrl when sourceUrl is null and storage disabled', async () => {
      const imgNoSourceUrl = { ...mockImage, sourceUrl: null };
      const mockOrderBy = vi.fn().mockResolvedValue([imgNoSourceUrl]);
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await service.getImagesByStyle('style-1');

      // No sourceUrl, falls through to buildPublicUrl
      expect(result[0].publicUrl).toBe(
        'https://test.supabase.co/storage/v1/object/public/style-assets/styles/japandi/living-zen.jpg'
      );
    });

    it('should return empty array when no images exist for a style', async () => {
      const mockOrderBy = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await service.getImagesByStyle('style-1');

      expect(result).toEqual([]);
    });
  });

  describe('getImagesBySlug', () => {
    it('should fetch style by slug then return images', async () => {
      // First call: select style by slug
      const mockStyleWhere = vi.fn().mockResolvedValue([mockStyle]);
      const mockStyleFrom = vi.fn().mockReturnValue({ where: mockStyleWhere });

      // Second call: select images by styleId
      const mockOrderBy = vi.fn().mockResolvedValue([mockImage]);
      const mockImgWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockImgFrom = vi.fn().mockReturnValue({ where: mockImgWhere });

      (db.select as Mock)
        .mockReturnValueOnce({ from: mockStyleFrom })
        .mockReturnValueOnce({ from: mockImgFrom });

      const result = await service.getImagesBySlug('japandi');

      expect(result).toHaveLength(1);
      expect(result[0].caption).toBe('Zen Japandi living room');
    });

    it('should throw NotFoundError when style slug does not exist', async () => {
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      await expect(service.getImagesBySlug('nonexistent')).rejects.toThrow('Style not found: nonexistent');
    });
  });

  describe('getImagesByStyleAndRoom', () => {
    it('should return images filtered by style and room type', async () => {
      const mockOrderBy = vi.fn().mockResolvedValue([mockImage]);
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await service.getImagesByStyleAndRoom('style-1', 'living');

      expect(result).toHaveLength(1);
      expect(result[0].roomType).toBe('living');
    });
  });

  describe('getPublicUrl', () => {
    it('should generate correct public URL from storage path', () => {
      const url = service.getPublicUrl('styles/japandi/living-zen.jpg');

      expect(url).toBe(
        'https://test.supabase.co/storage/v1/object/public/style-assets/styles/japandi/living-zen.jpg'
      );
    });
  });

  describe('seedFromManifest', () => {
    it('should insert new images and skip existing ones', async () => {
      // Mock style lookup
      const mockStyleWhere = vi.fn().mockResolvedValue([mockStyle]);
      const mockStyleFrom = vi.fn().mockReturnValue({ where: mockStyleWhere });

      // Mock existing image check (first call: not found, second call: found)
      const mockExistCheckWhere1 = vi.fn().mockResolvedValue([]);
      const mockExistCheckFrom1 = vi.fn().mockReturnValue({ where: mockExistCheckWhere1 });

      const mockExistCheckWhere2 = vi.fn().mockResolvedValue([mockImage]);
      const mockExistCheckFrom2 = vi.fn().mockReturnValue({ where: mockExistCheckWhere2 });

      (db.select as Mock)
        .mockReturnValueOnce({ from: mockStyleFrom })          // style lookup
        .mockReturnValueOnce({ from: mockExistCheckFrom1 })     // image 1 check (not found)
        .mockReturnValueOnce({ from: mockExistCheckFrom2 });    // image 2 check (found)

      // Mock insert
      const mockReturning = vi.fn().mockResolvedValue([{ id: 'new-img' }]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      (db.insert as Mock).mockReturnValue({ values: mockValues });

      const manifests = [{
        styleSlug: 'japandi',
        images: [
          {
            url: 'https://example.com/1.jpg',
            filename: 'new-image.jpg',
            roomType: 'living',
            caption: 'New image',
            altText: 'Alt text',
            tags: ['new'],
          },
          {
            url: 'https://example.com/2.jpg',
            filename: 'living-zen.jpg',
            roomType: 'living',
            caption: 'Existing image',
            altText: 'Alt text',
            tags: ['existing'],
          },
        ],
      }];

      const result = await service.seedFromManifest(manifests);

      expect(result).toBe(1); // Only 1 new image inserted
      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it('should skip styles that do not exist in the database', async () => {
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const manifests = [{
        styleSlug: 'nonexistent',
        images: [{
          url: 'https://example.com/1.jpg',
          filename: 'image.jpg',
          roomType: 'living',
          caption: 'Test',
          altText: 'Test',
          tags: [],
        }],
      }];

      const result = await service.seedFromManifest(manifests);

      expect(result).toBe(0);
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('deleteImage', () => {
    it('should delete image from database', async () => {
      // Mock select to find the image
      const mockWhere = vi.fn().mockResolvedValue([mockImage]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      // Mock delete
      const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
      (db.delete as Mock).mockReturnValue({ where: mockDeleteWhere });

      await service.deleteImage('img-1');

      expect(db.delete).toHaveBeenCalledWith(styleImages);
    });

    it('should throw NotFoundError when image does not exist', async () => {
      const mockWhere = vi.fn().mockResolvedValue([]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      await expect(service.deleteImage('nonexistent')).rejects.toThrow('Style image not found: nonexistent');
    });
  });

  describe('getImageCountByStyle', () => {
    it('should return the count of images for a style', async () => {
      const mockWhere = vi.fn().mockResolvedValue([{ count: 2 }]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await service.getImageCountByStyle('style-1');

      expect(result).toBe(2);
    });

    it('should return 0 when no images exist', async () => {
      const mockWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      (db.select as Mock).mockReturnValue({ from: mockFrom });

      const result = await service.getImageCountByStyle('style-1');

      expect(result).toBe(0);
    });
  });
});
