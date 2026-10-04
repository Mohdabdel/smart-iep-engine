import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  ACCREDITATION_DECISIONS,
  IEP_DOMAINS,
  PILLAR_MAX_SCORES,
  REVISION_CATEGORIES,
  type IepAuditReport,
} from "@/lib/iep-schema";
import { PILLAR_LABELS } from "@/lib/export-report";

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
  const s = d.student_info;
  const l1 = d.level1_quality_standards;
  const vision = d.level2_supervisory_review.overall_vision;
  const coverage = d.level2_supervisory_review.needs_coverage;

  const setStudent = (patch: Partial<typeof s>) => setD({ ...d, student_info: { ...s, ...patch } });
  const setL1 = (patch: Partial<typeof l1>) => setD({ ...d, level1_quality_standards: { ...l1, ...patch } });
  const setPillar = (key: keyof typeof PILLAR_MAX_SCORES, patch: Partial<(typeof l1)[typeof key]>) =>
    setL1({ [key]: { ...l1[key], ...patch } } as Partial<typeof l1>);
  const setVision = (k: keyof typeof vision, v: string) =>
    setD({ ...d, level2_supervisory_review: { ...d.level2_supervisory_review, overall_vision: { ...vision, [k]: v } } });
  const setCoverage = (patch: Partial<typeof coverage>) =>
    setD({ ...d, level2_supervisory_review: { ...d.level2_supervisory_review, needs_coverage: { ...coverage, ...patch } } });
  const setRev = (i: number, patch: Partial<IepAuditReport["revisions"][number]>) =>
    setD({ ...d, revisions: d.revisions.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const visionLabels: [keyof typeof vision, string][] = [
    ["horizontal_bundling", "الترابط الأفقي وسلاسل التعلم"],
    ["cross_domain_integration", "التكامل بين الأهداف والمجالات"],
    ["sequential_logic", "التسلسل المنطقي لمسار التدريب"],
    ["scattered_goals", "رصد الأهداف المشتتة"],
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
            <h3 className="font-semibold">بيانات الطالب</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="اسم الطالب"><input className={inputCls} value={s.student_name} onChange={(e) => setStudent({ student_name: e.target.value })} /></Field>
              <Field label="العمر"><input type="number" className={inputCls} value={s.age ?? ""} onChange={(e) => setStudent({ age: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
              <Field label="نوع الإعاقة"><input className={inputCls} value={s.disability_type} onChange={(e) => setStudent({ disability_type: e.target.value })} /></Field>
              <Field label="المركز / المدرسة"><input className={inputCls} value={s.school_center} onChange={(e) => setStudent({ school_center: e.target.value })} /></Field>
            </div>
          </div>

          <div className={section}>
            <h3 className="font-semibold">المستوى الأول — التقييم الرقمي للبنود الفعّالة (19)</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="النتيجة الإجمالية (من 19)"><input type="number" min={0} max={19} className={inputCls} value={l1.total_score} onChange={(e) => setL1({ total_score: Number(e.target.value) })} /></Field>
              <Field label="نسبة الاتساق %"><input type="number" min={0} max={100} className={inputCls} value={l1.compliance_percent} onChange={(e) => setL1({ compliance_percent: Number(e.target.value) })} /></Field>
              <Field label="قرار الاعتماد">
                <select className={inputCls} value={l1.accreditation_decision} onChange={(e) => setL1({ accreditation_decision: e.target.value as typeof l1.accreditation_decision })}>
                  {ACCREDITATION_DECISIONS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
            </div>
            {PILLAR_LABELS.map(({ key, label }) => (
              <div key={key} className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-sm font-semibold">{label}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label={`الدرجة (من ${PILLAR_MAX_SCORES[key]})`}>
                    <input type="number" min={0} max={PILLAR_MAX_SCORES[key]} className={inputCls} value={l1[key].score} onChange={(e) => setPillar(key, { score: Number(e.target.value) })} />
                  </Field>
                  <Field label="النسبة %">
                    <input type="number" min={0} max={100} className={inputCls} value={l1[key].percent} onChange={(e) => setPillar(key, { percent: Number(e.target.value) })} />
                  </Field>
                </div>
                <Field label="التعليق المختصر"><Area value={l1[key].comment} onChange={(v) => setPillar(key, { comment: v })} /></Field>
              </div>
            ))}
          </div>

          <div className={section}>
            <h3 className="font-semibold">المستوى الثاني — الرؤية العامة للخطة</h3>
            {visionLabels.map(([k, l]) => (
              <Field key={k} label={l}><Area value={vision[k]} onChange={(v) => setVision(k, v)} /></Field>
            ))}
          </div>

          <div className={section}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">مصفوفة تغطية الاحتياجات</h3>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={coverage.all_covered} onChange={(e) => setCoverage({ all_covered: e.target.checked })} />
                جميع الاحتياجات مغطاة
              </label>
            </div>
            {coverage.uncovered_needs.map((n, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">احتياج غير مغطى {i + 1}</span>
                  <button onClick={() => setCoverage({ uncovered_needs: coverage.uncovered_needs.filter((_, j) => j !== i) })} aria-label="حذف الاحتياج" className="rounded p-1 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <Field label="المجال">
                  <select className={inputCls} value={n.domain} onChange={(e) => setCoverage({ uncovered_needs: coverage.uncovered_needs.map((x, j) => (j === i ? { ...x, domain: e.target.value as typeof x.domain } : x)) })}>
                    {IEP_DOMAINS.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </Field>
                <Field label="الاحتياج"><Area value={n.need} onChange={(v) => setCoverage({ uncovered_needs: coverage.uncovered_needs.map((x, j) => (j === i ? { ...x, need: v } : x)) })} /></Field>
                <Field label="الهدف المقترح"><Area value={n.suggested_goal} onChange={(v) => setCoverage({ uncovered_needs: coverage.uncovered_needs.map((x, j) => (j === i ? { ...x, suggested_goal: v } : x)) })} /></Field>
              </div>
            ))}
            <button
              onClick={() => setCoverage({ uncovered_needs: [...coverage.uncovered_needs, { need: "", domain: IEP_DOMAINS[0], suggested_goal: "" }] })}
              className="inline-flex items-center gap-1 rounded-lg border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              <Plus className="h-4 w-4" /> إضافة احتياج
            </button>
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
                <Field label="سبب التعديل والقاعدة الفنية"><Area value={r.rationale} onChange={(v) => setRev(i, { rationale: v })} /></Field>
                <Field label="المعايير المخالفة (افصل بفاصلة)">
                  <input className={inputCls} value={r.standards_violated.join("، ")} onChange={(e) => setRev(i, { standards_violated: e.target.value.split(/[،,]/).map((x) => x.trim()).filter(Boolean) })} />
                </Field>
              </div>
            ))}
          </div>

          <div className={section}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">التوصيات الإشرافية</h3>
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
