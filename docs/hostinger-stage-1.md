# Stage 1 — Independent AI provider adapter (not deployed)

The adapter at `src/lib/ai-provider.server.ts` allows selecting the existing Lovable gateway (default) or a direct OpenAI-compatible provider. The actual audit call is not yet switched to the adapter; this is intentional until build and baseline tests pass.

## Next checks
1. Verify model ID and account access directly with the API provider. The Lovable model alias `openai/gpt-6-astra` is **not** proof that `gpt-6-astra` is directly available.
2. Keep prompts, JSON schema, reasoning effort, chunking and retry logic identical when wiring the adapter.
3. Build on a Node target rather than the Lovable Cloudflare preset. Confirm output entrypoint before setting Hostinger start command.
4. Do not deploy with the existing Lovable Cloud database/service key assumptions.
5. Run the existing unit tests and a de-identified plan comparison before production.

No user documents, credentials, DNS records, or production services were changed.
