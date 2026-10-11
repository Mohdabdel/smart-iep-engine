-- Synthetic RLS / permission tests. Fails (non-zero psql exit) on the first
-- violated expectation. Run only against a throwaway database:
--   psql -v ON_ERROR_STOP=1 -f 00-supabase-stub.sql   (CI/local only)
--   psql -v ON_ERROR_STOP=1 -f ../migrations/*.sql
--   psql -v ON_ERROR_STOP=1 -f 10-staging-rls-synthetic.sql
-- All identities and records are synthetic (example.test); no real learner data.
\set ON_ERROR_STOP 1
SET client_min_messages = notice;

-- Helpers -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.check(name text, cond boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', name; END IF;
  RAISE NOTICE 'PASS: %', name;
END $$;

-- Runs sql as `role` with auth.uid() = uid; expects it to raise an error whose
-- SQLSTATE is in `codes` (42501 insufficient_privilege incl. RLS violations).
CREATE OR REPLACE FUNCTION pg_temp.expect_denied(name text, role text, uid text, sql text, codes text[] DEFAULT ARRAY['42501'])
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', role);
    PERFORM set_config('request.jwt.claim.sub', coalesce(uid, ''), true);
    EXECUTE sql;
  EXCEPTION WHEN others THEN
    EXECUTE 'RESET ROLE';
    IF SQLSTATE = ANY(codes) THEN RAISE NOTICE 'PASS: % (denied %)', name, SQLSTATE; RETURN; END IF;
    RAISE EXCEPTION 'FAIL: % (unexpected error % %)', name, SQLSTATE, SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  RAISE EXCEPTION 'FAIL: % (statement was allowed)', name;
END $$;

-- Returns a scalar computed as `role` / uid.
CREATE OR REPLACE FUNCTION pg_temp.as_user(role text, uid text, sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', role);
  PERFORM set_config('request.jwt.claim.sub', coalesce(uid, ''), true);
  EXECUTE sql INTO r;
  EXECUTE 'RESET ROLE';
  RETURN r;
END $$;

\set ADMIN   '00000000-0000-0000-0000-00000000000a'
\set UPL     '00000000-0000-0000-0000-00000000000b'
\set PEND    '00000000-0000-0000-0000-00000000000c'
\set OTHER   '00000000-0000-0000-0000-00000000000d'

BEGIN;

-- Fixtures (as superuser, mirroring the service role) -------------------------
INSERT INTO auth.users (id, email) VALUES
  (:'ADMIN', 'admin@example.test'),
  (:'UPL',   'uploader@example.test'),
  (:'PEND',  'pending@example.test'),
  (:'OTHER', 'other@example.test');
UPDATE public.profiles SET approval_status = 'approved' WHERE email IN ('uploader@example.test', 'other@example.test');

INSERT INTO public.review_cases (id, owner_key_hash, learner_name, review_type, report_json)
VALUES ('11111111-1111-1111-1111-111111111111', 'synthetic-hash', 'متعلم اصطناعي', 'full', '{"synthetic": true}');
INSERT INTO public.review_parts (review_case_id, part_key) VALUES ('11111111-1111-1111-1111-111111111111', 'p1');
INSERT INTO public.submissions (id, uploader_id, file_path, file_name, review_case_id) VALUES
  ('22222222-2222-2222-2222-222222222222', :'UPL',   :'UPL'   || '/a.pdf', 'a.pdf', '11111111-1111-1111-1111-111111111111'),
  ('33333333-3333-3333-3333-333333333333', :'OTHER', :'OTHER' || '/b.pdf', 'b.pdf', NULL);

-- Privilege matrix (exact; catches both missing and excess grants) ------------
-- Expected table privileges for API roles on public tables.
SELECT pg_temp.check('anon has no privileges on any public table',
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE table_schema = 'public' AND grantee IN ('anon', 'PUBLIC')));
SELECT pg_temp.check('authenticated table privileges are exactly the intended set',
  (SELECT coalesce(string_agg(table_name || ':' || privilege_type, ',' ORDER BY table_name, privilege_type), '')
     FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'authenticated')
  = 'profiles:SELECT,profiles:UPDATE,submissions:DELETE,submissions:INSERT,submissions:SELECT,submissions:UPDATE,user_roles:SELECT');
SELECT pg_temp.check('no TRUNCATE/REFERENCES/TRIGGER for API roles anywhere in public',
  NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
              WHERE table_schema = 'public' AND grantee IN ('anon','authenticated','PUBLIC')
                AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')));

-- Expected EXECUTE privileges (role, function signature, allowed?).
SELECT pg_temp.check(format('EXECUTE %s for %s = %s', fn, r, expected),
                     has_function_privilege(r, fn, 'EXECUTE') = expected)
FROM (VALUES
  ('authenticated', 'public.has_role(uuid,public.app_role)', true),
  ('authenticated', 'public.is_approved(uuid)',              true),
  ('authenticated', 'public.request_report_share(uuid)',     true),
  ('authenticated', 'public.get_shared_report(uuid)',        true),
  ('authenticated', 'public.handle_new_user()',              false),
  ('authenticated', 'public.bootstrap_first_admin(text)',    false),
  ('anon',          'public.has_role(uuid,public.app_role)', false),
  ('anon',          'public.is_approved(uuid)',              false),
  ('anon',          'public.request_report_share(uuid)',     false),
  ('anon',          'public.get_shared_report(uuid)',        false),
  ('anon',          'public.handle_new_user()',              false),
  ('anon',          'public.bootstrap_first_admin(text)',    false),
  ('service_role',  'public.bootstrap_first_admin(text)',    true)
) AS t(r, fn, expected);

-- Sign-up and admin bootstrap -------------------------------------------------------
SELECT pg_temp.check('no sign-up becomes admin automatically',
  NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'));
SELECT pg_temp.check('every sign-up is uploader + pending',
  (SELECT count(*) FROM public.user_roles WHERE role = 'uploader') = 4
  AND (SELECT approval_status FROM public.profiles WHERE id = :'PEND') = 'pending'
  AND (SELECT approval_status FROM public.profiles WHERE id = :'ADMIN') = 'pending');
SELECT pg_temp.expect_denied('authenticated cannot call bootstrap_first_admin', 'authenticated', :'PEND',
  $$SELECT public.bootstrap_first_admin('pending@example.test')$$);
SELECT pg_temp.expect_denied('anon cannot call bootstrap_first_admin', 'anon', NULL,
  $$SELECT public.bootstrap_first_admin('pending@example.test')$$);
SELECT pg_temp.expect_denied('bootstrap rejects unknown email', 'postgres', NULL,
  $$SELECT public.bootstrap_first_admin('nobody@example.test')$$, ARRAY['P0002']);
SELECT public.bootstrap_first_admin(' ADMIN@example.test ') AS bootstrapped \gset
SELECT pg_temp.check('operator bootstrap promotes the chosen account',
  :'bootstrapped'::uuid = :'ADMIN'::uuid
  AND (SELECT approval_status FROM public.profiles WHERE id = :'ADMIN') = 'approved'
  AND (SELECT count(*) FROM public.user_roles WHERE role = 'admin') = 1);
SELECT pg_temp.expect_denied('bootstrap refuses once an admin exists', 'postgres', NULL,
  $$SELECT public.bootstrap_first_admin('pending@example.test')$$);
SELECT pg_temp.check('later sign-ups are uploader + pending after bootstrap',
  (SELECT role::text FROM public.user_roles WHERE user_id = :'PEND') = 'uploader'
  AND (SELECT approval_status FROM public.profiles WHERE id = :'PEND') = 'pending');

-- Archive is server-only (no anon/authenticated access at all) ----------------
SELECT pg_temp.expect_denied('anon cannot read review_cases',          'anon',          NULL,   'SELECT count(*) FROM public.review_cases');
SELECT pg_temp.expect_denied('anon cannot read review_parts',          'anon',          NULL,   'SELECT count(*) FROM public.review_parts');
SELECT pg_temp.expect_denied('uploader cannot read review_cases',      'authenticated', :'UPL', 'SELECT count(*) FROM public.review_cases');
SELECT pg_temp.expect_denied('admin JWT cannot read review_cases',     'authenticated', :'ADMIN', 'SELECT count(*) FROM public.review_cases');
SELECT pg_temp.expect_denied('uploader cannot write review_cases',     'authenticated', :'UPL',
  $$INSERT INTO public.review_cases (owner_key_hash, review_type) VALUES ('x','full')$$);
SELECT pg_temp.check('archive has no RLS policies (admin client only)',
  NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('review_cases','review_parts')));
SELECT pg_temp.check('RLS enabled on every public table',
  NOT EXISTS (SELECT 1 FROM pg_tables t JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
              WHERE t.schemaname = 'public' AND NOT c.relrowsecurity));

-- Anonymous access ------------------------------------------------------------
SELECT pg_temp.expect_denied('anon cannot read submissions', 'anon', NULL, 'SELECT count(*) FROM public.submissions');
SELECT pg_temp.expect_denied('anon cannot read profiles',    'anon', NULL, 'SELECT count(*) FROM public.profiles');
SELECT pg_temp.expect_denied('anon cannot call get_shared_report', 'anon', NULL,
  $$SELECT public.get_shared_report('22222222-2222-2222-2222-222222222222')$$);

-- Uploader isolation ------------------------------------------------------------
SELECT pg_temp.check('uploader sees only own submission',
  pg_temp.as_user('authenticated', :'UPL', 'SELECT string_agg(id::text, '','') FROM public.submissions') = '22222222-2222-2222-2222-222222222222');
SELECT pg_temp.check('uploader sees only own role row',
  pg_temp.as_user('authenticated', :'UPL', 'SELECT count(*) FROM public.user_roles')::int = 1);
SELECT pg_temp.check('uploader sees only own profile',
  pg_temp.as_user('authenticated', :'UPL', 'SELECT count(*) FROM public.profiles')::int = 1);
SELECT pg_temp.check('uploader UPDATE of other submission affects 0 rows',
  pg_temp.as_user('authenticated', :'UPL',
    $$WITH u AS (UPDATE public.submissions SET note = 'x' WHERE id = '33333333-3333-3333-3333-333333333333' RETURNING 1) SELECT count(*) FROM u$$)::int = 0);
SELECT pg_temp.expect_denied('uploader cannot insert submission for someone else', 'authenticated', :'UPL',
  format($$INSERT INTO public.submissions (uploader_id, file_path, file_name) VALUES (%L, 'x', 'x')$$, :'OTHER'));

-- Privilege escalation ----------------------------------------------------------
SELECT pg_temp.check('pending user cannot self-approve (0 rows)',
  pg_temp.as_user('authenticated', :'PEND',
    $$WITH u AS (UPDATE public.profiles SET approval_status = 'approved' WHERE id = auth.uid() RETURNING 1) SELECT count(*) FROM u$$)::int = 0);
SELECT pg_temp.expect_denied('user cannot grant self admin', 'authenticated', :'PEND',
  $$INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin')$$);
SELECT pg_temp.expect_denied('pending user cannot insert submission', 'authenticated', :'PEND',
  format($$INSERT INTO public.submissions (uploader_id, file_path, file_name) VALUES (%L, 'x', 'x')$$, :'PEND'));
SELECT pg_temp.expect_denied('authenticated cannot call handle_new_user', 'authenticated', :'PEND',
  'SELECT public.handle_new_user()', ARRAY['42501','0A000','2F005','39P01','42883']);

-- Storage -------------------------------------------------------------------------
SELECT pg_temp.check('approved uploader can upload into own folder',
  pg_temp.as_user('authenticated', :'UPL',
    format($$WITH i AS (INSERT INTO storage.objects (bucket_id, name) VALUES ('submissions', %L) RETURNING 1) SELECT count(*) FROM i$$, :'UPL' || '/a.pdf'))::int = 1);
SELECT pg_temp.expect_denied('uploader cannot upload into another folder', 'authenticated', :'UPL',
  format($$INSERT INTO storage.objects (bucket_id, name) VALUES ('submissions', %L)$$, :'OTHER' || '/x.pdf'));
SELECT pg_temp.expect_denied('pending user cannot upload', 'authenticated', :'PEND',
  format($$INSERT INTO storage.objects (bucket_id, name) VALUES ('submissions', %L)$$, :'PEND' || '/x.pdf'));
SELECT pg_temp.check('uploader cannot read stored files',
  pg_temp.as_user('authenticated', :'UPL', $$SELECT count(*) FROM storage.objects WHERE bucket_id = 'submissions'$$)::int = 0);

-- Report sharing --------------------------------------------------------------------
SELECT pg_temp.check('shared report hidden before admin shares',
  pg_temp.as_user('authenticated', :'UPL', $$SELECT public.get_shared_report('22222222-2222-2222-2222-222222222222')::text$$) IS NULL);
SELECT pg_temp.as_user('authenticated', :'UPL', $$SELECT public.request_report_share('22222222-2222-2222-2222-222222222222')::text$$);
SELECT pg_temp.check('uploader can request share, but it is not shared yet',
  (SELECT share_requested AND NOT report_shared FROM public.submissions WHERE id = '22222222-2222-2222-2222-222222222222'));
SELECT pg_temp.check('uploader cannot set report_shared themselves (0 rows)',
  pg_temp.as_user('authenticated', :'UPL',
    $$WITH u AS (UPDATE public.submissions SET report_shared = true WHERE id = '22222222-2222-2222-2222-222222222222' RETURNING 1) SELECT count(*) FROM u$$)::int = 0);
SELECT pg_temp.check('admin can share report',
  pg_temp.as_user('authenticated', :'ADMIN',
    $$WITH u AS (UPDATE public.submissions SET report_shared = true WHERE id = '22222222-2222-2222-2222-222222222222' RETURNING 1) SELECT count(*) FROM u$$)::int = 1);
SELECT pg_temp.check('shared report visible to its uploader',
  pg_temp.as_user('authenticated', :'UPL', $$SELECT public.get_shared_report('22222222-2222-2222-2222-222222222222')->>'synthetic'$$) = 'true');
SELECT pg_temp.check('shared report invisible to another approved user',
  pg_temp.as_user('authenticated', :'OTHER', $$SELECT public.get_shared_report('22222222-2222-2222-2222-222222222222')::text$$) IS NULL);

-- Admin ----------------------------------------------------------------------------------
SELECT pg_temp.check('admin reads all submissions',
  pg_temp.as_user('authenticated', :'ADMIN', 'SELECT count(*) FROM public.submissions')::int = 2);
SELECT pg_temp.check('admin can approve a pending user',
  pg_temp.as_user('authenticated', :'ADMIN',
    format($$WITH u AS (UPDATE public.profiles SET approval_status = 'approved' WHERE id = %L RETURNING 1) SELECT count(*) FROM u$$, :'PEND'))::int = 1);

ROLLBACK;
\echo 'ALL RLS CHECKS PASSED'
