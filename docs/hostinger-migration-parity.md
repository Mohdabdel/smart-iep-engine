# Hostinger migration — controlled parity workstream

Status: preparation only. No production deployment, database migration, or model substitution has been authorized or performed.

## Baseline
- Source: `main` at branch creation; preserve it unchanged.
- Application: TanStack Start / React / TypeScript, Vite/Nitro.
- AI: `src/lib/iep-audit.server.ts` currently calls Lovable AI Gateway (`openai/gpt-6-astra`) via `LOVABLE_API_KEY`; uses structured output and low reasoning effort.
- Dependencies: Lovable Vite config, Lovable Cloud Auth, Supabase database/storage.
- Hostinger plan: Node.js 18–24, 3 GB RAM, 2 vCPU (user-provided account details).

## Non-negotiable invariants
1. Do not alter review prompts, criteria registry, schemas, chunking, retry logic, goal judgments, or report rendering during initial infrastructure adaptation.
2. Do not send real learner documents to a new provider or environment until data processing, permissions, retention, and authorization are reviewed.
3. Do not copy secrets into GitHub, client-side environment variables, logs, or test fixtures.
4. Do not assume the Lovable gateway model identifier is directly usable on a provider API. Confirm the exact model, access entitlement, request compatibility, pricing and lifecycle with the provider.
5. Keep Lovable production and the `main` branch untouched until parity gates pass.

## Stage 1 — readiness audit
- [ ] Verify GitHub branch SHA matches the desired Lovable project revision.
- [ ] Inspect full dependency tree and build output for Node/Nitro support.
- [ ] Inventory all server routes, environment variables, authentication paths, database tables, RLS, storage buckets, migrations, and export formats.
- [ ] Check tracked .env values for public vs privileged keys; move secrets to server-side secret manager. Review Git history if privileged secrets were ever committed.
- [ ] Document source-of-truth and backup/rollback plan for Lovable Cloud data.

## Stage 2 — infrastructure adapter (branch only)
- [ ] Add Hostinger-compatible Node/Nitro build/start commands; test clean install and build.
- [ ] Introduce a server-only AI provider adapter without modifying review instructions or schema.
- [ ] Keep the current Lovable provider as the baseline and make alternate provider opt-in through server-only config.
- [ ] Configure an independently controlled Supabase project and auth only after migration/restore testing.
- [ ] Configure staging subdomain and HTTPS; do not repoint production DNS.

## Stage 3 — parity gates
- [ ] Run existing automated tests and report failures.
- [ ] Use 5–10 anonymized IEP plans (short/long; PDF/Word; diverse review types).
- [ ] Compare baseline and candidate on the same inputs/configuration, repeated runs.
- [ ] Assess critical gates, per-criterion verdicts, evidence grounding, goal revisions, transition coverage, functional contexts, JSON validity, timeout/retry, export integrity, and access control.
- [ ] Log latency, input/output tokens, cost, errors and model identifiers per part.
- [ ] Require expert sign-off for material judgment differences; no claim of literal determinism.
- [ ] Test backup/restore and rollback before any cutover.

## Pending external confirmations
- Lovable Cloud data export / admin key limitations and migration options.
- Direct provider availability and API compatibility of the exact model in use.
- Hostinger-specific Node process limits and build/start configuration.

## Approval boundary
Any production DNS change, transfer of sensitive data, credentials change, service cutover, or merging to main requires explicit approval.
