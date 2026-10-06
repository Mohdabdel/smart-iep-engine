import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildReportBlocks } from "@/lib/export-report";
import { normalizeReport, type IepAuditReport } from "@/lib/iep-schema";

type S = { id: string; file_name: string; created_at: string; status: string; review_case_id: string | null; report_shared: boolean; share_requested: boolean };
const LABEL: Record<string, string> = { new: "مستلم", in_review: "قيد المراجعة", done: "اكتملت المراجعة" };
const btn = "rounded-lg border border-input px-3 py-1.5 text-xs hover:bg-accent";

export function MySubmissions({ userId, refresh }: { userId: string; refresh: number }) {
  const [rows, setRows] = useState<S[]>([]);
  const [report, setReport] = useState<IepAuditReport | null>(null);
  const load = () =>
    supabase
      .from("submissions")
      .select("id,file_name,created_at,status,review_case_id,report_shared,share_requested")
      .eq("uploader_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setRows((data as S[]) ?? []));
  useEffect(() => void load(), [userId, refresh]);

  const request = async (id: string) => {
    await supabase.rpc("request_report_share", { _sub: id });
    load();
  };
  const view = async (id: string) => {
    const { data } = await supabase.rpc("get_shared_report", { _sub: id });
    if (data) setReport(normalizeReport(data as unknown as IepAuditReport));
  };

  if (report)
    return (
      <div className="space-y-4">
        <button className={btn} onClick={() => setReport(null)}>رجوع</button>
        {buildReportBlocks(report).map((b) => (
          <section key={b.id} className="space-y-1">
            <h3 className="font-semibold">{b.title}</h3>
            {b.lines.map((l, i) => <p key={i} className="text-sm">{l}</p>)}
            {b.table && (
              <table className="w-full border text-xs">
                <thead><tr>{b.table.head.map((h, i) => <th key={i} className="border p-1">{h}</th>)}</tr></thead>
                <tbody>{b.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="border p-1">{c}</td>)}</tr>)}</tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    );

  if (!rows.length) return null;
  return (
    <div className="space-y-2 border-t pt-4">
      <h2 className="text-sm font-semibold">مستنداتي</h2>
      {rows.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-xs">
          <div>
            <div className="font-medium">{s.file_name}</div>
            <div className="text-muted-foreground">{LABEL[s.status] ?? s.status} · {new Date(s.created_at).toLocaleDateString("ar")}</div>
          </div>
          {s.report_shared ? (
            <button className={btn} onClick={() => view(s.id)}>عرض التقرير</button>
          ) : s.share_requested ? (
            <span className="text-muted-foreground">تم طلب الاطلاع — بانتظار المشرف</span>
          ) : s.review_case_id ? (
            <button className={btn} onClick={() => request(s.id)}>طلب الاطلاع على التقرير</button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
