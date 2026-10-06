<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- IEP audit runs through Lovable AI Gateway `openai/gpt-6-astra` on /v1/responses via `Output.object` with a strict JSON schema (`src/lib/iep-schema.ts`); the reviewer system prompt lives in `src/lib/iep-audit.server.ts` — keep prompts, model calls and parity rules server-side.
- Criteria live in one registry (`src/lib/criteria-registry.ts`) shared by the scope UI, the prompt and post-generation enforcement; never hardcode criteria in the prompt only.
- Reviewer rules that must not depend on the model are enforced in code after generation (`src/lib/iep-parity.ts`): out-of-scope criteria dropped, reviewer attestations applied, implied words/single criterion, no automatic safety items, gates block direct approval. Never phrase-match performance conditions.
- Review scope (what the engine reviews) and report sections (what is printed/exported) are separate; all report content flows through `buildReportBlocks` so screen, print, Word and JSON stay aligned.
- Documents (PDF/DOCX/TXT) are parsed client-side in `src/lib/parse-document.ts` (pdfjs-dist + mammoth); the server only receives extracted text.
- Report export sections use one shared section-ID contract for UI selection, print visibility, DOCX composition, and JSON filtering so all formats stay aligned.
- The last audit report (with manual edits and section choices) is kept in browser localStorage and restored on load — a preview/page reload must not wipe a finished report; cleared by «مستند جديد» or a new upload.
- A review runs as parallel partial requests (`partsForReviewType`), each well under the ~3-minute request ceiling; the browser merges parts and applies `applyReviewerParity` — keep each part's key set small enough to finish in time.
- Functional activity contexts live in `src/lib/functional-context-registry.ts`; it is a reviewer reference only — potential contexts never count as present and never generate goals.
- Goal-review counts, transition coverage percentage and the decision brief are computed in code (`goalReviewCounts`, `transitionStats`), never taken from model text.
- Review archive (`review_cases`, `review_parts`) is server-only: RLS on with no policies; `/api/reviews` uses the admin client scoped by a sha256 of a per-browser owner key — never add public/anon policies for review data.
- Review parts run through `runParts` (`src/lib/review-orchestrator.ts`): allSettled, one retry only for network errors, resume reruns only non-completed parts; plan text for resume is cached in localStorage per case, not stored in the archive.
- Access: _authenticated gate + _admin layout (user_roles admin); uploaders only reach /upload; /api/audit and /api/reviews require an admin bearer (require-admin.server.ts) — server must not trust the UI gate.
