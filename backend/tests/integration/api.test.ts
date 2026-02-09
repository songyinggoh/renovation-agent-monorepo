import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import type { Application } from 'express';

// ── Hoisted mocks (available inside vi.mock factories) ────────

const { mockGetUser, mockPoolQuery } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockPoolQuery: vi.fn(),
}));

// ── Mock dependencies ─────────────────────────────────────────

// Mock logger to silence output during tests
vi.mock('../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock Supabase auth for controlled authentication behaviour
vi.mock('../../src/config/supabase.js', () => ({
  supabaseAdmin: {
    auth: {
      getUser: mockGetUser,
    },
  },
}));

// Mock database pool for ownership middleware and controllers
vi.mock('../../src/db/index.js', () => ({
  db: {},
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
}));

// Mock RoomService used by room controller
vi.mock('../../src/services/room.service.js', () => ({
  RoomService: vi.fn().mockImplementation(() => ({
    getRoomsBySession: vi.fn().mockResolvedValue([
      { id: 'room-1', sessionId: 'session-1', name: 'Kitchen', type: 'kitchen' },
    ]),
    createRoom: vi.fn().mockResolvedValue({
      id: 'room-new', sessionId: 'session-1', name: 'Bathroom', type: 'bathroom',
    }),
    getRoomById: vi.fn().mockResolvedValue({
      id: 'room-1', sessionId: 'session-1', name: 'Kitchen', type: 'kitchen',
    }),
    updateRoom: vi.fn().mockResolvedValue({
      id: 'room-1', sessionId: 'session-1', name: 'Updated Kitchen', type: 'kitchen',
    }),
    deleteRoom: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock StyleService used by style controller
vi.mock('../../src/services/style.service.js', () => ({
  StyleService: vi.fn().mockImplementation(() => ({
    getAllStyles: vi.fn().mockResolvedValue([
      { id: 's1', name: 'Modern', slug: 'modern', description: 'Clean lines' },
    ]),
    getStyleBySlug: vi.fn().mockImplementation(async (slug: string) => {
      if (slug === 'modern') {
        return { id: 's1', name: 'Modern', slug: 'modern', description: 'Clean lines' };
      }
      return null;
    }),
    searchStyles: vi.fn().mockResolvedValue([
      { id: 's1', name: 'Modern', slug: 'modern', description: 'Clean lines' },
    ]),
    seedStyles: vi.fn().mockResolvedValue(5),
  })),
}));

// Mock ProductService used by product controller
vi.mock('../../src/services/product.service.js', () => ({
  ProductService: vi.fn().mockImplementation(() => ({
    searchSeedProducts: vi.fn().mockReturnValue([
      { name: 'Oak Table', category: 'furniture', style: 'modern', price: 499 },
    ]),
    getProductsByRoom: vi.fn().mockResolvedValue([
      { name: 'Oak Table', category: 'furniture', style: 'modern', price: 499 },
    ]),
  })),
}));

// Mock AssetService
vi.mock('../../src/services/asset.service.js', () => ({
  AssetService: vi.fn().mockImplementation(() => ({
    requestUpload: vi.fn(),
    confirmUpload: vi.fn(),
    getAssetsByRoom: vi.fn().mockResolvedValue([]),
    getAssetById: vi.fn(),
    deleteAsset: vi.fn(),
    getSignedUrl: vi.fn(),
  })),
}));

// ── Helpers ───────────────────────────────────────────────────

const VALID_USER = {
  id: 'user-123',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
};

function authenticateAs(userId = VALID_USER.id, email = VALID_USER.email) {
  mockGetUser.mockResolvedValue({
    data: {
      user: { id: userId, email, aud: 'authenticated', role: 'authenticated' },
    },
    error: null,
  });
}

function ownershipAllowsAccess(ownerId: string | null = VALID_USER.id) {
  mockPoolQuery.mockResolvedValue({
    rows: [{ id: 'resource-1', user_id: ownerId }],
  });
}

// ── Test suite ────────────────────────────────────────────────

let app: Application;

beforeAll(() => {
  app = createApp();
});

// ─── Health endpoints (no auth required) ──────────────────────

describe('Health endpoints', () => {
  it('GET /health should return 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('GET /health/live should return 200', async () => {
    const res = await request(app).get('/health/live');
    expect(res.status).toBe(200);
  });
});

// ─── Authentication middleware ────────────────────────────────

describe('Authentication middleware', () => {
  it('should return 401 without Authorization header', async () => {
    const res = await request(app).get('/api/sessions');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('should return 401 with malformed Authorization header', async () => {
    const res = await request(app)
      .get('/api/sessions')
      .set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
  });

  it('should return 401 with invalid token', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Invalid token'),
    });

    const res = await request(app)
      .get('/api/sessions')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('should pass with valid Bearer token', async () => {
    authenticateAs();
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get('/api/sessions')
      .set('Authorization', 'Bearer valid-token');

    // Should reach the controller (200 with empty sessions)
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sessions');
  });
});

// ─── 404 handler ──────────────────────────────────────────────

describe('404 handler', () => {
  it('should return 404 JSON for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent');
    // This hits auth first → 401, unless we're testing with auth
    expect([401, 404]).toContain(res.status);
  });

  it('should return 404 JSON for non-API unknown routes', async () => {
    const res = await request(app).get('/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });
});

// ─── Session endpoints ────────────────────────────────────────

describe('Session endpoints', () => {
  it('GET /api/sessions should return sessions', async () => {
    authenticateAs();
    mockPoolQuery.mockResolvedValue({
      rows: [
        { id: 'sess-1', title: 'Kitchen Reno', phase: 'INTAKE', user_id: VALID_USER.id },
      ],
    });

    const res = await request(app)
      .get('/api/sessions')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(1);
    expect(res.body.sessions[0].title).toBe('Kitchen Reno');
  });

  it('POST /api/sessions should validate body', async () => {
    authenticateAs();

    // Missing required 'title' field
    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
  });

  it('POST /api/sessions should create session with valid data', async () => {
    authenticateAs();
    // Profile check query
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: VALID_USER.id }] });
    // Insert query
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'sess-new', title: 'Bathroom Reno', phase: 'INTAKE' }],
    });

    const res = await request(app)
      .post('/api/sessions')
      .set('Authorization', 'Bearer valid-token')
      .send({ title: 'Bathroom Reno', totalBudget: 5000 });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Bathroom Reno');
  });
});

