# Phase 3B: AI Room Renders — API Research

**Researched:** 2026-02-21
**Domain:** Google Gemini image generation APIs, Imagen 3/4, fallback providers
**Confidence:** HIGH (SDK type definitions verified locally; API docs verified via official Google sources)

---

## Summary

The project already has `@google/genai@1.41.0` installed (alongside the legacy `@google/generative-ai@0.24.1`). The new unified SDK (`@google/genai`) supports both Imagen-based `generateImages()` and Gemini-native `generateContent()` with `responseModalities: ["IMAGE"]`. These are two distinct code paths with different capabilities, cost, and key requirements.

The **recommended path for this project** is **Gemini 2.0/2.5 Flash native image generation** (`gemini-2.0-flash-exp` or `gemini-2.5-flash-image`) via `generateContent()` with `responseModalities`. This works with the existing `GOOGLE_API_KEY`, requires no new credentials, supports image-in/image-out editing (crucial for the "before/after" renovation render feature), and costs ~$0.039/image on the paid tier. Imagen 4 (`generateImages()`) produces higher quality static images but does not support image-to-image editing via the Developer API, and image editing (Imagen's `editImage()`) requires Vertex AI service accounts — incompatible with the current setup.

The **recommended fallback** is **fal.ai FLUX.1 Kontext** for image-to-image editing ($0.04/image, URL-based input, dead-simple Node.js SDK) or **Replicate FLUX** for text-to-image ($0.003–$0.055/image).

**Primary recommendation:** Use `gemini-2.5-flash-image` via `@google/genai` with `generateContent()` + `responseModalities: ["TEXT", "IMAGE"]`. Pass the room photo as base64 inline data for "edit mode" renders. Fall back to fal.ai FLUX Kontext if Gemini image quality is insufficient for renovation renders.

---

## Question-by-Question Findings

### Q1: Does `@google/generative-ai` support image generation (Imagen 3)?

**Answer: No — the legacy package does not. The new `@google/genai` does.**

| Package | Version (installed) | Image Generation | Status |
|---------|-------------------|-----------------|--------|
| `@google/generative-ai` | 0.24.1 | No | **Deprecated** — support ends August 31, 2025 |
| `@google/genai` | 1.41.0 | Yes | **Active, unified SDK** |

The `@google/genai@1.41.0` package is already installed in `backend/`. It exports both `generateImages()` (Imagen) and supports image output via `generateContent()` (Gemini native). This was confirmed by searching the installed `dist/index.mjs`.

**Available image generation models (as of 2026-02-21):**

| Model ID | Method | Quality | Notes |
|----------|--------|---------|-------|
| `imagen-4.0-generate-001` | `generateImages()` | Highest | Text-to-image only via Developer API |
| `imagen-4.0-ultra-generate-001` | `generateImages()` | Premium | $0.06/image |
| `imagen-4.0-fast-generate-001` | `generateImages()` | Good/fast | $0.02/image |
| `gemini-2.5-flash-image` | `generateContent()` | Good | Image editing supported, $0.039/image |
| `gemini-2.0-flash-exp` | `generateContent()` | Good | Experimental, free tier |

**Confidence: HIGH** — Verified against official Google AI docs and local type definitions.

---

### Q2: Correct API call for image generation (early 2026)

**Two distinct patterns exist. Pick one based on use case.**

#### Pattern A: Gemini Native (recommended — supports edit mode)

```typescript
// Source: @google/genai@1.41.0 + official Google Developers Blog
import { GoogleGenAI, Modality } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Text-to-image
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash-image',
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Generate a photorealistic render of a modern kitchen...' }]
    }
  ],
  config: {
    responseModalities: [Modality.TEXT, Modality.IMAGE],
  },
});

// Extract image from response
for (const part of response.candidates?.[0]?.content?.parts ?? []) {
  if (part.inlineData) {
    const imageBase64 = part.inlineData.data; // base64 string
    const mimeType = part.inlineData.mimeType; // e.g. "image/png"
    const buffer = Buffer.from(imageBase64, 'base64');
    // upload buffer to Supabase Storage
  }
}
```

#### Pattern B: Imagen via generateImages() (higher quality, text-to-image only)

```typescript
// Source: github.com/googleapis/js-genai/blob/main/sdk-samples/generate_image.ts
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const response = await ai.models.generateImages({
  model: 'imagen-4.0-generate-001',
  prompt: 'Photorealistic interior render of a modern kitchen renovation...',
  config: {
    numberOfImages: 1,
    aspectRatio: '16:9',          // "1:1" | "3:4" | "4:3" | "9:16" | "16:9"
    outputMimeType: 'image/jpeg',
    includeRaiReason: true,
    negativePrompt: 'blurry, distorted, low quality',
    seed: 42,                     // optional reproducibility
  },
});

// Response: base64 bytes
const imageBase64 = response.generatedImages?.[0]?.image?.imageBytes; // string (base64)
const buffer = Buffer.from(imageBase64!, 'base64');
```

**Confidence: HIGH** — Type definitions verified in `node_modules/@google/genai/dist/genai.d.ts`.

---

### Q3: GOOGLE_API_KEY or Vertex AI service account?

**Both are supported. For this project, `GOOGLE_API_KEY` works for all generation features.**

| Feature | Developer API (`GOOGLE_API_KEY`) | Vertex AI (service account) |
|---------|----------------------------------|------------------------------|
| Imagen text-to-image (`generateImages`) | YES | YES |
| Gemini native image gen (`generateContent`) | YES | YES |
| Imagen `editImage()` (mask/style/subject) | **NO** | YES only |
| `imageSize: "2K"` | No (Imagen 3 only, Imagen 4 unclear) | YES |

**The existing `GOOGLE_API_KEY` in `backend/.env` is sufficient.** The `@google/genai` SDK uses `GEMINI_API_KEY` by default, but also accepts `GOOGLE_API_KEY` — both are picked up automatically. The SDK docs note: "if both are set, `GOOGLE_API_KEY` takes precedence."

```typescript
// Works with existing GOOGLE_API_KEY env var:
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
```

**Confidence: HIGH** — Verified from official SDK README and generate_image.ts sample.

---

### Q4: Input parameters

#### For `generateImages()` (Imagen 4):
```typescript
interface GenerateImagesConfig {
  numberOfImages?: number;       // 1–4, default 1
  aspectRatio?: string;          // "1:1" | "3:4" | "4:3" | "9:16" | "16:9"
  imageSize?: string;            // "1K" | "2K" (not for Imagen 3 models)
  outputMimeType?: string;       // "image/jpeg" | "image/png"
  outputCompressionQuality?: number; // JPEG quality 0-100
  negativePrompt?: string;       // what to exclude
  seed?: number;                 // reproducibility (disabled when addWatermark=true)
  guidanceScale?: number;        // prompt adherence strength
  personGeneration?: PersonGeneration;
  safetyFilterLevel?: SafetyFilterLevel;
  includeRaiReason?: boolean;
  addWatermark?: boolean;
  enhancePrompt?: boolean;       // auto-enhance prompt
}
```

#### For `generateContent()` with images (Gemini native):
```typescript
// Additional config for image output:
config: {
  responseModalities: [Modality.TEXT, Modality.IMAGE],
}
// Prompt max: 480 tokens
```

**Confidence: HIGH** — Extracted directly from `genai.d.ts` in installed package.

---

### Q5: Response format

**Both paths return base64, not URLs.**

```typescript
// generateImages() path:
response.generatedImages[0].image.imageBytes  // base64 string
response.generatedImages[0].image.mimeType    // "image/jpeg" | "image/png"
response.generatedImages[0].raiFilteredReason // string | undefined (if blocked)

// generateContent() path:
response.candidates[0].content.parts[N].inlineData.data     // base64 string
response.candidates[0].content.parts[N].inlineData.mimeType // mime type
```

**To use with Supabase Storage:**
```typescript
const buffer = Buffer.from(imageBase64, 'base64');
// upload buffer with contentType = mimeType
```

**Confidence: HIGH** — Verified from type definitions and official sample code.

---

### Q6: Cost per image

| Model/Path | Cost (paid) | Free Tier |
|-----------|------------|-----------|
| `imagen-4.0-fast-generate-001` | $0.02/image | None |
| `imagen-4.0-generate-001` | $0.04/image | None |
| `imagen-4.0-ultra-generate-001` | $0.06/image | None |
| `gemini-2.5-flash-image` | $0.039/image (~1290 tokens @ $0.0003/1K output) | None |
| `gemini-2.0-flash-exp` | ~$0.039/image (paid); **free** (free tier) | Yes |
| fal.ai FLUX.1 Kontext (fallback) | $0.04/image | None |
| Replicate FLUX.1 schnell (fallback) | $0.003/image | None |

**Practical recommendation for this project:** Start with `gemini-2.0-flash-exp` (free tier for development), switch to `gemini-2.5-flash-image` (paid, $0.039/image) for production.

**Confidence: MEDIUM** — Pricing sourced from official Google AI pricing page (fetched 2026-02-21) and fal.ai model page. Prices can change.

---

### Q7: Rate limits

**Gemini Developer API rate limits (as of early 2026):**

| Model | Free Tier | Paid Tier 1 | Paid Tier 2 |
|-------|-----------|-------------|-------------|
| Imagen 4 | Not available | ~2 IPM (Images Per Minute), ~100 RPD | Higher (check AI Studio) |
| `gemini-2.5-flash-image` | Limited (~10-20 RPD) | ~150 RPM | 1000+ RPM |
| `gemini-2.0-flash-exp` | 1500 images/day (AI Studio) | — | — |

**Key constraint:** Imagen models have a separate **IPM (Images Per Minute)** quota — approximately 2 IPM on Tier 1. This means a max of ~120 images/hour. For a renovation SaaS at early stage, this is fine. BullMQ already handles async processing, so rate limiting is a worker concern, not a user-facing one.

**Rate limit handling pattern for BullMQ worker:**
```typescript
// In render.worker.ts — add rate limit config to job options:
const job = await renderQueue.add('render:generate', jobData, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 }, // 30s base, handles 429s
});
```

**Confidence: MEDIUM** — Approximate figures from community sources. Actual limits are account/project specific and visible in Google AI Studio dashboard.

---

### Q8: Image editing ("edit mode") — pass existing room photo + prompt

This is the **critical feature** for renovation renders. The two Google paths have very different capabilities:

#### Option A: Gemini Native (RECOMMENDED — works with GOOGLE_API_KEY)

`gemini-2.0-flash-exp` / `gemini-2.5-flash-image` support **conversational image editing**: pass the room photo as base64 alongside a text prompt describing changes.

```typescript
// Source: google-gemini/gemini-image-editing-nextjs-quickstart
import { GoogleGenAI, Modality } from '@google/genai';
import * as fs from 'node:fs';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Read room photo as base64
const photoBase64 = fs.readFileSync(roomPhotoPath).toString('base64');
// Or: fetch from Supabase Storage signed URL, convert to buffer, then base64

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash-image',
  contents: [
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: photoBase64,            // base64 of existing room photo
          }
        },
        {
          text: `This is a photo of a kitchen. Generate a photorealistic renovation render
                 showing: white shaker cabinets, quartz countertops, subway tile backsplash,
                 brushed nickel hardware. Keep the same room layout, window positions,
                 and lighting direction. Photorealistic architectural photography style,
                 wide-angle shot, 50mm lens.`
        }
      ]
    }
  ],
  config: {
    responseModalities: [Modality.TEXT, Modality.IMAGE],
  },
});

// Extract image
for (const part of response.candidates?.[0]?.content?.parts ?? []) {
  if (part.inlineData) {
    const buffer = Buffer.from(part.inlineData.data!, 'base64');
    // upload to Supabase Storage
  }
}
```

**Limitations of Gemini native editing:**
- Does not apply surgical pixel-level edits — it redraws the scene
- Quality may not match Imagen for photorealism
- Works via multimodal conversation, not explicit mask regions

#### Option B: Imagen `editImage()` (NOT recommended — requires Vertex AI)

The SDK exports `ai.models.editImage()` with mask-based inpainting, style transfer, and subject reference. However, the official sample code explicitly states: `"Editing an image is not supported in Gemini Developer API."` This requires a Vertex AI service account and Google Cloud project.

**Conclusion:** Gemini native generation is the only image-editing path available with `GOOGLE_API_KEY`.

**Confidence: HIGH** — Confirmed from SDK samples at `googleapis/js-genai` (verified `editImage` requires `GOOGLE_GENAI_USE_VERTEXAI`).

---

### Q9: Best prompt patterns for interior design / renovation renders

**Template for text-to-image renovation renders:**

```
[Room type] renovation render, [style name] aesthetic.
[Key changes: surfaces, cabinets, lighting, flooring].
Materials: [specific materials — oak, quartz, subway tile, etc.].
Lighting: [natural light through windows / warm pendant lighting / golden hour sunlight].
Photography: architectural interior photography, wide-angle shot, 50mm lens,
shallow depth of field, DSLR photo style, 4K resolution.
[Negative]: no clutter, no people, no duplicate furniture, not blurry.
```

**Example for a kitchen:**
```
Photorealistic kitchen renovation render, modern Scandinavian aesthetic.
White shaker cabinets with brushed brass hardware, Calacatta quartz countertops,
white subway tile backsplash, warm oak hardwood floors.
Warm ambient pendant lighting over island, natural light from windows.
Architectural interior photography style, wide-angle shot, 50mm lens,
DSLR quality, 4K resolution, high detail.
```

**Example for a bathroom:**
```
Photorealistic bathroom renovation render, spa-inspired contemporary style.
Freestanding soaking tub, floor-to-ceiling marble tile, frameless glass shower,
matte black fixtures, floating vanity with LED backlit mirror.
Warm diffused lighting, natural light from frosted window.
Architectural photography, wide-angle, professional staging, 4K photorealistic.
```

**For image editing (pass room photo + prompt):**
```
Using the provided room photo, generate a photorealistic renovation render showing
[specific changes]. Keep the same room dimensions, window positions, and natural
lighting direction. Change only [what to change]. Preserve [what to keep].
Photorealistic architectural photography style, wide-angle, professional staging.
```

**Key principles (from Google's official prompting guide):**
- **Describe scenes, not keywords** — narrative paragraphs beat word lists
- **Be specific with materials** — "Calacatta quartz" not "white countertop"
- **Use photography language** — "50mm lens", "shallow depth of field", "DSLR quality"
- **Lighting is the #1 realism factor** — always specify
- **Positive framing** — describe what to show, use `negativePrompt` for exclusions
- **Iterative refinement** — Gemini supports multi-turn conversation for adjustments

**Confidence: HIGH** — From Google's official Gemini 2.5 Flash prompting guide and professional interior design AI research.

---

### Q10: Fallback options if Gemini image generation is insufficient

#### Fallback 1: fal.ai FLUX.1 Kontext (RECOMMENDED fallback for edit mode)

Best for image-to-image editing. Preserves room structure while applying renovation changes.

```typescript
// npm install @fal-ai/client
import { fal } from '@fal-ai/client';

fal.config({ credentials: process.env.FAL_API_KEY });

const result = await fal.subscribe('fal-ai/flux-pro/kontext', {
  input: {
    prompt: 'Transform this kitchen with white shaker cabinets, quartz countertops...',
    image_url: supabaseSignedUrl,  // URL of original room photo
    guidance_scale: 3.5,
    num_inference_steps: 28,
    seed: 42,
  },
});

const outputUrl = result.data.images[0].url;  // returns URL, not base64
// fetch URL → buffer → upload to Supabase Storage
```

| Metric | Value |
|--------|-------|
| Cost | $0.04/image |
| Input | Image URL (not base64) |
| Output | Image URL (fetch to get buffer) |
| Edit mode | YES — image-to-image |
| Rate limits | Not published (generous in practice) |
| Package | `@fal-ai/client` |
| Env var | `FAL_API_KEY` |

#### Fallback 2: Replicate FLUX (text-to-image, cheapest)

```typescript
// npm install replicate
import Replicate from 'replicate';

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

const [output] = await replicate.run(
  'black-forest-labs/flux-schnell',
  {
    input: {
      prompt: 'Photorealistic kitchen renovation render...',
      aspect_ratio: '16:9',
      num_outputs: 1,
    }
  }
) as [string];  // returns URL string

// output is a URL — fetch to get buffer
```

| Metric | Value |
|--------|-------|
| Cost | $0.003/image (schnell), $0.030 (dev), $0.055 (pro) |
| Output | URL string |
| Edit mode | NO (text-to-image only for schnell/dev) |
| Package | `replicate` |
| Env var | `REPLICATE_API_TOKEN` |

#### Fallback 3: Stability AI (Stable Image Core)

REST API directly — no official npm SDK with good maintenance.
- Cost: $0.03/image (Core), $0.08/image (Ultra)
- Multipart form upload
- Returns base64 JSON
- **Not recommended** — REST-only, less clean than fal.ai

#### Fallback Decision Matrix

| Need | Use |
|------|-----|
| Edit existing room photo (recommended) | Gemini 2.5 Flash (`generateContent` + photo base64) |
| Highest quality text-to-image | Imagen 4 (`generateImages`) |
| Edit mode fallback | fal.ai FLUX.1 Kontext |
| Cheapest text-to-image | Replicate FLUX schnell |
| Vertex AI available | Imagen `editImage()` (surgical inpainting) |

---

## Standard Stack

### Core (recommended implementation)
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `@google/genai` | 1.41.0 (installed) | Gemini native image gen + Imagen | Already installed, unified SDK |
| `@fal-ai/client` | latest | Fallback image-to-image via FLUX Kontext | Clean SDK, $0.04/image, URL input |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `replicate` | latest | Cheapest text-to-image fallback | If cost is primary constraint |

### Do NOT Use
- `@google/generative-ai` — deprecated August 2025, does not support image generation
- `@google-cloud/vertexai` — requires service account, incompatible with current setup
- Stability AI direct REST — no maintained npm SDK, worse DX than fal.ai

**Installation (only if adding fallback):**
```bash
# fal.ai fallback (add only if needed):
pnpm --filter backend add @fal-ai/client

# Replicate fallback (add only if needed):
pnpm --filter backend add replicate
```

The primary path (`@google/genai`) is already installed — no new packages needed for Phase 3.2.

---

## Architecture Patterns

### Recommended: Strategy Pattern with Primary + Fallback

```typescript
// backend/src/services/image-generation.service.ts

export interface ImageGenerationResult {
  imageBuffer: Buffer;
  contentType: string;
  metadata: {
    model: string;
    provider: 'gemini' | 'fal' | 'replicate';
    seed?: number;
    generationTimeMs: number;
  };
}

export interface ImageGenerationAdapter {
  generateFromText(prompt: string, options?: GenerationOptions): Promise<ImageGenerationResult>;
  generateFromImage(photoBuffer: Buffer, photoMimeType: string, prompt: string, options?: GenerationOptions): Promise<ImageGenerationResult>;
}

// Primary adapter
export class GeminiNativeAdapter implements ImageGenerationAdapter { ... }

// Fallback adapter (edit mode)
export class FalFluxKontextAdapter implements ImageGenerationAdapter { ... }

// Fallback adapter (text-to-image, cheapest)
export class ReplicateFluxAdapter implements ImageGenerationAdapter { ... }
```

### Environment Variable Control

```env
# backend/.env
# Primary: gemini | fal | replicate
IMAGE_GENERATION_PROVIDER=gemini

# Optional fallbacks (only if providers added):
FAL_API_KEY=
REPLICATE_API_TOKEN=

# Existing (already used by Gemini chat):
GOOGLE_API_KEY=...
```

### Loading Room Photo for Edit Mode

Room photos are stored in Supabase Storage. To pass them as base64 to Gemini:

```typescript
// In render.service.ts
import { getAssetSignedUrl } from './asset.service.js';

async function loadRoomPhotoAsBase64(assetId: string): Promise<{ data: string; mimeType: string }> {
  const signedUrl = await getAssetSignedUrl(assetId);
  const response = await fetch(signedUrl);
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get('content-type') ?? 'image/jpeg';
  return {
    data: buffer.toString('base64'),
    mimeType,
  };
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image base64 encoding | Manual Buffer gymnastics | `Buffer.from(bytes, 'base64')` (Node built-in) | Already available |
| Rate limit retry | Custom exponential backoff | BullMQ `attempts` + `backoff: { type: 'exponential' }` | Already configured |
| Image prompt construction | Ad-hoc string concat | Typed prompt builder with room context | Prevents token waste |
| Provider switching | If/else in service | Strategy pattern adapter (already in PLAN.md) | Clean swap without if/else explosion |

---

## Common Pitfalls

### Pitfall 1: Using `@google/generative-ai` for image generation

**What goes wrong:** Calling image generation on the deprecated package — it does not support `responseModalities: ["IMAGE"]` or `generateImages()`.
**Why it happens:** Both packages are installed; it's easy to import from the wrong one.
**How to avoid:** All image generation code must import from `@google/genai`, not `@google/generative-ai`.
**Warning signs:** `TypeError: model.generateContent is not a function` or missing `responseModalities` support.

```typescript
// WRONG:
import { GoogleGenerativeAI } from '@google/generative-ai';

// CORRECT for image generation:
import { GoogleGenAI, Modality } from '@google/genai';
```

### Pitfall 2: Expecting Imagen `editImage()` to work with GOOGLE_API_KEY

**What goes wrong:** Calling `ai.models.editImage()` with Developer API key — throws `"Editing an image is not supported in Gemini Developer API"`.
**Why it happens:** `editImage()` is exported by the SDK but only functions with Vertex AI (`GOOGLE_GENAI_USE_VERTEXAI=true`).
**How to avoid:** Use `generateContent()` with photo + text for image editing. Reserve `editImage()` for Vertex AI path.

### Pitfall 3: Large room photos hitting Gemini's inline data limit

**What goes wrong:** Photos > ~5MB cause request failures when sent as base64 inline.
**Why it happens:** Gemini recommends File API for large uploads, but file uploads add latency.
**How to avoid:** Resize/compress room photos before sending. Target < 1MB for inline. Add a preprocessing step in the worker:
```typescript
// Use sharp to resize before encoding:
// pnpm --filter backend add sharp
import sharp from 'sharp';
const compressed = await sharp(originalBuffer)
  .resize({ width: 1024, withoutEnlargement: true })
  .jpeg({ quality: 85 })
  .toBuffer();
```

### Pitfall 4: No `responseModalities` = no image output

**What goes wrong:** `generateContent()` returns only text, even if prompted for an image.
**Why it happens:** Image output must be explicitly requested.
**How to avoid:** Always include `config: { responseModalities: [Modality.TEXT, Modality.IMAGE] }`.

### Pitfall 5: Imagen free tier doesn't exist

**What goes wrong:** Dev environment produces `403 PERMISSION_DENIED: Imagen 4 is not available on the free tier`.
**Why it happens:** Unlike Gemini text models, Imagen 4 has no free tier at all.
**How to avoid:** Use `gemini-2.0-flash-exp` during development (free tier available). Switch to paid Imagen 4 or `gemini-2.5-flash-image` for production. The `IMAGE_GENERATION_PROVIDER` env var controls this.

### Pitfall 6: Forgetting `raiFilteredReason` handling

**What goes wrong:** `response.generatedImages[0]` exists but `imageBytes` is undefined — image was blocked by Responsible AI filters.
**Why it happens:** Interior design prompts mentioning structural elements, demolition, or before/after states can occasionally trigger filters.
**How to avoid:** Always check for `raiFilteredReason` and throw a meaningful error:
```typescript
const img = response.generatedImages?.[0];
if (!img?.image?.imageBytes) {
  throw new Error(`Image generation blocked: ${img?.raiFilteredReason ?? 'unknown reason'}`);
}
```

---

## Code Examples

### Complete GeminiNativeAdapter (text-to-image)

```typescript
// Source: googleapis/js-genai sdk-samples + official type definitions
import { GoogleGenAI, Modality } from '@google/genai';
import type { ImageGenerationAdapter, ImageGenerationResult } from './image-generation.service.js';

export class GeminiNativeAdapter implements ImageGenerationAdapter {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  }

  async generateFromText(
    prompt: string,
    options: { model?: string; aspectRatio?: string } = {}
  ): Promise<ImageGenerationResult> {
    const model = options.model ?? 'gemini-2.5-flash-image';
    const startMs = Date.now();

    const response = await this.ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return {
          imageBuffer: Buffer.from(part.inlineData.data, 'base64'),
          contentType: part.inlineData.mimeType ?? 'image/png',
          metadata: { model, provider: 'gemini', generationTimeMs: Date.now() - startMs },
        };
      }
    }
    throw new Error('Gemini returned no image part');
  }

  async generateFromImage(
    photoBuffer: Buffer,
    photoMimeType: string,
    prompt: string,
    options: { model?: string } = {}
  ): Promise<ImageGenerationResult> {
    const model = options.model ?? 'gemini-2.5-flash-image';
    const startMs = Date.now();

    const response = await this.ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: photoMimeType,
                data: photoBuffer.toString('base64'),
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
    });

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return {
          imageBuffer: Buffer.from(part.inlineData.data, 'base64'),
          contentType: part.inlineData.mimeType ?? 'image/png',
          metadata: { model, provider: 'gemini', generationTimeMs: Date.now() - startMs },
        };
      }
    }
    throw new Error('Gemini image editing returned no image part');
  }
}
```

### Complete Imagen 4 Adapter (text-to-image, higher quality)

```typescript
// Source: github.com/googleapis/js-genai/blob/main/sdk-samples/generate_image.ts
import { GoogleGenAI } from '@google/genai';

