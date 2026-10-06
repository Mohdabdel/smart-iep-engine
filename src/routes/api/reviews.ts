import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { z } from "zod";

/**
 * أرشيف المراجعات — الجداول مغلقة أمام الوصول العام (RLS بلا سياسات)،
 * والخادم وحده يقرأ ويكتب، مقيداً بمفتاح المتصفح الخاص (owner key) الذي لا يُخزَّن إلا مُجزَّأً.
 */
const STATUS = z.enum(["draft", "running", "partial", "completed", "approved", "failed"]);
const PART_STATUS = z.enum(["pending", "running", "completed", "failed"]);
const id = z.string().uuid();

const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    owner_key: z.string().optional(),
    learner_name: z.string().nullable().optional(),
    source_file_name: z.string(),
    review_type: z.string(),
    review_spec_version: z.string(),
    report_schema_version: z.number().int(),
    review_config: z.unknown(),
    report_sections: z.unknown(),
    part_keys: z.array(z.string()).min(1),
  }),
  z.object({
    action: z.literal("update_part"),
    owner_key: z.string().optional(),
    id,
    part_key: z.string(),
    status: PART_STATUS,
    result_json: z.unknown().optional(),
    error_message: z.string().nullable().optional(),
    increment_attempts: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("update_case"),
    owner_key: z.string().optional(),
    id,
    status: STATUS.optional(),
    report_json: z.unknown().optional(),
    review_decision: z.string().nullable().optional(),
    learner_name: z.string().nullable().optional(),
    report_sections: z.unknown().optional(),
  }),
  z.object({ action: z.literal("list"), owner_key: z.string().optional() }),
  z.object({ action: z.literal("load"), owner_key: z.string().optional(), id }),
  z.object({ action: z.literal("delete"), owner_key: z.string().optional(), id }),
]);

const hash = (k: string) => createHash("sha256").update(k).digest("hex");

export const Route = createFileRoute("/api/reviews")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "طلب غير صالح." }, { status: 400 });
        const b = parsed.data;
        const { requireAdmin } = await import("@/lib/require-admin.server");
        const gate = await requireAdmin(request);
        if (gate instanceof Response) return gate;
        void hash;
        const owner = "admin-shared";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabaseAdmin as any;
        const now = new Date().toISOString();
        const fail = (e: { message?: string } | null) => Response.json({ error: e?.message ?? "خطأ في الحفظ." }, { status: 500 });

        const ownCase = async (caseId: string) => {
          const { data } = await db.from("review_cases").select("id").eq("id", caseId).eq("owner_key_hash", owner).maybeSingle();
          return !!data;
        };

        switch (b.action) {
          case "create": {
            const { data, error } = await db
              .from("review_cases")
              .insert({
                owner_key_hash: owner,
                learner_name: b.learner_name ?? null,
                source_file_name: b.source_file_name,
                review_type: b.review_type,
                status: "running",
                review_spec_version: b.review_spec_version,
                report_schema_version: b.report_schema_version,
                review_config: b.review_config,
                report_sections: b.report_sections,
              })
              .select("id")
              .single();
            if (error) return fail(error);
            const { error: pe } = await db.from("review_parts").insert(b.part_keys.map((k) => ({ review_case_id: data.id, part_key: k, status: "pending" })));
            if (pe) return fail(pe);
            return Response.json({ id: data.id });
          }
          case "update_part": {
            if (!(await ownCase(b.id))) return Response.json({ error: "غير موجود." }, { status: 404 });
            const { data: cur } = await db.from("review_parts").select("attempts").eq("review_case_id", b.id).eq("part_key", b.part_key).maybeSingle();
            const patch: Record<string, unknown> = { status: b.status };
            if (b.increment_attempts) patch["attempts"] = (cur?.attempts ?? 0) + 1;
            if (b.status === "running") Object.assign(patch, { started_at: now, error_message: null });
            if (b.status === "completed") Object.assign(patch, { completed_at: now, result_json: b.result_json ?? null, error_message: null });
            if (b.status === "failed") patch["error_message"] = b.error_message ?? "تعذر التنفيذ.";
            const { error } = await db.from("review_parts").upsert({ review_case_id: b.id, part_key: b.part_key, ...patch }, { onConflict: "review_case_id,part_key" });
            return error ? fail(error) : Response.json({ ok: true });
          }
          case "update_case": {
            const patch: Record<string, unknown> = {};
            if (b.status) {
              patch["status"] = b.status;
              if (b.status === "completed") patch["completed_at"] = now;
              if (b.status === "approved") patch["approved_at"] = now;
            }
            if (b.report_json !== undefined) patch["report_json"] = b.report_json;
            if (b.review_decision !== undefined) patch["review_decision"] = b.review_decision;
            if (b.learner_name !== undefined) patch["learner_name"] = b.learner_name;
            if (b.report_sections !== undefined) patch["report_sections"] = b.report_sections;
            const { error } = await db.from("review_cases").update(patch).eq("id", b.id).eq("owner_key_hash", owner);
            return error ? fail(error) : Response.json({ ok: true });
          }
          case "list": {
            const { data, error } = await db
              .from("review_cases")
              .select("id, learner_name, source_file_name, review_type, status, review_decision, created_at, updated_at")
              .eq("owner_key_hash", owner)
              .order("updated_at", { ascending: false })
              .limit(200);
            return error ? fail(error) : Response.json({ cases: data });
          }
          case "load": {
            const { data, error } = await db.from("review_cases").select("*").eq("id", b.id).eq("owner_key_hash", owner).maybeSingle();
            if (error) return fail(error);
            if (!data) return Response.json({ error: "غير موجود." }, { status: 404 });
            const { data: parts } = await db.from("review_parts").select("part_key, status, result_json, error_message, attempts").eq("review_case_id", b.id);
            delete data.owner_key_hash;
            return Response.json({ case: data, parts: parts ?? [] });
          }
          case "delete": {
            const { error } = await db.from("review_cases").delete().eq("id", b.id).eq("owner_key_hash", owner);
            return error ? fail(error) : Response.json({ ok: true });
          }
        }
      },
    },
  },
});
