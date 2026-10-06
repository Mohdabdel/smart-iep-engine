import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Trash2 } from "lucide-react";

import { REVIEW_TYPES } from "@/lib/criteria-registry";
import { CASE_STATUS_LABELS, deleteReviewCase, listReviewCases, type CaseSummary } from "@/lib/review-store";

export const Route = createFileRoute("/_authenticated/_admin/reviews")({
  component: Reviews,
  head: () => ({
    meta: [
      { title: "المراجعات السابقة — محرك المراجعة الإشرافية للخطط التربوية الفردية" },
      { name: "description", content: "أرشيف المراجعات السابقة: فتح التقارير، استكمال المراجعات غير المكتملة، التعديل والتصدير." },
      { property: "og:title", content: "المراجعات السابقة — محرك المراجعة الإشرافية" },
      { property: "og:description", content: "أرشيف خاص بهذا الجهاز لمراجعات الخطط التربوية الفردية مع الاستكمال بعد الانقطاع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const fmt = (d: string) => new Date(d).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" });
const act = "rounded-md border border-input px-2 py-1 text-xs hover:bg-muted";

function Reviews() {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    listReviewCases()
      .then(setCases)
      .catch((e: unknown) => {
        setCases([]);
        setError(e instanceof Error ? `تعذر تحميل الأرشيف: ${e.message}` : "تعذر تحميل الأرشيف.");
      });
  useEffect(() => {
    void load();
  }, []);

  async function remove(c: CaseSummary) {
    if (!window.confirm(`حذف مراجعة «${c.learner_name || c.source_file_name}» نهائياً؟`)) return;
    try {
      await deleteReviewCase(c.id);
      setCases((cs) => cs?.filter((x) => x.id !== c.id) ?? null);
    } catch {
      setError("تعذر الحذف.");
    }
  }

  return (
    <main dir="rtl" className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">المراجعات السابقة</h1>
            <p className="text-xs text-muted-foreground">الأرشيف خاص بهذا المتصفح ولا يظهر لأي جهة أخرى.</p>
          </div>
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm hover:bg-accent">
            <ArrowRight className="h-4 w-4" /> العودة للمراجعة
          </Link>
        </div>
        {error && <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        {!cases ? (
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
        ) : !cases.length ? (
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">لا توجد مراجعات محفوظة بعد.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/60 text-right text-xs">
                  {["اسم المتعلم", "اسم الملف", "تاريخ المراجعة", "نوع المراجعة", "الحالة", "قرار المراجعة", "آخر تحديث", "الإجراءات"].map((h) => (
                    <th key={h} className="border-b border-border px-3 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => {
                  const incomplete = c.status === "partial" || c.status === "running" || c.status === "failed";
                  return (
                    <tr key={c.id} className="border-b border-border align-top">
                      <td className="px-3 py-2">{c.learner_name || "—"}</td>
                      <td className="px-3 py-2 text-xs">{c.source_file_name}</td>
                      <td className="px-3 py-2 text-xs">{fmt(c.created_at)}</td>
                      <td className="px-3 py-2 text-xs">{REVIEW_TYPES.find((t) => t.id === c.review_type)?.label ?? c.review_type}</td>
                      <td className="px-3 py-2 text-xs font-medium">{CASE_STATUS_LABELS[c.status] ?? c.status}</td>
                      <td className="px-3 py-2 text-xs">{c.review_decision || "—"}</td>
                      <td className="px-3 py-2 text-xs">{fmt(c.updated_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <a href={`/?case=${c.id}`} className={act}>فتح</a>
                          {incomplete && <a href={`/?case=${c.id}`} className={act}>متابعة</a>}
                          {!incomplete && <a href={`/?case=${c.id}&edit=1`} className={act}>تعديل التقرير</a>}
                          {!incomplete && <a href={`/?case=${c.id}`} className={act}>تصدير</a>}
                          <a href={`/?copy=${c.id}`} className={act}>نسخ بنفس الإعدادات</a>
                          <button onClick={() => void remove(c)} aria-label="حذف" className="rounded-md p-1 text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
