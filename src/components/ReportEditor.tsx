import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import {
  COVERAGE_STATUSES,
  FINDING_STATUSES,
  GOAL_VERDICTS,
  IEP_DOMAINS,
  INVESTMENT_QUALITY,
  PLAAFP_JUDGMENTS,
  TRANSITION_COVERAGE_STATUSES,
  MEASUREMENT_TYPES,
  PLAN_JUDGMENTS,

  REVIEWER_STATUS_LABELS,
  REVIEW_DECISIONS,
  REVISION_CATEGORIES,
  SEVERITIES,
  TRANSITION_JUDGMENTS,
  type Finding,
  type IepAuditReport,
  type Revision,
} from "@/lib/iep-schema";
import { ALL_CRITERIA } from "@/lib/criteria-registry";

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

function Select<T extends string>({ value, options, onChange, labels }: { value: T; options: readonly T[]; onChange: (v: T) => void; labels?: Record<string, string> }) {
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {labels?.[o] ?? o}
        </option>
      ))}
    </select>
  );
}

function Group({ title, onAdd, children }: { title: string; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        {onAdd && (
          <button onClick={onAdd} className="inline-flex items-center gap-1 rounded-lg border border-input px-2.5 py-1 text-xs hover:bg-accent">
            <Plus className="h-3.5 w-3.5" /> إضافة
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function ReviewerToggle({ value, onChange, onDelete }: { value: Finding["reviewer_status"]; onChange: (v: Finding["reviewer_status"]) => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange("accepted")} aria-label="قبول" className={`rounded p-1 ${value === "accepted" ? "bg-primary/15 text-primary" : "hover:bg-accent"}`}>
        <Check className="h-4 w-4" />
      </button>
      <button onClick={() => onChange("rejected")} aria-label="رفض" className={`rounded p-1 ${value === "rejected" ? "bg-destructive/15 text-destructive" : "hover:bg-accent"}`}>
        <X className="h-4 w-4" />
      </button>
      <span className="px-1 text-xs text-muted-foreground">{REVIEWER_STATUS_LABELS[value]}</span>
      <button onClick={onDelete} aria-label="حذف" className="rounded p-1 text-destructive hover:bg-destructive/10">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

const newFinding = (): Finding => ({
  criterion_id: ALL_CRITERIA[0]!.id,
  status: "غير مستوفى",
  severity: "مهم",
  evidence_text: "",
  source_document: "",
  page_or_section: "",
  reasoning_summary: "",
  recommended_action: "",
  evidence_origin: "document",
  reviewer_status: "edited",
});
const newRevision = (): Revision => ({
  domain: IEP_DOMAINS[0],
  goal_number: "",
  original_goal: "",
  defect_type: "",
  criterion_affected: "",
  rationale: "",
  revised_goal: "",
  technical_rule: "",
  priority: "مهم",
  note: "",
  revision_category: REVISION_CATEGORIES[0],
  measurement_type: MEASUREMENT_TYPES[0],
  keep_assistance_wording: false,
  reviewer_status: "edited",
});

export function ReportEditor({ report, onSave, onClose }: { report: IepAuditReport; onSave: (r: IepAuditReport) => void; onClose: () => void }) {
  const [d, setD] = useState<IepAuditReport>(() => structuredClone(report));
  const set = (patch: Partial<IepAuditReport>) => setD((p) => ({ ...p, ...patch }));
  const s = d.student_info;
  const wp = d.whole_plan;

  const setFinding = (i: number, patch: Partial<Finding>) =>
    set({ criteria_results: d.criteria_results.map((f, j) => (j === i ? { ...f, reviewer_status: "edited", ...patch } : f)) });
  const setRev = (i: number, patch: Partial<Revision>) =>
    set({ revisions: d.revisions.map((r, j) => (j === i ? { ...r, reviewer_status: "edited", ...patch } : r)) });
  const setNeed = (i: number, patch: Partial<IepAuditReport["needs_coverage"][number]>) =>
    set({ needs_coverage: d.needs_coverage.map((n, j) => (j === i ? { ...n, ...patch } : n)) });
  const editList = (key: "recommendations" | "manual_notes" | "top_priorities", i: number, val: string) =>
    set({ [key]: d[key].map((t, j) => (j === i ? val : t)) } as Partial<IepAuditReport>);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 print:hidden" dir="rtl">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-bold">تعديل التقرير قبل الاعتماد والطباعة</h2>
          <button onClick={onClose} aria-label="إغلاق" className="rounded p-1 hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <Group title="بيانات الطالب">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="الاسم"><input className={inputCls} value={s.student_name} onChange={(e) => set({ student_info: { ...s, student_name: e.target.value } })} /></Field>
              <Field label="العمر"><input type="number" className={inputCls} value={s.age ?? ""} onChange={(e) => set({ student_info: { ...s, age: e.target.value === "" ? null : Number(e.target.value) } })} /></Field>
              <Field label="نوع الإعاقة"><input className={inputCls} value={s.disability_type} onChange={(e) => set({ student_info: { ...s, disability_type: e.target.value } })} /></Field>
              <Field label="المركز/المدرسة"><input className={inputCls} value={s.school_center} onChange={(e) => set({ student_info: { ...s, school_center: e.target.value } })} /></Field>
            </div>
          </Group>

          <Group title="القرار والموجز">
            <Field label="قرار المراجعة النهائي"><Select value={d.review_decision} options={REVIEW_DECISIONS} onChange={(v) => set({ review_decision: v })} /></Field>
            <Field label="الموجز التنفيذي"><Area rows={3} value={d.executive_summary} onChange={(v) => set({ executive_summary: v })} /></Field>
            <Field label="مستوى الأداء الحالي"><Area value={d.plaafp_review} onChange={(v) => set({ plaafp_review: v })} /></Field>
            <Field label="مراجعة SMART"><Area value={d.smart_review} onChange={(v) => set({ smart_review: v })} /></Field>
          </Group>

          <Group title={`نتائج المعايير (${d.criteria_results.length})`} onAdd={() => set({ criteria_results: [...d.criteria_results, newFinding()] })}>
            {d.criteria_results.map((f, i) => (
              <div key={i} className={`space-y-2 rounded-lg border p-3 ${f.reviewer_status === "rejected" ? "border-destructive/40 opacity-60" : "border-border"}`}>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-40"><Field label="المعيار"><Select value={f.criterion_id} options={ALL_CRITERIA.map((c) => c.id)} onChange={(v) => setFinding(i, { criterion_id: v })} /></Field></div>
                  <div className="w-56"><Field label="الحالة"><Select value={f.status} options={FINDING_STATUSES} onChange={(v) => setFinding(i, { status: v })} /></Field></div>
                  <div className="w-32"><Field label="الأهمية"><Select value={f.severity} options={SEVERITIES} onChange={(v) => setFinding(i, { severity: v })} /></Field></div>
                  <div className="mr-auto"><ReviewerToggle value={f.reviewer_status} onChange={(v) => setFinding(i, { reviewer_status: v })} onDelete={() => set({ criteria_results: d.criteria_results.filter((_, j) => j !== i) })} /></div>
                </div>
                <Field label="الدليل"><Area value={f.evidence_text} onChange={(v) => setFinding(i, { evidence_text: v })} /></Field>
                <Field label="التحليل"><Area value={f.reasoning_summary} onChange={(v) => setFinding(i, { reasoning_summary: v })} /></Field>
                <Field label="الإجراء المقترح"><Area value={f.recommended_action} onChange={(v) => setFinding(i, { recommended_action: v })} /></Field>
              </div>
            ))}
          </Group>

          <Group title={`مصفوفة تغطية الاحتياجات (${d.needs_coverage.length})`} onAdd={() => set({ needs_coverage: [...d.needs_coverage, { domain: IEP_DOMAINS[0], need: "", matched_goal: "", coverage_status: "غير مغطى", note: "", suggested_goal: "" }] })}>
            {d.needs_coverage.map((n, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-48"><Field label="المجال"><Select value={n.domain} options={IEP_DOMAINS} onChange={(v) => setNeed(i, { domain: v })} /></Field></div>
                  <div className="w-40"><Field label="حالة التغطية"><Select value={n.coverage_status} options={COVERAGE_STATUSES} onChange={(v) => setNeed(i, { coverage_status: v })} /></Field></div>
                  <button onClick={() => set({ needs_coverage: d.needs_coverage.filter((_, j) => j !== i) })} aria-label="حذف" className="mr-auto rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                </div>
                <Field label="الاحتياج"><Area value={n.need} onChange={(v) => setNeed(i, { need: v })} /></Field>
                <Field label="الهدف المقابل"><Area value={n.matched_goal} onChange={(v) => setNeed(i, { matched_goal: v })} /></Field>
                <Field label="الهدف المقترح"><Area value={n.suggested_goal} onChange={(v) => setNeed(i, { suggested_goal: v })} /></Field>
              </div>
            ))}
          </Group>

          <Group title="الرؤية الكلية والترابط الوظيفي">
            <Field label="الحكم النوعي"><Select value={wp.judgment} options={PLAN_JUDGMENTS} onChange={(v) => set({ whole_plan: { ...wp, judgment: v } })} /></Field>
            {([
              ["within_domain_coherence", "ترابط الأهداف داخل المجال"],
              ["cross_domain_integration", "التكامل بين المجالات"],
              ["sequential_logic", "التسلسل المنطقي"],
              ["scattered_goals", "الأهداف المشتتة"],
              ["governing_question_answer", "السؤال الحاكم"],
            ] as const).map(([k, label]) => (
              <Field key={k} label={label}><Area value={wp[k]} onChange={(v) => set({ whole_plan: { ...wp, [k]: v } })} /></Field>
            ))}
            <Field label="استثمار الروتين اليومي"><Area value={d.daily_routines.comment} onChange={(v) => set({ daily_routines: { ...d.daily_routines, comment: v } })} /></Field>
            <Field label="المهارات الشخصية والاجتماعية"><Area value={d.personal_social} onChange={(v) => set({ personal_social: v })} /></Field>
            <Field label="حكم الحد الأدنى من مفاهيم الانتقال"><Select value={d.transition_minimum.judgment} options={TRANSITION_JUDGMENTS} onChange={(v) => set({ transition_minimum: { ...d.transition_minimum, judgment: v } })} /></Field>
            <Field label="الحد الأدنى من مفاهيم الانتقال"><Area value={d.transition_minimum.answer} onChange={(v) => set({ transition_minimum: { ...d.transition_minimum, answer: v } })} /></Field>
          </Group>

          <Group title={`Before & After — الأهداف المعدلة (${d.revisions.length})`} onAdd={() => set({ revisions: [...d.revisions, newRevision()] })}>
            {d.revisions.map((r, i) => (
              <div key={i} className={`space-y-2 rounded-lg border p-3 ${r.reviewer_status === "rejected" ? "border-destructive/40 opacity-60" : "border-border"}`}>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-48"><Field label="المجال"><Select value={r.domain} options={IEP_DOMAINS} onChange={(v) => setRev(i, { domain: v })} /></Field></div>
                  <div className="w-24"><Field label="رقم الهدف"><input className={inputCls} value={r.goal_number} onChange={(e) => setRev(i, { goal_number: e.target.value })} /></Field></div>
                  <div className="w-48"><Field label="التصنيف"><Select value={r.revision_category} options={REVISION_CATEGORIES} onChange={(v) => setRev(i, { revision_category: v })} /></Field></div>
                  <div className="w-32"><Field label="الأولوية"><Select value={r.priority} options={SEVERITIES} onChange={(v) => setRev(i, { priority: v })} /></Field></div>
                  <div className="mr-auto"><ReviewerToggle value={r.reviewer_status} onChange={(v) => setRev(i, { reviewer_status: v })} onDelete={() => set({ revisions: d.revisions.filter((_, j) => j !== i) })} /></div>
                </div>
                <Field label="الهدف الأصلي"><Area value={r.original_goal} onChange={(v) => setRev(i, { original_goal: v })} /></Field>
                <Field label="الهدف المقترح"><Area value={r.revised_goal} onChange={(v) => setRev(i, { revised_goal: v })} /></Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="نوع الخلل"><Area value={r.defect_type} onChange={(v) => setRev(i, { defect_type: v })} /></Field>
                  <Field label="المعيار المتأثر"><Area value={r.criterion_affected} onChange={(v) => setRev(i, { criterion_affected: v })} /></Field>
                  <Field label="سبب التعديل"><Area value={r.rationale} onChange={(v) => setRev(i, { rationale: v })} /></Field>
                  <Field label="القاعدة الفنية"><Area value={r.technical_rule} onChange={(v) => setRev(i, { technical_rule: v })} /></Field>
                </div>
                <Field label="ملاحظة"><Area value={r.note} onChange={(v) => setRev(i, { note: v })} /></Field>
              </div>
            ))}
          </Group>

          <Group title="مراجعة مستوى الأداء الحالي">
            <Field label="الحكم"><Select value={d.plaafp_assessment.judgment} options={PLAAFP_JUDGMENTS} onChange={(v) => set({ plaafp_assessment: { ...d.plaafp_assessment, judgment: v } })} /></Field>
            {([
              ["strengths_present", "ما هو موجود بصورة جيدة (سطر لكل بند)"],
              ["needs_improvement", "ما الذي يحتاج تحسيناً"],
              ["improvement_opportunities", "فرص التحسين التنفيذية"],
              ["constrained_judgments", "الأحكام المقيدة"],
            ] as const).map(([k, label]) => (
              <Field key={k} label={label}>
                <Area rows={3} value={d.plaafp_assessment[k].join("\n")} onChange={(v) => set({ plaafp_assessment: { ...d.plaafp_assessment, [k]: v.split("\n").filter((x) => x.trim()) } })} />
              </Field>
            ))}
          </Group>

          <Group title={`نتيجة مراجعة صياغة الأهداف (${d.goal_review.goals.length})`} onAdd={() => set({ goal_review: { ...d.goal_review, goals: [...d.goal_review.goals, { goal_number: "", domain: "", goal_text: "", verdict: "سليم", issue: "" }] } })}>
            {d.goal_review.goals.map((g, i) => {
              const setG = (patch: Partial<typeof g>) => set({ goal_review: { ...d.goal_review, goals: d.goal_review.goals.map((x, j) => (j === i ? { ...x, ...patch } : x)) } });
              return (
                <div key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-2">
                  <input className={`${inputCls} w-16`} value={g.goal_number} onChange={(e) => setG({ goal_number: e.target.value })} />
                  <div className="min-w-48 flex-1"><Area value={g.goal_text} onChange={(v) => setG({ goal_text: v })} /></div>
                  <div className="w-32"><Select value={g.verdict} options={GOAL_VERDICTS} onChange={(v) => setG({ verdict: v })} /></div>
                  <div className="min-w-40 flex-1"><Area value={g.issue} onChange={(v) => setG({ issue: v })} /></div>
                  <button onClick={() => set({ goal_review: { ...d.goal_review, goals: d.goal_review.goals.filter((_, j) => j !== i) } })} aria-label="حذف" className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              );
            })}
          </Group>

          <Group title={`المواقف المستثمرة فعلياً (${d.functional_contexts.invested.length}) والفرص المحتملة (${d.functional_contexts.potential.length})`}>
            {d.functional_contexts.invested.map((c, i) => (
              <div key={`i${i}`} className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-2">
                <span className="min-w-40 flex-1 text-sm">{c.context}</span>
                <div className="w-28"><Select value={c.quality} options={INVESTMENT_QUALITY} onChange={(v) => set({ functional_contexts: { ...d.functional_contexts, invested: d.functional_contexts.invested.map((x, j) => (j === i ? { ...x, quality: v } : x)) } })} /></div>
                <button onClick={() => set({ functional_contexts: { ...d.functional_contexts, invested: d.functional_contexts.invested.filter((_, j) => j !== i) } })} aria-label="حذف" className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            {d.functional_contexts.potential.map((c, i) => (
              <div key={`p${i}`} className="flex flex-wrap items-start gap-2 rounded-lg border border-dashed border-border p-2">
                <span className="w-40 text-sm">{c.context}</span>
                <div className="min-w-48 flex-1"><Area value={c.rationale} onChange={(v) => set({ functional_contexts: { ...d.functional_contexts, potential: d.functional_contexts.potential.map((x, j) => (j === i ? { ...x, rationale: v } : x)) } })} /></div>
                <button onClick={() => set({ functional_contexts: { ...d.functional_contexts, potential: d.functional_contexts.potential.filter((_, j) => j !== i) } })} aria-label="حذف" className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </Group>

          <Group title="مصفوفة تغطية الانتقال">
            {d.transition_coverage.map((t, i) => {
              const setT = (patch: Partial<typeof t>) => set({ transition_coverage: d.transition_coverage.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
              return (
                <div key={i} className="flex flex-wrap items-start gap-2 rounded-lg border border-border p-2">
                  <span className="w-48 text-sm">{t.concept}</span>
                  <div className="w-36"><Select value={t.status} options={TRANSITION_COVERAGE_STATUSES} onChange={(v) => setT({ status: v })} /></div>
                  <div className="min-w-48 flex-1"><Area value={t.improvement} onChange={(v) => setT({ improvement: v })} /></div>
                </div>
              );
            })}
          </Group>

          {(["recommendations", "manual_notes", "top_priorities"] as const).map((key) => (
            <Group
              key={key}
              title={key === "recommendations" ? "التوصيات الإشرافية" : key === "top_priorities" ? "أهم أولويات التصحيح" : "ملاحظات المشرف اليدوية (بما فيها ملاحظات السلامة)"}
              onAdd={() => set({ [key]: [...d[key], ""] } as Partial<IepAuditReport>)}
            >
              {d[key].map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Area value={t} onChange={(v) => editList(key, i, v)} />
                  <button onClick={() => set({ [key]: d[key].filter((_, j) => j !== i) } as Partial<IepAuditReport>)} aria-label="حذف" className="rounded p-1 text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </Group>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-input px-4 py-2 text-sm hover:bg-accent">إلغاء</button>
          <button onClick={() => onSave(d)} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">حفظ التعديلات</button>
        </div>
      </div>
    </div>
  );
}

