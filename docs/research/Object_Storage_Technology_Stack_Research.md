# Object Storage Technology Stack Research

**Date:** 2026-02-13
**Analyst:** Technology Stack Advisor
**Context:** Renovation Agent SaaS - AI-powered renovation planning assistant

---

## Executive Summary

**Recommendation: STICK WITH SUPABASE STORAGE** (current implementation)

**Rationale:** You already have Supabase Storage successfully integrated for Phase 2.1 (user uploads) and Phase 2.3 (style images). Given your deployment architecture (Vercel frontend, containerized backend, Supabase PostgreSQL), migrating to another provider would introduce unnecessary complexity and costs without meaningful benefits at your current scale.

**Key Decision Factors:**
- ✅ Already integrated and working (AssetService, StyleImageService operational)
- ✅ Supabase Image Transformations meet optimization needs (free on-the-fly resize/WebP conversion)
- ✅ CDN included (global edge caching)
- ✅ Unified platform (auth + database + storage simplifies ops)
- ✅ Cost-effective ($0.021/GB storage, $0.09/GB egress on Pro plan)
- ❌ Vendor lock-in risk (but mitigated by S3-compatible API)

**Cost Projection (10k users, 50GB storage, 200GB egress/month):**
- Supabase Pro: $25/month base + ~$19/month storage/bandwidth = **$44/month**
- AWS S3 + CloudFront: ~$35/month (but requires separate auth, more complexity)
- Cloudflare R2: ~$5/month (but no native CDN, fewer features)

**When to Reconsider:** If storage needs exceed 500GB or you migrate away from Supabase Auth/Database.

---

## Problem Statement

You need object storage for:
1. **User-uploaded room photos** (Phase 2.1) - JPEG/PNG/WebP, 2-10MB each, private (signed URLs)
2. **Style moodboard images** (Phase 2.3) - JPEG from Unsplash, 500KB-2MB each, public
3. **AI-generated renders** (Phase 3) - PNG/WebP, 5-10MB each, private → public after payment
4. **PDF renovation plans** (Phase 4) - PDF, 2-5MB each, private (signed URLs)
5. **Before/after photos** (Phase 5+) - High-res JPEG/PNG, 10-20MB each, public

**Requirements:**
- Image optimization pipeline (resize, format conversion, thumbnails)
- Virus scanning for user uploads
- CDN for fast global delivery
- Private/public access controls (signed URLs)
- Integration with Supabase Auth (user_id based access)
- Cost-effective at SaaS scale (100s-1000s users)

**Current State:**
- ✅ Supabase Storage integrated (@supabase/supabase-js admin client)
- ✅ Two buckets: `room-assets` (private), `style-assets` (public)
- ✅ AssetService handles upload, delete, signed URLs
- ✅ StyleImageService handles public URLs, seeding
- ✅ Vercel frontend deployment (CDN for static assets)
- ⚠️ No image optimization pipeline (Phase 3 blocker)
- ⚠️ No virus scanning

---

## Solution Vectors Evaluated

### Solution 1: Supabase Storage (Status Quo - RECOMMENDED)

**Overview:** PostgreSQL-native object storage with S3-compatible API, integrated auth, and built-in image transformations.

**Architecture:**
```
Frontend (Vercel) → Backend (Express) → Supabase Storage
                                      ↓
                              CDN (Global Edge)
                                      ↓
                            Image Transformations
                         (resize, format, quality)
```

**Pros:**
- ✅ **Already integrated** - Zero migration cost, working code in production
- ✅ **Unified platform** - Auth + DB + Storage (single vendor, single invoice, single SDK)
- ✅ **Image Transformations** - Built-in on-the-fly resize, format conversion (WebP/AVIF), quality control
  - Example: `${url}?width=800&height=600&quality=80&format=webp`
  - No extra service needed (eliminates Imgix/Cloudinary costs)
- ✅ **CDN included** - Global edge caching via Supabase CDN (Cloudflare-backed)
- ✅ **Row-Level Security (RLS)** - Native PostgreSQL policies for access control
  - Can restrict uploads by user_id via SQL policies
