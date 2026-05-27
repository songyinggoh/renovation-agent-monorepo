# Phase 2 Gap Analysis Summary

**Phase:** 2 - Images + Style & Products
**Verified:** 2026-02-15
**Score:** 5/7 must-haves verified
**Confidence:** HIGH (gaps are well-understood, fixes are straightforward)

## Executive Summary

Phase 2 is substantially complete. The core user experience works end-to-end: file upload pipeline, style moodboards via LangChain tools, product search with filtering, phase-aware agent prompts, and comprehensive test coverage across 13 test files. The two remaining gaps are data persistence issues, not missing functionality. Both the product search and style image features work at runtime -- they just rely on in-memory seed data and external Unsplash URLs rather than database persistence and self-hosted assets.

The recommendation is to **fix Gap 1 (product DB seeding) now** as a Phase 2 completion item, and **defer Gap 2 (image scraper/self-hosting) to a future hardening pass**. Gap 1 is a 2-4 hour fix with clear implementation path and zero new dependencies. Gap 2 is a nice-to-have that introduces external service complexity (Pinterest API or manual curation workflow) with minimal user-facing impact.

## Gap Analysis

### Gap 1: Product Database Population (Task 2.4)

**Severity: MEDIUM -- fix as Phase 2 completion**

| Aspect | Detail |
|--------|--------|
| Current state | 30 curated products in `SEED_PRODUCTS` array (in-memory) |
| What works | `search_products` tool filters correctly, returns results to agent |
| What is broken | Products not in DB; product API routes (`/api/products`) return empty; data not queryable by other services |
| Roadmap spec | "For MVP: manual curated CSV + import into products table" |
| Impact if unfixed | Phase 3 PDF generation cannot pull products from DB for shopping lists; product API is dead code |

**Root cause:** `search-products.tool.ts` calls `productService.searchSeedProducts()` which filters the in-memory array. The DB methods (`getProductsByRoom`, `addProductToRoom`) exist but are never called from the tool.

**Fix approach (estimated 2-4 hours):**

1. Create `backend/src/scripts/seed-products.ts` -- iterate `SEED_PRODUCTS`, insert into `product_recommendations` table (requires a default roomId or a separate `product_catalog` table)
2. **Decision needed:** The `product_recommendations` table has a required `roomId` FK. Seed products are not room-specific -- they are catalog items. Two options:
   - **Option A (quick):** Add a `product_catalog` table without roomId FK for global products. Keep `product_recommendations` for per-room AI picks.
   - **Option B (quicker):** Keep in-memory search for the catalog (current behavior) but document it as the intentional MVP pattern. Wire `addProductToRoom` to persist when agent recommends a product to a specific room.
3. Update `search-products.tool.ts` to optionally query DB when roomId is provided
4. Add npm script: `db:seed-products`

**Recommendation:** Option B is the right call. The `product_recommendations` table is designed for per-room recommendations (it has a `roomId` FK), not a product catalog. The in-memory `SEED_PRODUCTS` array IS the product catalog, and it is static curated data that does not need DB persistence. What IS missing is the bridge: when the agent recommends products to a room, those should be persisted to `product_recommendations`. This is likely a Phase 3 concern (PDF generation needs to pull room-specific product picks from DB).

**Revised recommendation:** Document the in-memory catalog as intentional MVP, and ensure `save_checklist_state` or a new tool persists agent-selected products to `product_recommendations` per room. Complexity: 2 hours.

### Gap 2: Pinterest/Style Image Scraper (Task 2.3)

**Severity: LOW -- defer to future hardening**

| Aspect | Detail |
|--------|--------|
| Current state | 5 styles with 3+ Unsplash URLs each in `seed-style-images.ts` |
| What works | `get_style_examples` returns image URLs; agent shows moodboards |
| What is broken | Images are external Unsplash URLs, not self-hosted in Supabase Storage |
| Roadmap spec | "Download curated image set, upload to Supabase Storage bucket" |
| Impact if unfixed | Dependency on Unsplash availability; no control over image lifecycle |

**Root cause:** The roadmap envisioned a Pinterest scraper, which was always aspirational for MVP. `StyleImageService.uploadImage()` exists as the upload mechanism, but no script or worker calls it.

**Why defer:**

1. Unsplash URLs are reliable (CDN-backed, high availability) -- no user-facing degradation
2. Pinterest scraping is legally gray and API-restricted; manual curation is the realistic path
3. Self-hosting images adds storage costs and a one-time migration script with no feature improvement
4. Phase 3 (Nano Banana renders) will need Supabase Storage for generated images -- that work will validate the storage pipeline, after which migrating style images is trivial
5. The upload infrastructure (`StyleImageService.uploadImage`) already exists; only a script is missing

**If you do fix it later (estimated 3-5 hours):**

1. Create `backend/src/scripts/download-style-images.ts` -- fetch from Unsplash URLs, upload via `StyleImageService.uploadImage()`
2. Update DB records with storage paths instead of external URLs
3. Run once manually; no need for a recurring scraper

## Shared Dependencies

Both gaps share these dependencies:
- **Supabase configuration:** Gap 2 requires Supabase Storage to be configured. Gap 1 requires DB access (already working).
- **Seed data files:** Both use the existing `backend/src/data/` seed files as source of truth.
- **No shared blocking dependency:** The gaps are independent. Fixing one does not require fixing the other.

## Prioritized Action Plan

| Priority | Action | Effort | Blocker for |
|----------|--------|--------|-------------|
| 1 (NOW) | Document in-memory product catalog as intentional MVP pattern | 30 min | Nothing -- removes false gap |
| 2 (NOW) | Wire product persistence when agent recommends to a room | 2 hrs | Phase 3 PDF shopping lists |
| 3 (DEFER) | Style image self-hosting script | 3-5 hrs | Nothing user-facing |

## Phase 3 Readiness Assessment

Phase 2 gaps do NOT block Phase 3 work from starting. Here is why:

- **Render service (3.1):** No dependency on product DB or style image hosting
- **PDF generator (3.3):** DOES need per-room product data from DB. Priority 2 above must complete before PDF generation works fully. However, PDF template work can proceed in parallel.
- **Frontend integration (3.4):** No dependency on these gaps

**Recommendation:** Start Phase 3 immediately. Complete Priority 1-2 items as a "Phase 2.1 cleanup" sprint (half-day) running in parallel with early Phase 3 scaffolding.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Gap identification | HIGH | Verification report is thorough with artifact-level evidence |
| Fix complexity estimates | HIGH | All code paths inspected; changes are well-scoped |
| Deferral safety (Gap 2) | HIGH | Unsplash CDN is production-grade; no user impact |
| Phase 3 readiness | MEDIUM | Product persistence gap needs fixing before PDF shopping lists work |

**Overall confidence:** HIGH -- Phase 2 is functionally complete for the user experience. Remaining work is persistence plumbing.

---
*Analysis completed: 2026-02-15*
*Recommendation: Fix product persistence (2 hrs), defer image self-hosting, proceed to Phase 3*
