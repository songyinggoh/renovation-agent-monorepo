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
--    so '' is safe. Existing triggers point by OID -- no recreate.
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