// ─── Ownership middleware ─────────────────────────────────────

describe('Ownership middleware', () => {
  it('should return 404 when session does not exist', async () => {
    authenticateAs();
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get('/api/sessions/nonexistent-session/rooms')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });

  it('should return 404 when user does not own session', async () => {
    authenticateAs();
    mockPoolQuery.mockResolvedValue({
      rows: [{ id: 'session-1', user_id: 'other-user-id' }],
    });

    const res = await request(app)
      .get('/api/sessions/session-1/rooms')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });

  it('should allow access to anonymous sessions (null user_id)', async () => {
    authenticateAs();
    ownershipAllowsAccess(null);

    const res = await request(app)
      .get('/api/sessions/session-1/rooms')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
  });
});

// ─── Room endpoints ───────────────────────────────────────────

describe('Room endpoints', () => {
  it('GET /api/sessions/:sessionId/rooms should list rooms', async () => {
    authenticateAs();
    ownershipAllowsAccess();

    const res = await request(app)
      .get('/api/sessions/session-1/rooms')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.rooms).toBeDefined();
  });

  it('POST /api/sessions/:sessionId/rooms should validate body', async () => {
    authenticateAs();
    ownershipAllowsAccess();

    // Missing required fields
    const res = await request(app)
      .post('/api/sessions/session-1/rooms')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    expect(res.status).toBe(400);
  });

  it('POST /api/sessions/:sessionId/rooms should create room with valid data', async () => {
    authenticateAs();
    ownershipAllowsAccess();

    const res = await request(app)
      .post('/api/sessions/session-1/rooms')
      .set('Authorization', 'Bearer valid-token')
      .send({ name: 'Bathroom', type: 'bathroom' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Bathroom');
  });

  it('GET /api/rooms/:roomId should return room', async () => {
    authenticateAs();
    ownershipAllowsAccess();

    const res = await request(app)
      .get('/api/rooms/room-1')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Kitchen');
  });
});

// ─── Product search endpoints ─────────────────────────────────

describe('Product endpoints', () => {
  it('GET /api/products/search should return products', async () => {
    authenticateAs();

    const res = await request(app)
      .get('/api/products/search?style=modern')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.products).toBeDefined();
    expect(res.body.count).toBe(1);
  });

  it('GET /api/products/search should reject invalid maxPrice', async () => {
    authenticateAs();

    const res = await request(app)
      .get('/api/products/search?maxPrice=-100')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('GET /api/rooms/:roomId/products should check ownership', async () => {
    authenticateAs();
    // Room not found
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const res = await request(app)
      .get('/api/rooms/room-missing/products')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });

  it('GET /api/rooms/:roomId/products should return products for owned room', async () => {
    authenticateAs();
    ownershipAllowsAccess();

    const res = await request(app)
      .get('/api/rooms/room-1/products')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.products).toBeDefined();
  });
});

// ─── Style endpoints ──────────────────────────────────────────

describe('Style endpoints', () => {
  it('GET /api/styles should list all styles', async () => {
    authenticateAs();

    const res = await request(app)
      .get('/api/styles')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.styles).toBeDefined();
    expect(res.body.styles).toHaveLength(1);
  });

  it('GET /api/styles/search should require q parameter', async () => {
    authenticateAs();

    const res = await request(app)
      .get('/api/styles/search')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });

  it('GET /api/styles/search?q=modern should return matching styles', async () => {
    authenticateAs();

    const res = await request(app)
      .get('/api/styles/search?q=modern')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.styles).toBeDefined();
  });

  it('GET /api/styles/:slug should return style by slug', async () => {
    authenticateAs();

    const res = await request(app)
      .get('/api/styles/modern')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Modern');
  });

  it('GET /api/styles/:slug should return 404 for unknown slug', async () => {
    authenticateAs();

    const res = await request(app)
      .get('/api/styles/nonexistent')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(404);
  });
});

// ─── Swagger docs ─────────────────────────────────────────────

describe('API documentation', () => {
  it('GET /api-docs should serve Swagger UI', async () => {
    const res = await request(app).get('/api-docs/');
    // Swagger UI redirects or returns HTML
    expect([200, 301, 304]).toContain(res.status);
  });
});
