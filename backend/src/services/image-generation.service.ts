import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env.js';
import { Logger } from '../utils/logger.js';

const logger = new Logger({ serviceName: 'ImageGeneration' });

/**
 * Result from an image generation adapter
 */
export interface ImageGenerationResult {
  imageBuffer: Buffer;
  contentType: 'image/png' | 'image/webp';
  metadata: {
    model: string;
    seed?: number;
    generationTimeMs: number;
  };
}

/**
 * Options for image generation
 */
export interface ImageGenerationOptions {
  aspectRatio?: '1:1' | '4:3' | '16:9' | '3:4' | '9:16';
  size?: '1K' | '2K';
  referenceImageBase64?: string;
}

/**
 * Strategy interface for image generation providers
 */
export interface ImageGenerationAdapter {
  readonly providerName: string;
  generate(prompt: string, options?: ImageGenerationOptions): Promise<ImageGenerationResult>;
}

/**
 * Gemini native image generation adapter.
 * Uses gemini-2.5-flash-preview-image-generation with responseModalities: ['IMAGE'].
 */
export class GeminiImageAdapter implements ImageGenerationAdapter {
  readonly providerName = 'gemini';
  private readonly client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generate(prompt: string, options?: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const startTime = Date.now();
    const model = 'gemini-2.0-flash-exp';

    logger.info('Generating image with Gemini', {
      model,
      promptLength: prompt.length,
      aspectRatio: options?.aspectRatio ?? '4:3',
    });

    // Build content: multimodal (image + text) if reference provided, text-only otherwise
    const contents = options?.referenceImageBase64
      ? [
          {
            role: 'user' as const,
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: options.referenceImageBase64 } },
              { text: prompt },
            ],
          },
        ]
      : prompt;

    const response = await this.client.models.generateContent({
      model,
      contents,
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
      },
    });

    // Extract image data from response
    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error('Gemini returned no candidates');
    }

    const parts = candidates[0]?.content?.parts;
    if (!parts) {
      throw new Error('Gemini returned no content parts');
    }

    const imagePart = parts.find(
      (part) => part.inlineData?.mimeType?.startsWith('image/')
    );

    if (!imagePart?.inlineData?.data) {
      throw new Error('Gemini response did not contain an image');
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const contentType = (imagePart.inlineData.mimeType === 'image/webp' ? 'image/webp' : 'image/png') as 'image/png' | 'image/webp';

    const generationTimeMs = Date.now() - startTime;
    logger.info('Gemini image generated', {
      model,
      contentType,
      sizeBytes: imageBuffer.length,
      generationTimeMs,
    });

    return {
      imageBuffer,
      contentType,
      metadata: { model, generationTimeMs },
    };
  }
}

/**
 * Stability AI adapter (fallback provider).
 * Uses the SD3 REST API with API key authentication.
 */
export class StabilityAIAdapter implements ImageGenerationAdapter {
  readonly providerName = 'stability';
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.stability.ai/v2beta/stable-image/generate/sd3';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generate(prompt: string, options?: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const startTime = Date.now();

    logger.info('Generating image with Stability AI', {
      promptLength: prompt.length,
      aspectRatio: options?.aspectRatio ?? '1:1',
    });

    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('output_format', 'png');
    if (options?.aspectRatio) {
      formData.append('aspect_ratio', options.aspectRatio);
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: 'application/json',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Stability AI API error (${response.status}): ${errorText}`);
    }

    const json = await response.json() as { image?: string };
    if (!json.image) {
      throw new Error('Stability AI response did not contain an image');
    }

    const imageBuffer = Buffer.from(json.image, 'base64');
    const generationTimeMs = Date.now() - startTime;

    logger.info('Stability AI image generated', {
      sizeBytes: imageBuffer.length,
      generationTimeMs,
    });

    return {
      imageBuffer,
      contentType: 'image/png',
      metadata: { model: 'sd3', generationTimeMs },
    };
  }
}

/**
 * Factory function to create the configured image generation adapter.
 * Defaults to Gemini (uses existing GOOGLE_API_KEY).
 */
export function createImageGenerationAdapter(): ImageGenerationAdapter {
  if (env.IMAGE_GENERATION_PROVIDER === 'stability') {
    if (!env.STABILITY_API_KEY) {
      throw new Error('STABILITY_API_KEY is required when IMAGE_GENERATION_PROVIDER=stability');
    }
    return new StabilityAIAdapter(env.STABILITY_API_KEY);
  }
  return new GeminiImageAdapter(env.GOOGLE_API_KEY);
}
