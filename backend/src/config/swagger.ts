import swaggerUi from 'swagger-ui-express';
import { Router } from 'express';

const apiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Renovation Agent API',
    version: '1.0.0',
    description:
      'AI-powered renovation planning assistant. Uses Gemini AI via LangChain for intelligent renovation assistance, Socket.io for real-time chat, and Supabase for authentication.',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Development' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Supabase JWT token',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          errorId: { type: 'string', format: 'uuid' },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Validation Error' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      Session: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          user_id: { type: 'string', format: 'uuid', nullable: true },
          phase: {
            type: 'string',
            enum: ['INTAKE', 'CHECKLIST', 'PLAN', 'RENDER', 'PAYMENT', 'COMPLETE', 'ITERATE'],
          },
          total_budget: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      Room: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          sessionId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          type: { type: 'string' },
          budget: { type: 'string', nullable: true },
          requirements: { type: 'object', nullable: true },
          checklist: { type: 'object', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      ChatMessage: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          sessionId: { type: 'string', format: 'uuid' },
          role: { type: 'string', enum: ['user', 'assistant', 'system'] },
          content: { type: 'string' },
          type: { type: 'string', enum: ['text', 'tool_call', 'tool_result'] },
          toolName: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Style: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string' },
          colorPalette: { type: 'array', items: { type: 'string' } },
          materials: { type: 'array', items: { type: 'string' } },
          keywords: { type: 'array', items: { type: 'string' } },
        },
      },
      Product: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          style: { type: 'string' },
          price: { type: 'number' },
          roomType: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    // Health
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Basic health check',
        security: [],
        responses: {
          '200': { description: 'Server is running' },
        },
      },
    },
    '/health/live': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        security: [],
        responses: { '200': { description: 'Server process is alive' } },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness probe (checks database)',
        security: [],
        responses: {
          '200': { description: 'All dependencies healthy' },
          '503': { description: 'One or more dependencies unhealthy' },
        },
      },
    },
    '/health/status': {
      get: {
        tags: ['Health'],
        summary: 'Detailed system metrics',
        security: [],
        responses: { '200': { description: 'System metrics and status' } },
      },
    },

    // Sessions
    '/api/sessions': {
      get: {
        tags: ['Sessions'],
        summary: 'List sessions for authenticated user',
        responses: {
          '200': {
            description: 'List of sessions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sessions: { type: 'array', items: { $ref: '#/components/schemas/Session' } },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        tags: ['Sessions'],
        summary: 'Create a new renovation session',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['title'],
                properties: {
                  title: { type: 'string', minLength: 1, maxLength: 200 },
                  totalBudget: { type: 'number', minimum: 0 },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Session created' },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
          '401': { description: 'Unauthorized' },
        },
      },
    },

    // Messages
    '/api/sessions/{sessionId}/messages': {
      get: {
        tags: ['Messages'],
        summary: 'Get chat messages for a session',
        parameters: [
          { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'List of messages',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    messages: { type: 'array', items: { $ref: '#/components/schemas/ChatMessage' } },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Session not found' },
        },
      },
    },

    // Rooms
    '/api/sessions/{sessionId}/rooms': {
      get: {
        tags: ['Rooms'],
        summary: 'List all rooms for a session',
        parameters: [
          { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'List of rooms',
            content: { 'application/json': { schema: { type: 'object', properties: { rooms: { type: 'array', items: { $ref: '#/components/schemas/Room' } } } } } },
          },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Session not found' },
        },
      },
      post: {
        tags: ['Rooms'],
        summary: 'Create a room in a session',
        parameters: [
          { name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'type'],
                properties: {
                  name: { type: 'string', minLength: 1, maxLength: 100 },
                  type: { type: 'string', minLength: 1 },
                  budget: { type: 'number', minimum: 0 },
                  requirements: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Room created' },
          '400': { description: 'Validation error' },
          '401': { description: 'Unauthorized' },
          '404': { description: 'Session not found' },
        },
      },
    },
    '/api/rooms/{roomId}': {
      get: {
        tags: ['Rooms'],
        summary: 'Get a room by ID',
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Room details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Room' } } } },
          '404': { description: 'Room not found' },
        },
      },
      patch: {
        tags: ['Rooms'],
        summary: 'Update a room',
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  budget: { type: 'number' },
                  requirements: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Room updated' },
          '404': { description: 'Room not found' },
        },
      },
      delete: {
        tags: ['Rooms'],
        summary: 'Delete a room',
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '204': { description: 'Room deleted' },
          '404': { description: 'Room not found' },
        },
      },
    },

    // Products
    '/api/products/search': {
      get: {
        tags: ['Products'],
        summary: 'Search seed products',
        parameters: [
          { name: 'style', in: 'query', schema: { type: 'string' }, description: 'Filter by design style' },
          { name: 'category', in: 'query', schema: { type: 'string' }, description: 'Filter by product category' },
          { name: 'maxPrice', in: 'query', schema: { type: 'number' }, description: 'Maximum price filter' },
          { name: 'roomType', in: 'query', schema: { type: 'string' }, description: 'Filter by room type' },
          { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Free text search' },
        ],
        responses: {
          '200': {
            description: 'Matching products',
            content: { 'application/json': { schema: { type: 'object', properties: { products: { type: 'array', items: { $ref: '#/components/schemas/Product' } }, count: { type: 'number' } } } } },
          },
          '400': { description: 'Invalid query parameters' },
        },
      },
    },
    '/api/rooms/{roomId}/products': {
      get: {
        tags: ['Products'],
        summary: 'Get product recommendations for a room',
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Product recommendations',
            content: { 'application/json': { schema: { type: 'object', properties: { products: { type: 'array', items: { $ref: '#/components/schemas/Product' } }, count: { type: 'number' } } } } },
          },
          '404': { description: 'Room not found' },
        },
      },
    },

    // Styles
    '/api/styles': {
      get: {
        tags: ['Styles'],
        summary: 'List all design styles',
        responses: {
          '200': {
            description: 'List of styles',
            content: { 'application/json': { schema: { type: 'object', properties: { styles: { type: 'array', items: { $ref: '#/components/schemas/Style' } } } } } },
          },
        },
      },
    },
    '/api/styles/search': {
      get: {
        tags: ['Styles'],
        summary: 'Search styles',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 1 }, description: 'Search query' },
        ],
        responses: {
          '200': { description: 'Matching styles' },
          '400': { description: 'Missing query parameter' },
        },
      },
    },
    '/api/styles/{slug}': {
      get: {
        tags: ['Styles'],
        summary: 'Get a style by slug',
        parameters: [
          { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Style details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Style' } } } },
          '404': { description: 'Style not found' },
        },
      },
    },
    '/api/styles/seed': {
      post: {
        tags: ['Styles'],
        summary: 'Seed style catalog (development only)',
        description: 'Only available when NODE_ENV=development. Returns 404 in production.',
        responses: {
          '200': { description: 'Styles seeded' },
          '404': { description: 'Not available in this environment' },
        },
      },
    },

    // Assets
    '/api/rooms/{roomId}/assets/request-upload': {
      post: {
        tags: ['Assets'],
        summary: 'Request a signed upload URL',
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['filename', 'contentType', 'fileSize', 'assetType', 'sessionId'],
                properties: {
                  filename: { type: 'string' },
                  contentType: { type: 'string' },
                  fileSize: { type: 'number' },
                  assetType: { type: 'string', enum: ['before_photo', 'inspiration', 'floor_plan', 'render', 'document'] },
                  sessionId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Upload URL generated' },
          '400': { description: 'Invalid request' },
        },
      },
    },
    '/api/rooms/{roomId}/assets': {
      get: {
        tags: ['Assets'],
        summary: 'List assets for a room',
        parameters: [
          { name: 'roomId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'List of assets' },
        },
      },
    },
  },
  tags: [
    { name: 'Health', description: 'Health check and monitoring endpoints' },
    { name: 'Sessions', description: 'Renovation session management' },
    { name: 'Messages', description: 'Chat message history' },
    { name: 'Rooms', description: 'Room CRUD within sessions' },
    { name: 'Products', description: 'Product search and recommendations' },
    { name: 'Styles', description: 'Design style catalog' },
    { name: 'Assets', description: 'File upload and management' },
  ],
};

/**
 * Create a router that serves Swagger UI at /api-docs
 */
export function createSwaggerRouter(): Router {
  const router = Router();
  router.use('/api-docs', swaggerUi.serve, swaggerUi.setup(apiSpec, {
    customSiteTitle: 'Renovation Agent API',
  }));
  return router;
}
