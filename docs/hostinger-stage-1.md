# Hostinger migration — verified stage 1 (isolated branch)

Branch: `migration/hostinger-parity`. Production `main`, DNS, and Lovable deployment remain untouched.

## Verified by GitHub Actions
- Frozen-lockfile Bun install and unit tests.
- Original build and opt-in Node.js build with `IEP_DEPLOY_TARGET=hostinger`.
- `.output/server/index.mjs` starts under Node.js; Node build has no `wrangler.json`.
- GET `/` returns HTTP 200 and HTML.
- Unauthenticated POST `/api/audit` and `/api/reviews` both return HTTP 401.
- Source-level security regression tests for server-only credentials and auth ordering.

## Implementation status
- AI adapter is **wired** into `src/lib/iep-audit.server.ts`; default remains Lovable gateway. Direct OpenAI is opt-in with `IEP_AI_PROVIDER=openai`, `OPENAI_API_KEY`, and explicitly verified `IEP_OPENAI_MODEL`. No live AI parity test yet.
- Review archive uses Supabase server-side admin credentials and an `admin-shared` owner scope after admin authentication. This is shared among admins, **not** per-user isolation.
- Lovable Cloud OAuth wrapper is still present; OAuth login on the new domain is **not verified**.
- Existing Supabase project and production records have **not** been migrated, queried, or modified.

## Staging deployment contract (not yet executed)
1. Create a **private** staging Node.js application; do not point production DNS or publish a public URL.
2. Configure `IEP_DEPLOY_TARGET=hostinger` during build. Run `bun install --frozen-lockfile && bun run build` with Node.js 22 available. Entrypoint: `node .output/server/index.mjs`. Hostinger panel command compatibility must be checked.
3. Supply browser-publishable Supabase settings and server-only Supabase service credentials from an authorized secure channel, per `.env.hostinger.example`. Never expose the service role key in browser bundles or Git.
4. Configure allowed Supabase Auth redirects for staging; test login/logout/session refresh with authorized test accounts. The Lovable OAuth integration may need replacement.
5. Test non-admin denial (403), admin access, creating/loading/updating/deleting a **synthetic** review, and RLS/storage boundaries. Do not use student data in staging.
6. Configure direct AI provider and verified model, then compare de-identified outputs, structured JSON and error handling against baseline.
7. Confirm backups, rollback, and explicit acceptance before any DNS switch or production migration.

## Risks requiring action
- A previously tracked `.env` file is **not removed from Git history** by the new `.gitignore`. Audit exposure and rotate any affected secrets before launch.
- Authentication and real DB/API operations remain untested on Hostinger.
- Passing CI does not prove feature parity, privacy compliance, or readiness to publish.
