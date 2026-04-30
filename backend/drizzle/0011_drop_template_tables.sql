-- migration-safety:allow-destructive
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
