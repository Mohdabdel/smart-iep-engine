# Hostinger private staging — operator runbook

Status: **prepared only**. No Hostinger app, DNS, credentials, or production records have been changed.

## 1. Provision isolated staging
- In Hostinger hPanel create a **new Node.js application**, not an overwrite of `app.masarhemmam.com` or the live Lovable site.
- Use Node.js **22**, repository `Mohdabdel/smart-iep-engine`, branch `migration/hostinger-parity`.
- Keep the staging address access-restricted (Hostinger protection / reverse proxy access control); do **not** expose the app publicly.
- Do not set `iep-quality.masarhemmam.com` DNS until acceptance.

## 2. Build and start
- Install Bun if supported by the Hostinger deployment environment. If Bun is unavailable, do **not** use `npm ci` (there is no npm lockfile); choose a compatible build method and verify lockfile reproducibility.
- Install: `bun install --frozen-lockfile`
- Build with `IEP_DEPLOY_TARGET=hostinger`: `bun run build`
- Start: `node .output/server/index.mjs`
- Node runtime should honor `PORT` from the hosting environment. Verify this in staging; GitHub Actions confirms the entrypoint starts and serves HTTP locally.
- Ensure build environment also has the `VITE_SUPABASE_*` **publishable** values; they are embedded at build time.

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
