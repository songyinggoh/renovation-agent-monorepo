# Supabase Advisor Fix Plan

**Investigation date:** 2026-04-30
**Status:** DRAFT — not applied
**Branch:** `hotfix/security-overrides`
**Scope:** Resolve all Supabase database advisor findings (security + performance)

---

## TL;DR

Supabase advisors flagged:
- **16 ERROR** `rls_disabled_in_public` (5 are template scaffold, 11 are real Drizzle tables)
- **4 ERROR** `sensitive_columns_exposed` (subset of above — same fix)
- **5 WARN** `auth_rls_initplan` (perf — wrap `auth.uid()` in `(select ...)`)
- **1 WARN** `function_search_path_mutable` (`update_updated_at_column`)
- **1 WARN** `auth_leaked_password_protection` (Dashboard toggle)

Plan: two SQL migrations + one Dashboard toggle. **Frontend never calls PostgREST for data** (verified — all data flows through Express via `fetchWithAuth`), but anon key is public, so RLS is real defense-in-depth.

---

## Investigation evidence

### Frontend exposure assessment
- Repo-wide grep for `supabase.from(` and `.from('table')` in `frontend/`: zero data-CRUD matches.
- Supabase client in frontend used only for `auth.*` (session, callback, sign-out). See `frontend/lib/api.ts:1-28`, `frontend/lib/supabase/{client,server,middleware}.ts`.
- Backend connects via `DATABASE_URL` as `postgres` superuser → bypasses RLS regardless.
- **Conclusion:** RLS gaps are not exploitable through the app, but ARE exploitable via direct PostgREST calls using the public anon key (shipped to browser as `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

### Template tables — confirmed safe to DROP
Origin: `database/schema.sql` (git-untracked starter scaffold, literal comment "Database schema for the template application").

Live data sample (35 rows total):
- `users`: `admin@example.com`, `password_hash = "$2b$10$hashedpassword1"` (literal string, not a real hash)
- `items`: "Smartphone", "T-Shirt", "Programming Book"
- `orders`: shipping to "123 Main St, Anytown, CA"
- All rows share timestamp `2026-01-05T17:34:52.573215` → single bulk seed from a tutorial

### Existing RLS policies (production state)
Six policies, all `TO authenticated`:

| Table | Policy | Cmd | USING | WITH CHECK |
|-------|--------|-----|-------|------------|
| chat_messages | Users can insert own chat messages | INSERT | — | `(auth.uid() = user_id)` |
| chat_messages | Users can view own chat messages | SELECT | `(auth.uid() = user_id)` | — |
| profiles | Users can insert own profile | INSERT | — | `((SELECT auth.uid()) = id)` ✅ already wrapped |
| renovation_sessions | Users can insert own renovation sessions | INSERT | — | `(auth.uid() = user_id)` |
| renovation_sessions | Users can update own renovation sessions | UPDATE | `(auth.uid() = user_id)` | **NULL** ⚠ ownership-transfer bug |
| renovation_sessions | Users can view own renovation sessions | SELECT | `(auth.uid() = user_id)` | — |

Source: `pg_policy` query against prod (2026-04-30). **No `CREATE POLICY` SQL exists in repo** — these were created via Supabase Dashboard. Going forward, all policy changes go through Drizzle migrations (single source of truth).

### FK ownership chain
```
auth.users.id (uuid)
   └── profiles.id  (backend/src/db/schema/users.schema.ts:11)
          └── renovation_sessions.user_id  (sessions.schema.ts:15, NULLABLE for anon mode)
                 ├── renovation_rooms.session_id           (rooms.schema.ts:12)
                 │     ├── product_recommendations.room_id (products.schema.ts:12)
                 │     └── room_assets.room_id             (assets.schema.ts:57)
                 │            └── asset_variants.parent_asset_id (asset-variants.schema.ts:58)
                 ├── room_assets.session_id                (assets.schema.ts:54)
                 ├── document_artifacts.session_id         (document-artifacts.schema.ts:55)
                 ├── contractor_recommendations.session_id (contractors.schema.ts:13)
                 └── chat_messages.session_id              (RLS already in place)
```

### Per-table classification
| Table | Category | Action |
|-------|----------|--------|
| users, items, categories, orders, order_items | template scaffold | DROP (0011) |
| style_catalog, style_images, products_catalog | public-reference | RLS + SELECT TO anon,authenticated USING(true) |
| rate_limits, __drizzle_migrations | backend-only | RLS, no policies (deny-all to PostgREST) |
| renovation_rooms, room_assets, document_artifacts, contractor_recommendations | user-owned (1-hop FK) | RLS + SELECT via session_id → renovation_sessions.user_id |
| asset_variants, product_recommendations | user-owned (2-hop FK) | RLS + SELECT via JOIN |
| renovation_sessions, chat_messages | already RLS'd | Rewrite for `(select auth.uid())` perf |
| profiles | already RLS'd, INSERT-only | Out of scope (separate ticket — likely needs SELECT+UPDATE policies) |

---

## Migration 0011: drop template scaffold

**File:** `backend/drizzle/0011_drop_template_tables.sql`
**Also:** `rm -rf database/` (untracked scaffold dir; remove the bootstrap footgun)

```sql
-- 0011_drop_template_tables.sql
-- Removes scaffold tables left over from a generic starter template
-- (former database/schema.sql). All 35 rows verified to be tutorial fixtures
-- (admin@example.com, "$2b$10$hashedpassword1", "Smartphone" SKUs,
-- identical 2026-01-05T17:34:52 timestamps). No production data.
--
-- Resolves 5 of 16 rls_disabled_in_public ERRORs and removes a
-- public.users.password_hash column from PostgREST exposure.
BEGIN;

DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders      CASCADE;
DROP TABLE IF EXISTS public.items       CASCADE;
DROP TABLE IF EXISTS public.categories  CASCADE;
DROP TABLE IF EXISTS public.users       CASCADE;

-- Triggers (update_users_updated_at, etc.) drop with their tables.
-- The shared update_updated_at_column() function survives
-- (used by products_catalog and product_recommendations triggers).

COMMIT;
```

**Pre-flight check (run before applying):**
```sql
SELECT conrelid::regclass AS from_table, conname, confrelid::regclass AS to_table
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid::regclass::text IN ('public.users', 'public.items', 'public.categories',
                                    'public.orders', 'public.order_items')
  AND conrelid::regclass::text NOT IN ('public.users', 'public.items', 'public.categories',
                                       'public.orders', 'public.order_items');
-- expect 0 rows
```

---

## Migration 0012: RLS + perf + function hardening

**File:** `backend/drizzle/0012_security_hardening.sql`

```sql
-- 0012_security_hardening.sql
-- Resolves all remaining Supabase advisor findings post-0011:
--   - 11 rls_disabled_in_public ERRORs
--   - 4 sensitive_columns_exposed ERRORs (resolved by same RLS)
--   - 5 auth_rls_initplan WARN (perf)
--   - 1 function_search_path_mutable WARN
-- Also fixes pre-existing privilege-escalation: renovation_sessions UPDATE
-- policy was missing WITH CHECK, allowing user_id ownership transfer.
BEGIN;

-- =============================================================
-- A. PERF: rewrite existing policies to use (select auth.uid())
-- =============================================================
DROP POLICY IF EXISTS "Users can view own renovation sessions"   ON public.renovation_sessions;
DROP POLICY IF EXISTS "Users can insert own renovation sessions" ON public.renovation_sessions;
DROP POLICY IF EXISTS "Users can update own renovation sessions" ON public.renovation_sessions;
DROP POLICY IF EXISTS "Users can view own chat messages"         ON public.chat_messages;
DROP POLICY IF EXISTS "Users can insert own chat messages"       ON public.chat_messages;

CREATE POLICY "Users can view own renovation sessions"
  ON public.renovation_sessions FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own renovation sessions"
  ON public.renovation_sessions FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own renovation sessions"
  ON public.renovation_sessions FOR UPDATE TO authenticated
  USING      ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);  -- NEW: blocks user_id transfer

