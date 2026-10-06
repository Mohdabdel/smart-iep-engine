import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/_admin/admin/submissions")({
  component: SubmissionsPage,
  head: () => ({
    meta: [
      { title: "المستندات الواردة" },
      { name: "description", content: "المستندات المرفوعة من المستخدمين بانتظار المراجعة." },
      { property: "og:title", content: "المستندات الواردة" },
      { property: "og:description", content: "قائمة المستندات المرفوعة للمراجعة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type S = { id: string; uploader_id: string; file_name: string; file_path: string; learner_name: string | null; note: string | null; status: string; created_at: string; review_case_id: string | null; report_shared: boolean; share_requested: boolean };
const LABEL: Record<string, string> = { new: "جديد", in_review: "قيد المراجعة", done: "اكتمل" };
const btn = "rounded-lg border border-input px-3 py-1.5 text-xs hover:bg-accent";

function SubmissionsPage() {
  const [rows, setRows] = useState<S[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const load = async () => {
    const { data } = await supabase.from("submissions").select("*").order("created_at", { ascending: false });
    setRows((data as S[]) ?? []);
    const { data: ps } = await supabase.from("profiles").select("id,email");
    setEmails(Object.fromEntries((ps ?? []).map((p) => [p.id, p.email ?? ""])));
  };
  useEffect(() => void load(), []);
  const setStatus = async (id: string, status: string) => {
    await supabase.from("submissions").update({ status }).eq("id", id);
    load();
  };
  const share = async (id: string, on: boolean) => {
    await supabase.from("submissions").update({ report_shared: on, share_requested: false }).eq("id", id);
    load();
  };
  const remove = async (s: S) => {
    if (!confirm("حذف هذا المستند؟")) return;
    await supabase.storage.from("submissions").remove([s.file_path]);
    await supabase.from("submissions").delete().eq("id", s.id);
    load();
  };
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">المستندات الواردة</h1>
        <Link to="/" className={btn}>العودة للمراجعة</Link>
      </div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">لا توجد مستندات بعد.</p>}
      <table className="w-full text-sm">
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-b align-top">
              <td className="p-2">
                <div className="font-medium">{s.file_name}</div>
                <div className="text-xs text-muted-foreground">{s.learner_name ?? "—"} · {emails[s.uploader_id] ?? ""}</div>
                {s.note && <div className="mt-1 text-xs">{s.note}</div>}
                {s.share_requested && !s.report_shared && <div className="mt-1 text-xs font-medium text-primary">طلب الاطلاع على التقرير</div>}
              </td>
              <td className="p-2 text-xs">{new Date(s.created_at).toLocaleString("ar")}</td>
              <td className="p-2 text-xs">{LABEL[s.status] ?? s.status}</td>
              <td className="flex flex-wrap gap-2 p-2">
                <a className={btn} href={`/?submission=${s.id}`}>فتح في المراجعة</a>
                {s.status !== "done" && <button className={btn} onClick={() => setStatus(s.id, "done")}>تعليم كمكتمل</button>}
                {s.review_case_id ? (
                  <button className={btn} onClick={() => share(s.id, !s.report_shared)}>
                    {s.report_shared ? "إيقاف مشاركة التقرير" : "مشاركة التقرير مع الرافع"}
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">لا يوجد تقرير بعد</span>
                )}
                <button className={btn} onClick={() => remove(s)}>حذف</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