- ✅ **Signed URLs** - Built-in temporary URL generation (already implemented in AssetService)
- ✅ **S3-compatible API** - Escape hatch if you need to migrate later (use s3cmd, rclone)
- ✅ **Vercel synergy** - Both use edge networks, low latency
- ✅ **Generous free tier** - 1GB storage, 2GB egress on free plan
- ✅ **Resumable uploads** - Built-in support for large files (10MB+ renders)

**Cons:**
- ❌ **No virus scanning** - Must add third-party service (VirusTotal, ClamAV)
- ❌ **Vendor lock-in** - Tightly coupled to Supabase ecosystem
- ❌ **Limited geo-replication controls** - Can't manually specify regions
- ❌ **Image transformation limits** - 5MB max file size for transforms (fine for your use case)
- ❌ **Egress costs** - $0.09/GB after free tier (higher than Cloudflare R2's $0)

**Complexity:** ⭐⭐⭐⭐⭐ (5/5 - lowest, already done)

**Cost Breakdown (10k users scenario):**
```
Assumptions:
- 10k users, 50% upload at least 1 photo
- Average 3 photos per user @ 5MB each = 75GB storage
- 200GB egress/month (CDN, API calls)

Supabase Pro Plan ($25/month):
- Storage: $0.021/GB × 75GB = $1.58/month
- Egress: $0.09/GB × 200GB = $18/month
TOTAL: $44.58/month
```

**Time to Implement:** 0 days (already done) + 2 days for virus scanning integration

**Fit Score:** 95/100

**Code Example (Current Implementation):**
```typescript
// backend/src/services/asset.service.ts (lines 173-181)
const { data, error } = await supabaseAdmin.storage
  .from(bucketName)
  .createSignedUploadUrl(storagePath);

// Image optimization (add to frontend)
export function getOptimizedImageUrl(path: string, width = 800): string {
  return `${env.SUPABASE_URL}/storage/v1/object/public/room-assets/${path}?width=${width}&quality=80&format=webp`;
}
```

**Files to Modify:**
- None (already integrated)
- Add: `frontend/lib/image-utils.ts` (optimization helpers)
- Add: `backend/src/services/virus-scan.service.ts` (VirusTotal integration)

---

### Solution 2: AWS S3 + CloudFront (Industry Standard)

**Overview:** Industry-standard object storage with separate CDN layer, full control over replication and caching.

**Architecture:**
```
Frontend (Vercel) → Backend (Express) → AWS S3 (us-east-1)
                                      ↓
                              CloudFront CDN
                                      ↓
                              Lambda@Edge (resizing)
```

**Pros:**
- ✅ **Industry standard** - Most mature, battle-tested at massive scale
- ✅ **Full control** - Granular bucket policies, lifecycle rules, versioning
- ✅ **Advanced features** - S3 Object Lambda, S3 Select, intelligent tiering
- ✅ **No vendor lock-in risk** - De facto standard, easy migration
- ✅ **Comprehensive tooling** - AWS CLI, SDKs, monitoring (CloudWatch)
- ✅ **Image optimization** - Lambda@Edge for on-the-fly resizing (custom code)
- ✅ **Virus scanning** - AWS Marketplace solutions (Trend Micro, ClamAV integration)

**Cons:**
- ❌ **High complexity** - Requires IAM roles, bucket policies, CloudFront distributions, Lambda functions
- ❌ **Separate auth** - No native Supabase Auth integration (must implement S3 presigned URLs)
- ❌ **Higher egress costs** - $0.09/GB S3 + $0.085/GB CloudFront
- ❌ **Migration effort** - Rewrite AssetService, StyleImageService (3-5 days work)
- ❌ **Cost unpredictability** - Requests, data transfer, Lambda invocations add up
- ❌ **Learning curve** - IAM policies, S3 bucket configs, CloudFront caching rules

**Complexity:** ⭐⭐ (2/5 - high complexity)

**Cost Breakdown (10k users):**
```
S3 Standard:
- Storage: $0.023/GB × 75GB = $1.73/month
- PUT requests: 15k uploads × $0.005/1k = $0.08/month
- GET requests: 500k views × $0.0004/1k = $0.20/month

CloudFront:
- Egress: $0.085/GB × 200GB = $17/month
- HTTPS requests: 500k × $0.0100/10k = $0.50/month

Lambda@Edge (image resizing):
- Invocations: 100k × $0.60/1M = $0.06/month
- Duration: 100k × 128MB × 50ms × $0.00005001/GB-sec = $0.32/month

TOTAL: $19.89/month
PLUS: Time to migrate (3-5 days @ $500/day = $1500-2500 one-time cost)
```

**Time to Implement:** 5 days (rewrite services, IAM setup, CloudFront config, Lambda@Edge)

**Fit Score:** 60/100 (better long-term, but high migration cost for marginal benefits now)

**Code Example:**
```typescript
// backend/src/services/s3-asset.service.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({ region: 'us-east-1' });

async function generatePresignedUploadUrl(key: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: 'renovation-agent-assets',
    Key: key,
    ContentType: 'image/jpeg',
  });

  return await getSignedUrl(s3, command, { expiresIn: 900 });
}
```

**Files to Create:**
- `backend/src/services/s3-asset.service.ts`
- `backend/src/config/aws.ts`
- `infrastructure/cloudfront-distribution.yaml`
- `infrastructure/lambda-edge-resize.js`

---

### Solution 3: Cloudflare R2 (Zero-Egress Costs)

**Overview:** S3-compatible object storage with zero egress fees, designed to undercut AWS on bandwidth costs.

**Architecture:**
```
Frontend (Vercel) → Backend (Express) → Cloudflare R2
                                      ↓
                          (No native CDN - use Workers)
```

**Pros:**
- ✅ **Zero egress fees** - No bandwidth charges (only storage)
- ✅ **S3-compatible API** - Drop-in replacement for S3 SDK
- ✅ **Cost-effective** - $0.015/GB storage (cheaper than S3)
- ✅ **Cloudflare Workers integration** - Edge computing for image transforms
- ✅ **No request charges** - Unlimited reads/writes
- ✅ **Public buckets** - Native public URL support

**Cons:**
- ❌ **No native CDN** - Must use Cloudflare Workers or external CDN (added complexity)
- ❌ **No image transformations** - Must build custom Worker scripts
- ❌ **Limited geo-replication** - Data stored in Cloudflare's edge, less control than S3
- ❌ **No Supabase Auth integration** - Separate authentication layer
- ❌ **Migration effort** - Rewrite services (3-4 days)
- ❌ **Newer service** - Less mature than S3, fewer integrations

**Complexity:** ⭐⭐⭐ (3/5 - moderate, need Workers for transforms)

**Cost Breakdown (10k users):**
```
Cloudflare R2:
- Storage: $0.015/GB × 75GB = $1.13/month
- Class A operations (PUT): 15k × $4.50/1M = $0.07/month
- Class B operations (GET): 500k × $0.36/1M = $0.18/month
- Egress: $0/GB (FREE!)

Cloudflare Workers (image transforms):
- Requests: 100k × $0.50/1M = $0.05/month
- CPU time: 100k × 10ms × $0.30/10M ms = $0.03/month

TOTAL: $1.46/month
PLUS: Migration cost (3-4 days)
```

**Time to Implement:** 4 days (migrate services, write Worker scripts for transforms)

**Fit Score:** 70/100 (great cost savings long-term, but need custom transforms)

**Code Example:**
```typescript
// backend/src/services/r2-asset.service.ts
import { S3Client } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

// Cloudflare Worker for image transforms (deploy separately)
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const width = url.searchParams.get('width') || '800';

    const object = await env.R2_BUCKET.get(url.pathname);
    const image = await resize(object, { width: parseInt(width) });

    return new Response(image, {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'max-age=86400' },
    });
  }
};
```

---

### Solution 4: DigitalOcean Spaces (Simpler Alternative)

**Overview:** S3-compatible storage with built-in CDN, designed for developers (simpler than AWS).

**Pros:**
- ✅ **S3-compatible** - Familiar API
- ✅ **CDN included** - No separate CloudFront setup
- ✅ **Flat pricing** - $5/month for 250GB storage + 1TB egress
- ✅ **Simple UI** - Easier than AWS console

**Cons:**
- ❌ **No image transformations** - Must use third-party (Imgix, Cloudinary)
- ❌ **Limited regions** - Fewer data centers than AWS/Cloudflare
- ❌ **Migration effort** - Same as S3

**Complexity:** ⭐⭐⭐ (3/5)

**Cost:** $5/month flat (included 250GB storage + 1TB egress)

**Fit Score:** 65/100

---

### Solution 5: Backblaze B2 (Ultra-Low-Cost)

**Overview:** Cheapest storage option, S3-compatible, designed for backups and archives.

**Pros:**
- ✅ **Ultra-cheap storage** - $0.005/GB ($0.38/month for 75GB)
- ✅ **Free egress to Cloudflare** - Partnership for zero-cost CDN
- ✅ **S3-compatible**

**Cons:**
- ❌ **Slower performance** - Designed for backups, not real-time apps
- ❌ **Limited features** - No native transforms, basic API
- ❌ **Requires Cloudflare CDN** - Separate integration

**Complexity:** ⭐⭐ (2/5)

**Cost:** ~$1/month

**Fit Score:** 50/100 (too bare-bones for production app)

---

## Recommended Approach: Supabase Storage + Enhancements

**Phase 1 (Immediate - 0 days):**
1. **Continue using Supabase Storage** - No migration
2. **Add image optimization helpers** - Use Supabase Image Transformations API
   - Create `frontend/lib/image-utils.ts` with `getOptimizedImageUrl()` helper
   - Add WebP/AVIF format conversion via URL params
   - Implement lazy loading with Next.js Image component

**Phase 2 (Production Safety - 2 days):**
1. **Add virus scanning** - Integrate VirusTotal API or ClamAV
   - POST to VirusTotal on upload confirmation
   - Mark asset as `quarantined` if malware detected
   - Email notification to admin

**Phase 3 (Optimization - 1 day):**
1. **Implement server-side image processing** (for AI renders)
   - Use Sharp library in backend for thumbnail generation
   - Generate 3 sizes: thumbnail (200px), medium (800px), full (original)
   - Upload all 3 to Supabase Storage with suffix (`_thumb.webp`, `_medium.webp`)

**Phase 4 (Monitoring - 0.5 days):**
1. **Track storage metrics**
   - Log storage usage per user (for quota enforcement)
   - Alert when bucket approaches Supabase plan limits
   - Monitor egress costs (Supabase dashboard)

**Total Implementation Time:** 3.5 days

**Total Cost (10k users):** $44/month

---

## Strategic Evaluation

### Goals Alignment
- ✅ **Phase 2.1 File Upload** - Already complete with Supabase
- ✅ **Phase 2.3 Style Images** - Already complete with Supabase
- ✅ **Phase 3 AI Renders** - Supabase Image Transformations meet needs
- ✅ **Production Readiness** - CDN, signed URLs, access controls all present

### Economic Value
- **Avoid migration costs** - Save $1500-2500 in developer time
- **Avoid service complexity** - No IAM, Lambda, CloudFront configs
- **Predictable pricing** - Supabase Pro plan ($25/month base) vs AWS surprise bills

### Implementation Feasibility
- ✅ **Zero code changes** - AssetService, StyleImageService already working
- ✅ **Team expertise** - Already familiar with Supabase SDK
- ✅ **Low risk** - No breaking changes, no downtime

### Long-Term Viability
- ⚠️ **Vendor lock-in** - Mitigated by S3-compatible API (can migrate to S3/R2 later)
- ✅ **Supabase maturity** - Backed by $116M funding, enterprise customers
- ✅ **Escape hatch** - Can always migrate to S3 using rclone/s3cmd

---

## When to Reconsider

**Migrate to AWS S3 + CloudFront if:**
1. Storage needs exceed 500GB (Supabase becomes expensive)
2. You need multi-region replication (regulatory compliance)
3. You migrate away from Supabase Auth/Database (lose unified platform benefits)
4. You need S3 Object Lambda or advanced AWS features

**Migrate to Cloudflare R2 if:**
1. Egress costs exceed $50/month (R2's zero-egress shines at high traffic)
2. You already use Cloudflare for other services (DNS, WAF, Workers)
3. Storage needs exceed 1TB (R2's flat storage pricing wins)

**Stick with Supabase Storage if:**
1. Storage < 500GB and egress < 200GB/month (current projection: 75GB storage, 200GB egress)
2. You value simplicity over cost optimization (single vendor, single SDK)
3. Team is already proficient in Supabase ecosystem

---

## Decision Matrix

| Criteria                  | Supabase Storage | AWS S3 + CloudFront | Cloudflare R2 | DigitalOcean Spaces | Backblaze B2 |
|---------------------------|------------------|---------------------|---------------|---------------------|--------------|
| **Integration Effort**    | ✅ 0 days        | ❌ 5 days           | ⚠️ 4 days     | ⚠️ 3 days           | ❌ 4 days    |
| **Cost (10k users)**      | ⚠️ $44/month     | ⚠️ $20/month        | ✅ $1.50/mo   | ✅ $5/month (flat)  | ✅ $1/month  |
| **Image Transforms**      | ✅ Built-in      | ⚠️ Lambda@Edge      | ❌ Custom     | ❌ Third-party      | ❌ None      |
| **CDN**                   | ✅ Included      | ✅ CloudFront       | ⚠️ Workers    | ✅ Included         | ⚠️ Cloudflare|
| **Vendor Lock-in**        | ⚠️ Moderate      | ✅ None             | ⚠️ Moderate   | ⚠️ Moderate         | ⚠️ Moderate  |
| **Auth Integration**      | ✅ Native RLS    | ❌ Custom           | ❌ Custom     | ❌ Custom           | ❌ Custom    |
| **Complexity**            | ✅ Low           | ❌ High             | ⚠️ Moderate   | ⚠️ Moderate         | ⚠️ Moderate  |
| **Maturity**              | ✅ Stable        | ✅ Industry std     | ⚠️ Newer      | ✅ Stable           | ✅ Stable    |
| **Virus Scanning**        | ⚠️ Third-party   | ✅ Marketplace      | ⚠️ Custom     | ⚠️ Third-party      | ⚠️ Custom    |
| **Fit Score**             | **95/100**       | 60/100              | 70/100        | 65/100              | 50/100       |

---

## Implementation Plan (Supabase Storage Enhancements)

### Step 1: Image Optimization Helpers (0.5 days)
```typescript
// frontend/lib/image-utils.ts
export interface ImageOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'avif' | 'jpeg';
}

export function getOptimizedImageUrl(
  storagePath: string,
  options: ImageOptions = {}
): string {
  const { width = 800, height, quality = 80, format = 'webp' } = options;

  const params = new URLSearchParams({
    width: width.toString(),
    quality: quality.toString(),
    format,
  });

  if (height) params.set('height', height.toString());

  const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/room-assets`;
  return `${baseUrl}/${storagePath}?${params.toString()}`;
}

// Usage in components
<Image
  src={getOptimizedImageUrl(asset.storagePath, { width: 800, format: 'webp' })}
  alt={asset.originalFilename}
  width={800}
  height={600}
  loading="lazy"
/>
```

### Step 2: Virus Scanning Integration (2 days)
```typescript
// backend/src/services/virus-scan.service.ts
import axios from 'axios';

export class VirusScanService {
  async scanFile(fileUrl: string): Promise<{ safe: boolean; threats: string[] }> {
    const apiKey = env.VIRUSTOTAL_API_KEY;

    // Submit URL for scanning
    const { data: scanData } = await axios.post(
      'https://www.virustotal.com/api/v3/urls',
      `url=${encodeURIComponent(fileUrl)}`,
      { headers: { 'x-apikey': apiKey } }
    );

    // Poll for results (VirusTotal async)
    const analysisId = scanData.data.id;
    await this.pollResults(analysisId);

    const { data: results } = await axios.get(
      `https://www.virustotal.com/api/v3/analyses/${analysisId}`,
      { headers: { 'x-apikey': apiKey } }
    );

    const stats = results.data.attributes.stats;
    const isSafe = stats.malicious === 0 && stats.suspicious === 0;

    return {
      safe: isSafe,
      threats: isSafe ? [] : this.extractThreats(results),
    };
  }
}

// Update AssetService.confirmUpload() to call virus scan
async confirmUpload(assetId: string): Promise<RoomAsset> {
  // ... existing verification code ...

  if (isStorageEnabled()) {
    const signedUrl = await this.getSignedUrl(assetId, 3600);
    const scanResult = await virusScanService.scanFile(signedUrl);

    if (!scanResult.safe) {
      await db.update(roomAssets)
        .set({ status: 'quarantined' })
        .where(eq(roomAssets.id, assetId));

      throw new Error(`File quarantined: ${scanResult.threats.join(', ')}`);
    }
  }

  // ... rest of confirmation ...
}
```

### Step 3: Server-Side Thumbnail Generation (1 day)
```typescript
// backend/src/services/image-processor.service.ts
import sharp from 'sharp';

export class ImageProcessorService {
  async generateThumbnails(
    originalBuffer: Buffer,
    storagePath: string
  ): Promise<void> {
    const sizes = [
      { suffix: '_thumb', width: 200 },
      { suffix: '_medium', width: 800 },
    ];

    for (const { suffix, width } of sizes) {
      const resized = await sharp(originalBuffer)
        .resize(width)
        .webp({ quality: 80 })
        .toBuffer();

      const thumbPath = storagePath.replace(/\.\w+$/, `${suffix}.webp`);

      await supabaseAdmin.storage
        .from(env.SUPABASE_STORAGE_BUCKET)
        .upload(thumbPath, resized, { contentType: 'image/webp' });
    }
  }
}
```

---

## Files to Create

1. **Frontend:**
   - `frontend/lib/image-utils.ts` - Optimization helpers

2. **Backend:**
   - `backend/src/services/virus-scan.service.ts` - VirusTotal integration
   - `backend/src/services/image-processor.service.ts` - Sharp-based thumbnails

3. **Tests:**
   - `backend/tests/unit/services/virus-scan.service.test.ts`
   - `backend/tests/unit/services/image-processor.service.test.ts`

4. **Documentation:**
   - Update `CLAUDE.md` with image optimization patterns
   - Update `docs/implementation plan/Phase_3_Image_Optimization.md`

---

## Conclusion

**Final Recommendation: Stick with Supabase Storage**

**Why:**
1. Already integrated and working (AssetService, StyleImageService)
2. Meets all technical requirements (CDN, transforms, signed URLs, RLS)
3. Cost-effective at current scale ($44/month for 10k users)
4. Unified platform with Supabase Auth/Database (operational simplicity)
5. Low risk, zero migration effort

**Next Steps:**
1. Accept this recommendation and continue with Supabase Storage
2. Implement image optimization helpers (0.5 days)
3. Add virus scanning integration (2 days)
4. Add server-side thumbnail generation for Phase 3 renders (1 day)
5. Monitor storage metrics and revisit decision if scale exceeds 500GB

**Do NOT migrate to AWS S3, Cloudflare R2, or other providers unless:**
- Storage exceeds 500GB (cost inflection point)
- Multi-region compliance requirements emerge
- You migrate away from Supabase ecosystem

**Total Investment:** 3.5 days + $44/month operational cost

---

**Research Complete** | Next: Get approval from Ray before implementing enhancements