CREATE POLICY "Users can view own chat messages"
  ON public.chat_messages FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own chat messages"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- =============================================================
-- B. Public-reference tables: RLS + SELECT-only to all
-- =============================================================
ALTER TABLE public.style_catalog    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.style_images     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.style_catalog;
DROP POLICY IF EXISTS "Public read access" ON public.style_images;
DROP POLICY IF EXISTS "Public read access" ON public.products_catalog;

CREATE POLICY "Public read access" ON public.style_catalog
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read access" ON public.style_images
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public read access" ON public.products_catalog
  FOR SELECT TO anon, authenticated USING (true);

-- =============================================================
-- C. Backend-only tables: RLS, NO policies (deny-all to PostgREST;
--    service-role bypasses). Service-role connection used by
--    rate-limiter-flexible and Drizzle migrations keeps working.
-- =============================================================
ALTER TABLE public.rate_limits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.__drizzle_migrations ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- D. User-owned tables: SELECT-only via FK chain.
--    Writes continue exclusively through Express (service-role).
-- =============================================================
ALTER TABLE public.renovation_rooms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_assets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_variants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_artifacts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_recommendations    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own rooms"          ON public.renovation_rooms;
DROP POLICY IF EXISTS "Users can view own assets"         ON public.room_assets;
DROP POLICY IF EXISTS "Users can view own asset variants" ON public.asset_variants;
DROP POLICY IF EXISTS "Users can view own documents"      ON public.document_artifacts;
DROP POLICY IF EXISTS "Users can view own contractors"    ON public.contractor_recommendations;
DROP POLICY IF EXISTS "Users can view own product recs"   ON public.product_recommendations;

