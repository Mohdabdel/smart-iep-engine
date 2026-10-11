-- Minimal Supabase-like stubs for CI/local RLS tests on a throwaway Postgres.
-- NEVER run against a real Supabase project (it already has these schemas).
--
-- psql variable `grants_mode` reproduces the two ways a Supabase project can
-- hand out default privileges, so the tests prove migrations are correct in both:
--   expose  — "Automatically expose new tables" ON: anon/authenticated get ALL
--             on new tables and EXECUTE on new functions (over-granting).
--   locked  — auto-expose OFF: no default grants at all (under-granting).
\if :{?grants_mode}
\else
\set grants_mode expose
\endif
\echo 'stub grants_mode =' :grants_mode

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth; CREATE SCHEMA storage;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON storage.objects TO authenticated;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;

-- Postgres grants EXECUTE on new functions to PUBLIC by default; Supabase
-- projects with auto-expose off do not rely on that, so remove it in both modes.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

SELECT (:'grants_mode' = 'expose') AS expose_mode \gset
\if :expose_mode
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
\else
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
\endif