export class GeminiImagenAdapter implements ImageGenerationAdapter {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  }

  async generateFromText(
    prompt: string,
    options: { aspectRatio?: string; seed?: number } = {}
  ): Promise<ImageGenerationResult> {
    const startMs = Date.now();
    const model = 'imagen-4.0-generate-001';

    const response = await this.ai.models.generateImages({
      model,
      prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: options.aspectRatio ?? '16:9',
        outputMimeType: 'image/jpeg',
        includeRaiReason: true,
        negativePrompt: 'blurry, distorted, watermark, text overlay, people',
        ...(options.seed ? { seed: options.seed } : {}),
      },
    });

    const img = response.generatedImages?.[0];
    if (!img?.image?.imageBytes) {
      throw new Error(`Imagen blocked: ${img?.raiFilteredReason ?? 'no image returned'}`);
    }

    return {
      imageBuffer: Buffer.from(img.image.imageBytes, 'base64'),
      contentType: img.image.mimeType ?? 'image/jpeg',
      metadata: { model, provider: 'gemini', generationTimeMs: Date.now() - startMs },
    };
  }

  async generateFromImage(): Promise<ImageGenerationResult> {
    // Imagen editImage() requires Vertex AI — not supported with GOOGLE_API_KEY
    throw new Error('Image-to-image editing requires Vertex AI. Use GeminiNativeAdapter instead.');
  }
}
```

### fal.ai Fallback Adapter

```typescript
// Source: fal.ai/models/fal-ai/flux-pro/kontext
import { fal } from '@fal-ai/client';

