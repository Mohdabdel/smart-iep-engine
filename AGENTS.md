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

- IEP audit runs through Lovable AI Gateway `openai/gpt-6-astra` on /v1/responses via `Output.object` with a strict JSON schema (`src/lib/iep-schema.ts`); the Master System Prompt v2.0 lives in `src/lib/iep-audit.server.ts` — keep prompts, model calls and parity rules server-side.
- Deterministic parity is enforced in code after generation (`applyUnifiedRuleParity`): banned implied words stripped and single-criterion rule applied to revised goals, so both chat and app outputs converge on the same decisions.
- Documents (PDF/DOCX/TXT) are parsed client-side in `src/lib/parse-document.ts` (pdfjs-dist + mammoth); the server only receives extracted text.
- Report export sections use one shared section-ID contract for UI selection, print visibility, DOCX composition, and JSON filtering so all formats stay aligned.
- The last audit report (with manual edits and section choices) is kept in browser localStorage and restored on load — a preview/page reload must not wipe a finished report; cleared by «مستند جديد» or a new upload.
