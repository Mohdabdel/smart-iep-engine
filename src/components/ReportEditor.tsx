import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { IEP_DOMAINS, REVISION_CATEGORIES, type IepAuditReport } from "@/lib/iep-schema";

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Area({ value, onChange, rows = 2 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  return <textarea dir="rtl" rows={rows} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function ReportEditor({
  report,
  onSave,
  onClose,
}: {
  report: IepAuditReport;
  onSave: (r: IepAuditReport) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<IepAuditReport>(() => structuredClone(report));
  const s = d.micro_audit_summary;
  const m = d.macro_plan_engineering;
  const q = m.horizontal_analysis_6_questions;
  const c = d.checklist_24_standards_status;

  const setSummary = (patch: Partial<typeof s>) => setD({ ...d, micro_audit_summary: { ...s, ...patch } });
  const setMacro = (patch: Partial<typeof m>) => setD({ ...d, macro_plan_engineering: { ...m, ...patch } });
  const setQ = (k: keyof typeof q, v: string) => setMacro({ horizontal_analysis_6_questions: { ...q, [k]: v } });
  const setRev = (i: number, patch: Partial<IepAuditReport["revisions"][number]>) =>
    setD({ ...d, revisions: d.revisions.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const qLabels: [keyof typeof q, string][] = [
    ["q1_horizontal_bundling", "1. الترابط الأفقي"],
    ["q2_cross_domain_integration", "2. التكامل عبر المجالات"],
    ["q3_sequential_logic", "3. التسلسل المنطقي"],
    ["q4_observable_life_impact", "4. الأثر الملموس"],
    ["q5_post_graduation_readiness", "5. الجاهزية لما بعد التخرج"],
    ["q6_scattered_goals_detected", "6. كشف الأهداف المتفرقة"],
  ];
  const cLabels: [keyof typeof c, string][] = [
    ["pillar_1_plaafp", "الركيزة 1: مستوى الأداء الحالي"],
    ["pillar_2_smart_goals", "الركيزة 2: الأهداف القابلة للقياس"],
    ["pillar_3_admin", "الركيزة 3: الجودة الإدارية"],
    ["pillar_4_transition", "الركيزة 4: المواءمة الانتقالية"],
    ["items_13_7_to_13_11_plan_engineering", "البنود 13-7 إلى 13-11"],
  ];

  const section = "space-y-3 rounded-xl border border-border bg-card p-4";

  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-foreground/40 p-4 print:hidden" dir="rtl">
      <div className="my-4 h-fit w-full max-w-4xl rounded-2xl bg-background shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-2xl border-b border-border bg-background px-5 py-4">
          <h2 className="text-lg font-bold">تعديل التقرير قبل الطباعة والتصدير</h2>
          <div className="flex gap-2">
            <button onClick={() => onSave(d)} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              حفظ التعديلات
            </button>
            <button onClick={onClose} aria-label="إغلاق" className="rounded-lg border border-input p-2 hover:bg-accent">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className={section}>
            <h3 className="font-semibold">بيانات الطالب والملخص</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم الطالب"><input className={inputCls} value={s.student_name} onChange={(e) => setSummary({ student_name: e.target.value })} /></Field>
              <Field label="العمر"><input type="number" className={inputCls} value={s.age ?? ""} onChange={(e) => setSummary({ age: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
              <Field label="نوع الإعاقة"><input className={inputCls} value={s.disability_type} onChange={(e) => setSummary({ disability_type: e.target.value })} /></Field>
              <Field label="درجة الجودة (من 100)"><input type="number" min={0} max={100} className={inputCls} value={s.quality_score_24_standards} onChange={(e) => setSummary({ quality_score_24_standards: Number(e.target.value) })} /></Field>
            </div>
          </div>

          <div className={section}>
            <h3 className="font-semibold">الهندسة الكلية للخطة</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="درجة التكامل %"><input type="number" min={0} max={100} className={inputCls} value={m.integration_score_percent} onChange={(e) => setMacro({ integration_score_percent: Number(e.target.value) })} /></Field>
              <Field label="الدور الوظيفي المستهدف"><input className={inputCls} value={m.target_functional_role} onChange={(e) => setMacro({ target_functional_role: e.target.value })} /></Field>
            </div>
            {qLabels.map(([k, l]) => (
              <Field key={k} label={l}><Area value={q[k]} onChange={(v) => setQ(k, v)} /></Field>
            ))}
            <Field label="التوصية الكلية"><Area rows={3} value={m.macro_recommendation} onChange={(v) => setMacro({ macro_recommendation: v })} /></Field>
          </div>

          <div className={section}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">الأهداف المعدلة ({d.revisions.length})</h3>
              <button
                onClick={() => setD({ ...d, revisions: [...d.revisions, { domain: IEP_DOMAINS[0], original_goal: "", revised_goal: "", revision_category: REVISION_CATEGORIES[0], rationale: "", standards_violated: [] }] })}
                className="inline-flex items-center gap-1 rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Plus className="h-4 w-4" /> إضافة هدف
              </button>
            </div>
            {d.revisions.map((r, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">الهدف {i + 1}</span>
                  <button onClick={() => setD({ ...d, revisions: d.revisions.filter((_, j) => j !== i) })} aria-label="حذف الهدف" className="rounded p-1 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="المجال">
                    <select className={inputCls} value={r.domain} onChange={(e) => setRev(i, { domain: e.target.value as typeof r.domain })}>
                      {IEP_DOMAINS.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </Field>
                  <Field label="تصنيف التعديل">
                    <select className={inputCls} value={r.revision_category} onChange={(e) => setRev(i, { revision_category: e.target.value as typeof r.revision_category })}>
                      {REVISION_CATEGORIES.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="الهدف الأصلي"><Area value={r.original_goal} onChange={(v) => setRev(i, { original_goal: v })} /></Field>
                <Field label="الهدف المعدل"><Area value={r.revised_goal} onChange={(v) => setRev(i, { revised_goal: v })} /></Field>
                <Field label="سبب التعديل"><Area value={r.rationale} onChange={(v) => setRev(i, { rationale: v })} /></Field>
                <Field label="المعايير المخالفة (افصل بفاصلة)">
                  <input className={inputCls} value={r.standards_violated.join("، ")} onChange={(e) => setRev(i, { standards_violated: e.target.value.split(/[،,]/).map((x) => x.trim()).filter(Boolean) })} />
                </Field>
              </div>
            ))}
          </div>

          <div className={section}>
            <h3 className="font-semibold">معايير الجودة الـ 24</h3>
            {cLabels.map(([k, l]) => (
              <Field key={k} label={l}><Area value={c[k]} onChange={(v) => setD({ ...d, checklist_24_standards_status: { ...c, [k]: v } })} /></Field>
            ))}
          </div>

          <div className={section}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">التوصيات</h3>
              <button onClick={() => setD({ ...d, recommendations: [...d.recommendations, ""] })} className="inline-flex items-center gap-1 rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-accent">
                <Plus className="h-4 w-4" /> إضافة توصية
              </button>
            </div>
            {d.recommendations.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="pt-2 text-sm font-semibold">{i + 1}.</span>
                <Area value={t} onChange={(v) => setD({ ...d, recommendations: d.recommendations.map((x, j) => (j === i ? v : x)) })} />
                <button onClick={() => setD({ ...d, recommendations: d.recommendations.filter((_, j) => j !== i) })} aria-label="حذف التوصية" className="mt-1 rounded p-1 text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
