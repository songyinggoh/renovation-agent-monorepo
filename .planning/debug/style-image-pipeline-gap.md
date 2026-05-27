---
status: resolved
trigger: "Phase 2 Gap - Style image scraper never downloads images to Supabase Storage"
created: 2026-02-15T00:00:00Z
updated: 2026-02-15T00:00:00Z
---

## Current Focus

hypothesis: The "gap" is by design -- the system intentionally works with Unsplash URLs as sourceUrl references, and only uploads to Supabase Storage when explicitly configured.
test: Trace complete pipeline from seed data to tool response
expecting: Confirm whether images are served or broken
next_action: Report findings

## Symptoms

expected: Style images downloaded to Supabase Storage and served from there
actual: Images exist as Unsplash URL references in seed data; uploadImage() is never called during seeding
errors: None reported
reproduction: Invoke get_style_examples tool -- images have mock:// or Supabase storage URLs, not Unsplash URLs
started: Always been this way (by design)

## Eliminated

- hypothesis: uploadImage() is broken or has a bug
  evidence: Method is correctly implemented (lines 114-174 of style-image.service.ts), it just requires an imageBuffer parameter that nothing provides during seeding
  timestamp: 2026-02-15

## Evidence

- timestamp: 2026-02-15
  checked: seed-style-images.ts
  found: 25 curated Unsplash image entries across 5 styles, each with url, filename, roomType, caption, altText, tags
  implication: Seed data stores the source URLs but does not download the images

- timestamp: 2026-02-15
  checked: StyleImageService.seedFromManifest() (lines 181-240)
  found: Seeds DB records with storagePath and sourceUrl but DOES NOT download images or call uploadImage(). Comment on line 211 confirms this is intentional: "Insert record (without actual upload for seed -- uses sourceUrl as reference)"
  implication: Seeding is metadata-only by design

- timestamp: 2026-02-15
  checked: StyleImageService.uploadImage() (lines 114-174)
  found: Requires imageBuffer parameter (actual image bytes). Nothing in the codebase calls this method.
  implication: Upload capability exists but no download/scraper pipeline feeds into it

- timestamp: 2026-02-15
  checked: get-style-examples.tool.ts (lines 26-31)
  found: Tool returns img.publicUrl which is built from buildPublicUrl(storagePath), NOT from sourceUrl
  implication: The tool returns either mock://storage/... URLs or Supabase Storage URLs -- it NEVER returns the original Unsplash URLs

- timestamp: 2026-02-15
  checked: buildPublicUrl() (lines 16-21)
  found: If SUPABASE_URL is not set, returns "mock://storage/style-assets/styles/{slug}/{filename}". If set, returns "{SUPABASE_URL}/storage/v1/object/public/style-assets/styles/{slug}/{filename}"
  implication: Without actual image upload, these URLs point to non-existent files

- timestamp: 2026-02-15
  checked: isStorageEnabled() in env.ts (line 215-216)
  found: Returns true only when isAuthEnabled() AND SUPABASE_STORAGE_BUCKET is set
  implication: For Phases 1-7 where auth is optional, storage is likely disabled

## Resolution

root_cause: |
  The pipeline has a structural gap between seeding and serving:
  1. seedFromManifest() creates DB records with storagePath values like "styles/modern-minimalist/living-open-concept.jpg"
  2. But it never downloads images from Unsplash or uploads them to Supabase Storage
  3. get_style_examples tool returns publicUrl built from storagePath (mock:// or supabase storage URL)
  4. These URLs point to files that DO NOT EXIST in storage
  5. The original Unsplash URLs are stored in sourceUrl column but NEVER returned to the user

  The sourceUrl field (which has the working Unsplash URL) is stored in the DB but the tool only returns publicUrl (which points to non-existent storage files).

fix: Not applied (diagnosis only)
verification: Not performed
files_changed: []
