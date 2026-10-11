-- Grants hardening + explicit admin bootstrap.
--
-- 1. RLS policies call public.has_role / public.is_approved as "authenticated".
--    Projects created with "auto-expose new tables" disabled do not grant
--    EXECUTE by default, which breaks every policy for signed-in users.
-- 2. Table privileges are set explicitly instead of relying on project
--    defaults (which may add TRUNCATE/REFERENCES/TRIGGER — TRUNCATE bypasses RLS).
--    The review archive stays service-role only.
-- 3. The first sign-up no longer becomes admin automatically. An operator
--    promotes the first admin with public.bootstrap_first_admin(email), which
--    only the database owner / service role can execute and which refuses to
--    run once an admin exists.

-- Function privileges -----------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;

-- Table privileges (explicit, least privilege) ----------------------------------
REVOKE ALL ON public.review_cases, public.review_parts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.profiles, public.user_roles, public.submissions FROM PUBLIC, anon, authenticated;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO authenticated;

GRANT ALL ON public.review_cases, public.review_parts, public.profiles, public.user_roles, public.submissions TO service_role;

-- Sign-up: every new account is an uploader awaiting approval -------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, approval_status)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'pending');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'uploader'::public.app_role);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Operator-only bootstrap of the first admin --------------------------------------
-- Usage (SQL editor, as the project owner):
--   SELECT public.bootstrap_first_admin('owner@example.com');
CREATE OR REPLACE FUNCTION public.bootstrap_first_admin(_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid;
BEGIN
  -- Serialise concurrent calls so two admins cannot be created by a race.
  PERFORM pg_advisory_xact_lock(hashtext('public.bootstrap_first_admin'));

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'an admin already exists; use the admin UI to manage roles'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.id INTO target FROM auth.users u WHERE lower(u.email) = lower(trim(_email));
  IF target IS NULL THEN
    RAISE EXCEPTION 'no account with that email; sign up first' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.profiles SET approval_status = 'approved' WHERE id = target;
  INSERT INTO public.user_roles (user_id, role) VALUES (target, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN target;
END $$;
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin(text) TO service_role;
