import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

// Mock env
vi.mock('../../../src/config/env.js', () => ({
  env: {
    GOOGLE_API_KEY: 'test-google-api-key',
    IMAGE_GENERATION_PROVIDER: 'gemini',
    STABILITY_API_KEY: undefined,
  },
}));

import {
  GeminiImageAdapter,
  StabilityAIAdapter,
  createImageGenerationAdapter,
} from '../../../src/services/image-generation.service.js';

describe('GeminiImageAdapter', () => {
  let adapter: GeminiImageAdapter;

  beforeEach(() => {
    adapter = new GeminiImageAdapter('test-api-key');
  });

  it('should have providerName "gemini"', () => {
    expect(adapter.providerName).toBe('gemini');
  });

  it('should throw when API returns no candidates', async () => {
    // Mock the GoogleGenAI client internals
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [],
    });

    // Access private client and replace
    (adapter as unknown as { client: { models: { generateContent: typeof mockGenerateContent } } }).client = {
      models: { generateContent: mockGenerateContent },
    };

    await expect(
      adapter.generate('A modern kitchen render')
    ).rejects.toThrow('Gemini returned no candidates');
  });

  it('should throw when response has no image parts', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [{ text: 'Here is a description but no image' }],
          },
        },
      ],
    });

    (adapter as unknown as { client: { models: { generateContent: typeof mockGenerateContent } } }).client = {
      models: { generateContent: mockGenerateContent },
    };

    await expect(
      adapter.generate('A modern kitchen render')
    ).rejects.toThrow('Gemini response did not contain an image');
  });

  it('should return image buffer when API returns valid image', async () => {
    const fakeImageBase64 = Buffer.from('fake-image-data').toString('base64');

    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: fakeImageBase64,
                },
              },
            ],
          },
        },
      ],
    });

    (adapter as unknown as { client: { models: { generateContent: typeof mockGenerateContent } } }).client = {
      models: { generateContent: mockGenerateContent },
    };

    const result = await adapter.generate('A modern kitchen render', {
      aspectRatio: '4:3',
    });

    expect(result.imageBuffer).toBeInstanceOf(Buffer);
    expect(result.contentType).toBe('image/png');
    expect(result.metadata.model).toBe('gemini-2.0-flash-exp');
    expect(result.metadata.generationTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should detect webp content type', async () => {
    const fakeImageBase64 = Buffer.from('fake-webp-data').toString('base64');

    const mockGenerateContent = vi.fn().mockResolvedValue({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: 'image/webp',
                  data: fakeImageBase64,
                },
              },
            ],
          },
        },
      ],
    });

    (adapter as unknown as { client: { models: { generateContent: typeof mockGenerateContent } } }).client = {
      models: { generateContent: mockGenerateContent },
    };

    const result = await adapter.generate('A render');
    expect(result.contentType).toBe('image/webp');
  });
});

describe('StabilityAIAdapter', () => {
  let adapter: StabilityAIAdapter;

  beforeEach(() => {
    adapter = new StabilityAIAdapter('test-stability-key');
    vi.restoreAllMocks();
  });

  it('should have providerName "stability"', () => {
    expect(adapter.providerName).toBe('stability');
  });

  it('should throw when API returns non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('API error', { status: 400 })
    );

    await expect(
      adapter.generate('A kitchen render')
    ).rejects.toThrow('Stability AI API error (400)');
  });

  it('should throw when response has no image', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await expect(
      adapter.generate('A kitchen render')
    ).rejects.toThrow('Stability AI response did not contain an image');
  });

  it('should return image buffer on successful response', async () => {
    const fakeImageBase64 = Buffer.from('fake-stability-image').toString('base64');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ image: fakeImageBase64 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await adapter.generate('A modern kitchen', {
      aspectRatio: '16:9',
    });

    expect(result.imageBuffer).toBeInstanceOf(Buffer);
    expect(result.contentType).toBe('image/png');
    expect(result.metadata.model).toBe('sd3');
    expect(result.metadata.generationTimeMs).toBeGreaterThanOrEqual(0);
  });
});

describe('createImageGenerationAdapter', () => {
  it('should return GeminiImageAdapter by default', () => {
    const adapter = createImageGenerationAdapter();
    expect(adapter.providerName).toBe('gemini');
  });
});
