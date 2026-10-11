# Hostinger private staging — operator runbook

Status: **prepared only**. No Hostinger app, DNS, credentials, or production records have been changed.

## 1. Provision isolated staging
- In Hostinger hPanel create a **new Node.js application**, not an overwrite of `app.masarhemmam.com` or the live Lovable site.
- Use Node.js **22**, repository `Mohdabdel/smart-iep-engine`, branch `migration/hostinger-parity`.
- Keep the staging address access-restricted (Hostinger protection / reverse proxy access control); do **not** expose the app publicly.
- Do not set `iep-quality.masarhemmam.com` DNS until acceptance.

## 2. Build and start
- `bun.lock` tarball URLs point at registry.npmjs.org (previously Lovable's npm cache mirror). All 66 rewritten entries were verified: same name@version and identical `sha512` integrity on npmjs; versions are unchanged.
- Install (no global Bun needed): `npx -y bun@1.3.13 install --frozen-lockfile`. Do **not** use `npm install`/`npm ci`: there is no npm lockfile, npm ignores `bun.lock`, and `npm install --package-lock-only` currently fails on this `package.json`.
- Build with `IEP_DEPLOY_TARGET=hostinger`: `npx -y bun@1.3.13 run build`
- Start (staging, gated): `node scripts/staging-gate.mjs` — never `node .output/server/index.mjs` directly on a public port.
- Node runtime should honor `PORT` from the hosting environment. Verify this in staging; GitHub Actions confirms the entrypoint starts and serves HTTP locally.
- Ensure build environment also has the `VITE_SUPABASE_*` **publishable** values; they are embedded at build time.

## 1a. Deployment path: prebuilt upload bundle (chosen)
Hostinger's Git deploy only offers npm/yarn/pnpm and package.json scripts; `npm install` fails on this
package.json and yarn/pnpm ignore `bun.lock` (45 of 80 direct deps drift). So staging is deployed as a
**prebuilt bundle** via hPanel → Web Apps → *Upload your files* (verified: framework "Other", build
command "None", free-text entry file):
- CI workflow `Hostinger staging bundle` builds with Bun + frozen `bun.lock`, removes the committed `.env`,
  embeds only the staging URL + publishable key (repo **variables** `STAGING_SUPABASE_URL`,
  `STAGING_SUPABASE_PUBLISHABLE_KEY`), assembles `iep-staging-bundle.zip`, and smoke-tests it.
- The bundle scan fails on any `.env`, secret-key pattern, non-anon JWT, the production project ref, or a
  missing staging ref.
- Bundle layout: `staging-gate.mjs` (entry), `staging-gate-inner.mjs`, `app/` (Nitro output),
  `package.json` + `package-lock.json` pinning only Nitro's traced externals (exact + integrity).
- hPanel settings: Framework **Other**, Node **22.x**, build command **None**, package manager **npm**,
  output directory **empty**, entry file **`staging-gate.mjs`**.
- Runtime env (owner enters in Hostinger only): `STAGING_GATE_USER`, `STAGING_GATE_PASS`,
  `STAGING_GATE_SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `NODE_ENV=production`, and AI provider vars when enabled.

## 2a. Staging access gate (`scripts/staging-gate.mjs`)
Equivalent to Cloudflare Access without a DNS change (masarhemmam.com uses Hostinger nameservers).
- HTTP Basic login → HMAC-signed session cookie (`iep_gate`, HttpOnly, Secure, SameSite=Lax) with server-verified expiry.
- Failed logins throttled (5 per client / 50 global per 15 min → 429).
- Nitro runs as a child bound to 127.0.0.1 on an ephemeral port and is preloaded with `scripts/staging-gate-inner.mjs`; requests without the per-boot inner secret get 403, so the inner port cannot bypass the gate.
- Upstream failure → 502, upstream timeout → 504; the gate stays up.
- Logs never contain passwords, Authorization values, cookies or tokens.
- Required env (set by the owner in Hostinger only): `STAGING_GATE_USER`, `STAGING_GATE_PASS` (≥16 chars), `STAGING_GATE_SESSION_SECRET` (≥32 chars, different from the password), optional `STAGING_GATE_SESSION_TTL` (seconds, default 43200). The gate refuses to start without them.
- Tests: `node --test scripts/staging-gate.test.mjs` (CI).

## 2b. Staging database
- Independent, empty Supabase project. Apply `supabase/migrations/*.sql` in order, then `supabase/staging/create-submissions-bucket.sql` (private bucket missing from migrations).
- Every sign-up is `uploader` + `pending` (migration `20261011140000`); nobody becomes admin automatically.
- First admin (operator only, SQL editor as project owner): sign up in the app, then run `SELECT public.bootstrap_first_admin('your-email');`. It is not executable by `anon`/`authenticated`, and refuses once any admin exists. Then disable public sign-ups (Auth → Providers → Email) and approve/invite users from the admin UI.
- Grants are explicit (migration `20261011140000`): `authenticated` may execute `has_role`/`is_approved`; no TRUNCATE/REFERENCES/TRIGGER for API roles; `anon` has nothing on public tables; the archive is service-role only.
- Auth → URL Configuration: Site URL and Redirect URLs = `https://iep-staging.masarhemmam.com`. Google sign-in uses the Lovable Cloud broker and is out of scope for staging.
- Synthetic RLS checks: `supabase/tests/10-staging-rls-synthetic.sql` (CI runs it on a throwaway Postgres with `00-supabase-stub.sql` in two modes — `expose` and `locked` default grants — and asserts the exact privilege matrix; never run the stub against Supabase).

## 3. Secrets and configuration
Use `.env.hostinger.example` as the names-only reference. Enter values in Hostinger secret/environment settings, not in source files or logs.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`: browser publishable.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`: server-only, privileged.
- `IEP_AI_PROVIDER=openai`, `OPENAI_API_KEY`, `IEP_OPENAI_MODEL`: only after provider/model access is verified.
- Never use `VITE_` for private keys.
- Confirm the existing tracked `.env` history has been audited and affected credentials rotated before exposing staging.

## 4. Acceptance tests (synthetic data only)
1. GET `/` -> HTTP 200, page and assets load.
2. POST `/api/audit` and `/api/reviews` without a token -> HTTP 401.
3. Log in using a dedicated **non-admin** test account; valid token -> HTTP 403 for both APIs.
4. Log in using a dedicated **admin** test account; verify permitted API access, session refresh, and logout. OAuth callback allow-list and Lovable OAuth wrapper may need adjustment.
5. Create a synthetic review; list/load/update a part/update report/delete. Check all operations and the intended shared-admin scope.
6. Verify no learner information or service-role key appears in browser bundle, network responses, or logs.
7. Run a synthetic audit against verified AI provider; compare schema, criteria, errors, and representative anonymized baseline outputs.
8. Confirm backups and documented rollback before any production cutover.

## 5. Failure policy
- Missing credentials, unavailable Lovable Cloud service key, unverified model, OAuth failure, unexpected admin access, or failed archive write -> **NO-GO**.
- Keep production `main`, DNS, Lovable application, and learner records untouched.
- Do not request or paste secrets into chat, GitHub issues, or commits.

## 6. Evidence record
For each test record date, environment, commit SHA, test case, pass/fail, and sanitized evidence (no tokens, personal data, or student documents). Only authorize production cutover after explicit approval.