CREATE POLICY "Users can view own rooms"
  ON public.renovation_rooms FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.renovation_sessions s
    WHERE s.id = renovation_rooms.session_id
      AND s.user_id = (select auth.uid())
  ));

CREATE POLICY "Users can view own assets"
  ON public.room_assets FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.renovation_sessions s
    WHERE s.id = room_assets.session_id
      AND s.user_id = (select auth.uid())
  ));

CREATE POLICY "Users can view own asset variants"
  ON public.asset_variants FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.room_assets ra
    JOIN public.renovation_sessions s ON s.id = ra.session_id
    WHERE ra.id = asset_variants.parent_asset_id
      AND s.user_id = (select auth.uid())
  ));

CREATE POLICY "Users can view own documents"
  ON public.document_artifacts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.renovation_sessions s
    WHERE s.id = document_artifacts.session_id
      AND s.user_id = (select auth.uid())
  ));

CREATE POLICY "Users can view own contractors"
  ON public.contractor_recommendations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.renovation_sessions s
    WHERE s.id = contractor_recommendations.session_id
      AND s.user_id = (select auth.uid())
  ));

CREATE POLICY "Users can view own product recs"
  ON public.product_recommendations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.renovation_rooms r
    JOIN public.renovation_sessions s ON s.id = r.session_id
    WHERE r.id = product_recommendations.room_id
      AND s.user_id = (select auth.uid())
  ));

-- =============================================================
-- E. Function hardening: pin search_path to empty.
--    Body only references NEW + now() (resolved via pg_catalog),
--    so '' is safe. Existing triggers point by OID — no recreate.
-- =============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMIT;
```

---

## Dashboard step (no SQL)

Project → **Authentication → Providers → Email → Password Settings** → enable **Leaked Password Protection** (HaveIBeenPwned).

Operationally low-impact today (anonymous mode, no real Supabase Auth signups), but required before Phase 8 ships real auth.

---

## Apply order

1. **Review SQL** in this doc.
2. **Apply 0011** in Supabase SQL Editor → re-run advisors → confirm 5 ERRORs resolved.
3. **Apply 0012** in Supabase SQL Editor → re-run advisors → confirm all remaining ERRORs + WARNs resolved.
4. **Toggle HaveIBeenPwned** in Dashboard.
5. **Smoke-test**: hit `GET /health/ready`; create a session + send a chat message via frontend. Backend uses service-role so RLS shouldn't affect anything — but verify.
6. **Commit** the two `.sql` files into `backend/drizzle/`.
7. **Reconcile** Drizzle journal: see `backend/drizzle/0007_reconcile_manual_tables.sql` precedent — these manual SQL migrations may need a journal entry. Confirm with `npm run db:check-migrations` afterward.

---

## Design rationale

| Decision | Why |
|----------|-----|
| SELECT-only on user-owned tables | Backend uses service-role (bypass RLS), so writes work. Frontend never calls PostgREST for these (verified). Adding INSERT/UPDATE/DELETE = more surface, zero benefit today. |
| `TO anon, authenticated` for catalogs | Anonymous browsing of style/product catalog should work for marketing pages. |
| `WITH CHECK` added to UPDATE | Closes ownership-transfer escalation. Latent bug, ships free. |
| RLS + no policies on `rate_limits` / `__drizzle_migrations` | Schema-version + rate-limit-key disclosure protection. Service-role bypass keeps `rate-limiter-flexible` working. |
| `update_updated_at_column` SECURITY INVOKER + `search_path = ''` | Function only touches NEW + now() (built-in via pg_catalog). Empty search_path is safest hardening. Triggers point by OID — no recreation needed. |
| Two migrations | 0011 reversible (recreate template if needed); 0012 is the security work. Narrow blast radius. |

---

## Out-of-scope follow-ups

- **`profiles` has only an INSERT policy** — no SELECT/UPDATE policies. Authenticated PostgREST users cannot read or update their own profile. Likely a real bug, separate ticket.
- **`database/schema.sql` is git-untracked.** Add `database/` to `.gitignore` after 0011, OR `rm -rf database/`.
- **`DATABASE_URL` password broken in `backend/.env`** (per memory `env_gotchas_2026-04-23.md`). Doesn't block this work, but blocks future automated audits via `backend/scripts/advisor-recon.ts`. Rotate when convenient.
- **Anonymous Phase 1-7 sessions write `user_id = NULL`** through service-role. Rows invisible to any authenticated PostgREST user — current behavior, preserved.
- **No CREATE POLICY in repo** until now. Going forward, all policy changes go through Drizzle migrations (this doc establishes the precedent).

---

## Recon artifacts

- `backend/scripts/advisor-recon.ts` — script to re-run the policy/row-count queries once `DATABASE_URL` is fixed. Currently fails with `28P01` (password rotated).
- This document — full plan, ready to execute next session.
