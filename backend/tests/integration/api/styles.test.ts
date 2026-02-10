import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Application } from 'express';
import { getApp } from './setup.js';
import { StyleService } from '../../../src/services/style.service.js';

// Mock the style service so we don't need a real DB
vi.mock('../../../src/services/style.service.js', () => ({
  StyleService: vi.fn().mockImplementation(() => ({
    getAllStyles: vi.fn(),
    getStyleBySlug: vi.fn(),
    searchStyles: vi.fn(),
    seedStyles: vi.fn(),
  })),
}));

let app: Application;
let mockStyleService: {
  getAllStyles: ReturnType<typeof vi.fn>;
  getStyleBySlug: ReturnType<typeof vi.fn>;
  searchStyles: ReturnType<typeof vi.fn>;
  seedStyles: ReturnType<typeof vi.fn>;
};

beforeAll(async () => {
  app = await getApp();
  // Capture the instance created by the controller during module load
  const instance = vi.mocked(StyleService).mock.results.find(r => r.type === 'return');
  if (instance) {
    mockStyleService = instance.value as typeof mockStyleService;
  }
});

beforeEach(() => {
  // Reset individual method mocks without clearing constructor results
  mockStyleService.getAllStyles.mockReset();
  mockStyleService.getStyleBySlug.mockReset();
  mockStyleService.searchStyles.mockReset();
  mockStyleService.seedStyles.mockReset();
});

const sampleStyles = [
  {
    id: 'style-1',
    name: 'Modern Minimalist',
    slug: 'modern-minimalist',
    description: 'Clean lines',
    colorPalette: [],
    materials: ['concrete'],
    keywords: ['modern'],
  },
  {
    id: 'style-2',
    name: 'Industrial Chic',
    slug: 'industrial-chic',
    description: 'Raw materials',
    colorPalette: [],
    materials: ['steel'],
    keywords: ['industrial'],
  },
];

describe('Style Endpoints', () => {
  describe('GET /api/styles', () => {
    it('should return all styles', async () => {
      mockStyleService.getAllStyles.mockResolvedValue(sampleStyles);

      const res = await request(app)
        .get('/api/styles')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.styles).toHaveLength(2);
      expect(res.body.styles[0].name).toBe('Modern Minimalist');
    });

    it('should return 500 on service error', async () => {
      mockStyleService.getAllStyles.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .get('/api/styles')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to retrieve styles');
    });
  });

  describe('GET /api/styles/search', () => {
    it('should return filtered results for valid query', async () => {
      mockStyleService.searchStyles.mockResolvedValue([sampleStyles[0]]);

      const res = await request(app)
        .get('/api/styles/search?q=modern')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.styles).toHaveLength(1);
      expect(res.body.count).toBe(1);
    });

    it('should return 400 without q parameter', async () => {
      const res = await request(app)
        .get('/api/styles/search')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation Error');
    });
  });

  describe('GET /api/styles/:slug', () => {
    it('should return a style by slug', async () => {
      mockStyleService.getStyleBySlug.mockResolvedValue(sampleStyles[0]);

      const res = await request(app)
        .get('/api/styles/modern-minimalist')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Modern Minimalist');
    });

    it('should return 404 for unknown slug', async () => {
      mockStyleService.getStyleBySlug.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/styles/nonexistent')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Style not found');
    });
  });

  describe('POST /api/styles/seed', () => {
    it('should return 404 in non-development environment', async () => {
      // Our test env is "test", not "development", so seed is blocked
      const res = await request(app)
        .post('/api/styles/seed')
        .set('Authorization', 'Bearer test-token');

      expect(res.status).toBe(404);
    });
  });
});