fal.config({ credentials: process.env.FAL_API_KEY });

export class FalFluxKontextAdapter implements ImageGenerationAdapter {
  async generateFromImage(
    _photoBuffer: Buffer, // fal.ai needs URL, not buffer — upload first or use Supabase URL directly
    _photoMimeType: string,
    prompt: string,
    options: { imageUrl: string } // pass Supabase signed URL
  ): Promise<ImageGenerationResult> {
    const startMs = Date.now();

    const result = await fal.subscribe('fal-ai/flux-pro/kontext', {
      input: {
        prompt,
        image_url: options.imageUrl,   // Supabase Storage signed URL
        guidance_scale: 3.5,
        num_inference_steps: 28,
      },
    });

    const outputUrl = (result.data as { images: Array<{ url: string }> }).images[0].url;
    const fetchResponse = await fetch(outputUrl);
    const imageBuffer = Buffer.from(await fetchResponse.arrayBuffer());

    return {
      imageBuffer,
      contentType: 'image/jpeg',
      metadata: { model: 'fal-ai/flux-pro/kontext', provider: 'fal', generationTimeMs: Date.now() - startMs },
    };
  }

  async generateFromText(prompt: string): Promise<ImageGenerationResult> {
    // fal.ai also supports text-to-image, use flux-schnell for cheap generation
    const startMs = Date.now();
    const result = await fal.subscribe('fal-ai/flux/schnell', {
      input: { prompt, image_size: 'landscape_16_9', num_images: 1 },
    });

    const outputUrl = (result.data as { images: Array<{ url: string }> }).images[0].url;
    const fetchResponse = await fetch(outputUrl);
    const imageBuffer = Buffer.from(await fetchResponse.arrayBuffer());

    return {
      imageBuffer,
      contentType: 'image/jpeg',
      metadata: { model: 'fal-ai/flux/schnell', provider: 'fal', generationTimeMs: Date.now() - startMs },
    };
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@google/generative-ai` for everything | `@google/genai` (unified SDK) | Aug 2025 (deprecation announced) | Must use `@google/genai` for image gen |
| Imagen 3 (`imagen-3.0-generate-002`) | Imagen 4 (`imagen-4.0-generate-001`) | Early 2025 | Better quality, same API shape |
| `gemini-2.0-flash-exp` for image gen | `gemini-2.5-flash-image` for production | Late 2025 | More stable, same cost |
| DALL-E 3 as default fallback | FLUX (via fal.ai / Replicate) | 2024-2025 | Better quality/cost, more control |

**Deprecated/outdated:**
- `@google/generative-ai`: Support ends August 31, 2025. Do not use for new image generation code.
- Imagen 3 models (`imagen-3.0-generate-002`, `imagen-3.0-capability-001`): Still available but superseded by Imagen 4.
- `gemini-2.0-flash-preview-image-generation`: Preview model name, superseded by stable `gemini-2.5-flash-image`.

---

## Open Questions

1. **Does `gemini-2.5-flash-image` produce photo-quality interior renders?**
   - What we know: It supports image editing via `generateContent()`. Reviewers note it is less photorealistic than Imagen for architectural work.
   - What's unclear: Whether quality is acceptable for renovation renders (subjective).
   - Recommendation: Test with 3-5 renovation prompts in Google AI Studio before committing to the implementation path. If quality is poor, default to Imagen 4 for text-to-image and fal.ai Kontext for edit mode.

2. **Exact IPM (Images Per Minute) for Imagen 4 on the project's billing tier**
   - What we know: ~2 IPM is documented for Imagen on Tier 1, ~100 RPD.
   - What's unclear: Whether this project is on Tier 1 (requires $0.01+ spend) or free.
   - Recommendation: Check Google AI Studio dashboard before implementing rate-limit backoff. BullMQ's exponential backoff covers the retry case regardless.

3. **fal.ai image URL persistence**
   - What we know: fal.ai returns a URL to the generated image.
   - What's unclear: How long that URL is valid (could be ephemeral).
   - Recommendation: Always fetch the buffer immediately and upload to Supabase Storage. Do not store fal.ai URLs as permanent references.

---

## Sources

### Primary (HIGH confidence)
- `node_modules/@google/genai/dist/genai.d.ts` (installed v1.41.0) — type definitions for `generateImages`, `editImage`, `GenerateImagesConfig`, `GeneratedImage`
- `node_modules/@google/genai/dist/index.mjs` — confirms `generateImages` and `editImage` exported
- `https://github.com/googleapis/js-genai/blob/main/sdk-samples/generate_image.ts` — official Google sample confirming `generateImagesFromMLDev` uses `GEMINI_API_KEY`
- `https://github.com/googleapis/js-genai/blob/main/sdk-samples/edit_image_mask_reference.ts` — confirms `editImage` requires Vertex AI, error message explicit
- `https://ai.google.dev/gemini-api/docs/imagen` (fetched 2026-02-21) — model names `imagen-4.0-generate-001`, `imagen-4.0-ultra-generate-001`, `imagen-4.0-fast-generate-001`, response format
- `https://ai.google.dev/gemini-api/docs/pricing` (fetched 2026-02-21) — $0.02/$0.04/$0.06 per Imagen image, $0.039 Gemini Flash Image

### Secondary (MEDIUM confidence)
- `https://fal.ai/models/fal-ai/flux-pro/kontext` — $0.04/image, image_url input, URL output
- `https://developers.googleblog.com/en/how-to-prompt-gemini-2-5-flash-image-generation-for-the-best-results/` — prompt engineering guidance verified
- `https://replicate.com/docs/get-started/nodejs` — Replicate Node.js SDK pattern, URL output

### Tertiary (LOW confidence — cross-reference before relying)
- Rate limit numbers (2 IPM for Imagen Tier 1, 100 RPD) — sourced from community articles, verify in AI Studio dashboard
- Gemini 2.0-flash-exp free tier 1500 images/day — sourced from community; verify against actual account

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — installed package verified locally
- Architecture: HIGH — based on official SDK samples and type definitions
- Pitfalls: HIGH — based on explicit SDK error messages and type definitions
- Pricing: MEDIUM — from official pricing page, subject to change
- Rate limits: LOW — from community sources, account-specific

**Research date:** 2026-02-21
**Valid until:** 2026-05-21 (stable for 90 days; Imagen/Gemini pricing/models change every 3-6 months)
