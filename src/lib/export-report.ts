import {
  CRITERIA_REGISTRY,
  CRITERION_STATE_LABELS,
  EVIDENCE_SOURCES,
  REVIEW_TYPES,
  SOURCE_STATE_LABELS,
  criterionById,
  pillarsForReviewType,
} from "./criteria-registry";
import { REVIEWER_STATUS_LABELS, reviewedKeys, type IepAuditReport } from "./iep-schema";
import { arabicSectionRefs, goalReviewCounts, transitionStats } from "./iep-parity";
import { checkReportConsistency } from "./consistency-check";
import { POTENTIAL_CONTEXT_STATUS } from "./functional-context-registry";

export const REPORT_SECTION_OPTIONS = [
  { id: "summary", label: "بيانات الطالب" },
  { id: "scope", label: "نطاق المراجعة ومصادر الأدلة" },
  { id: "criteria_config", label: "المعايير المفعلة والمجمدة" },
  { id: "decision_brief", label: "الموجز التنفيذي المحدّث (موجز القرار)" },
  { id: "executive", label: "الموجز التنفيذي" },
  { id: "decision", label: "قرار المراجعة" },
  { id: "consistency", label: "تنبيهات اتساق للمشرف" },
  { id: "gates", label: "البوابات الحرجة" },
  { id: "standards", label: "معايير الجودة" },
  { id: "plaafp", label: "مستوى الأداء الحالي" },
  { id: "plaafp_assessment", label: "مراجعة مستوى الأداء الحالي" },
  { id: "smart", label: "مراجعة SMART" },
  { id: "mapping", label: "مصفوفة تغطية الاحتياجات" },
  { id: "whole_plan", label: "الرؤية الكلية والترابط الوظيفي" },
  { id: "routines", label: "استثمار الروتين اليومي" },
  { id: "invested_contexts", label: "استثمار المواقف الفعلية" },
  { id: "potential_contexts", label: "الفرص الوظيفية المحتملة" },
  { id: "personal_social", label: "المهارات الشخصية والاجتماعية" },
  { id: "transition_min", label: "الحد الأدنى من مفاهيم الانتقال" },
  { id: "transition_goals", label: "الأهداف الانتقالية الموجودة" },
  { id: "transition_matrix", label: "مصفوفة تغطية الانتقال" },
  { id: "transition_improvements", label: "فرص تحسين التغطية الانتقالية" },
  { id: "vertical", label: "المواءمة الرأسية (خطة سابقة)" },
  { id: "goal_review", label: "نتيجة مراجعة صياغة الأهداف" },
  { id: "before_after", label: "Before & After" },
  { id: "recommendations", label: "التوصيات الإشرافية" },
  { id: "manual_notes", label: "ملاحظات المشرف اليدوية" },
] as const;

export type ReportSectionId = (typeof REPORT_SECTION_OPTIONS)[number]["id"];
export type ReportSections = Record<ReportSectionId, boolean>;

export const DEFAULT_REPORT_SECTIONS: ReportSections = Object.fromEntries(
  REPORT_SECTION_OPTIONS.map(({ id }) => [id, true]),
) as ReportSections;

export type ReportBlock = {
  id: ReportSectionId;
  title: string;
  lines: string[];
  table?: { head: string[]; rows: string[][] } | undefined;
  /** يوجد على أول قسم ظاهر في كل فصل (M-8) */
  chapter?: { n: number; title: string; bridge: string } | undefined;
};

/** M-8: الفصول الثمانية — ترتيب منطقي بلا حذف أو اختصار لأي قسم */
export const REPORT_CHAPTERS: { title: string; ids: ReportSectionId[] }[] = [
  { title: "التعريف ونطاق المراجعة", ids: ["summary", "scope", "criteria_config"] },
  { title: "الخلاصة والقرار", ids: ["decision_brief", "executive", "decision", "gates", "consistency"] },
  { title: "الأساس: مستوى الأداء الحالي", ids: ["plaafp", "plaafp_assessment"] },
  { title: "من الاحتياج إلى الهدف", ids: ["mapping"] },
  { title: "الأهداف", ids: ["smart", "goal_review", "before_after"] },
  { title: "الخطة ككل", ids: ["whole_plan", "vertical", "routines", "invested_contexts", "potential_contexts", "personal_social"] },
  { title: "الانتقال", ids: ["transition_min", "transition_goals", "transition_matrix", "transition_improvements"] },
  { title: "التحقق والإجراءات", ids: ["standards", "recommendations", "manual_notes"] },
];

const titleOf = (id: ReportSectionId) => REPORT_SECTION_OPTIONS.find((o) => o.id === id)!.label;
const v = (t: string | null | undefined, fallback = "—") => (t && t.trim() ? t : fallback);

/**
 * المصدر الموحد لمحتوى التقرير — تعرضه الواجهة والطباعة وWord، وتُصفّى به JSON.
 * الأقسام الفارغة (غير المنفذة في نطاق المراجعة) لا تُنتج كتلاً.
 */
export function buildReportBlocks(report: IepAuditReport, sections: ReportSections = DEFAULT_REPORT_SECTIONS): ReportBlock[] {
  const cfg = report.review_config;
  const s = report.student_info;
  const pillars = new Set(pillarsForReviewType(cfg.review_type));
  const ran = reviewedKeys(report);
  const gc = goalReviewCounts(report);
  const ts = transitionStats(report);
  const fc = report.functional_contexts;
  const pa = report.plaafp_assessment;
  const blocks: ReportBlock[] = [];
  const push = (b: ReportBlock) => {
    if ((sections[b.id] ?? true) && (b.lines.some((l) => l.trim()) || (b.table && b.table.rows.length))) blocks.push(b);
  };

  push({
    id: "summary",
    title: titleOf("summary"),
    lines: [`الاسم: ${v(s.student_name)} — العمر: ${s.age ?? "غير محدد"} — نوع الإعاقة: ${v(s.disability_type)} — المركز/المدرسة: ${v(s.school_center, "غير محدد")}`],
  });
  push({
    id: "scope",
    title: titleOf("scope"),
    lines: [`نوع المراجعة: ${REVIEW_TYPES.find((t) => t.id === cfg.review_type)?.label ?? cfg.review_type}`],
    table: { head: ["المصدر", "الحالة"], rows: EVIDENCE_SOURCES.map((x) => [x.label, SOURCE_STATE_LABELS[cfg.sources[x.id]]]) },
  });
  // M-2: الجدول يعرض معايير نطاق المراجعة فقط، وما خارجه يُختصر في سطر واحد
  const cfgRows: string[][] = [];
  const outOfScope: string[] = [];
  for (const p of CRITERIA_REGISTRY) {
    if (pillars.has(p.id)) {
      for (const c of p.criteria) {
        const st = cfg.criteria[c.id]?.state ?? "active";
        cfgRows.push([c.id, c.label, CRITERION_STATE_LABELS[st], cfg.criteria[c.id]?.reason ?? ""]);
      }
    } else {
      const note = p.id === "P2" && ran.has("goal_review") ? " — الأهداف مراجعة إشرافياً" : "";
      outOfScope.push(`${p.id} (${p.criteria.length} معايير)${note}`);
    }
  }
  const notVerifiable = report.criteria_results.filter((f) => f.status === "غير قابل للتحقق من الوثيقة المقدمة").map((f) => f.criterion_id);
  push({
    id: "criteria_config",
    title: titleOf("criteria_config"),
    lines: [
      outOfScope.length ? `خارج نطاق هذا النوع من المراجعة: ${outOfScope.join("، ")}.` : "",
      notVerifiable.length ? `معايير غير قابلة للتحقق من الوثيقة المقدمة: ${notVerifiable.join("، ")}` : "",
    ],
    table: { head: ["الرقم", "المعيار", "الحالة", "سبب التجميد"], rows: cfgRows },
  });
  const brief: string[] = [];
  if (ran.has("goal_review"))
    brief.push(`تمت مراجعة ${gc.reviewed} هدفاً: ${gc.sound} سليمة، ${gc.needs} تحتاج تعديلاً، ${gc.unclear} تعذر الحكم عليها.`, gc.statement);
  if (ran.has("plaafp_assessment")) brief.push(`حكم مستوى الأداء الحالي: ${pa.judgment}.`);
  if (ran.has("whole_plan")) brief.push(`المسارات الوظيفية المكتشفة: ${report.whole_plan.functional_clusters.length} — الحكم النوعي للترابط: ${report.whole_plan.judgment}.`);
  if (ran.has("functional_contexts")) brief.push(`المواقف المستثمرة فعلياً: ${fc.invested.length} — الفرص الوظيفية المحتملة: ${fc.potential.length}.`);
  if (ran.has("transition_coverage") && report.transition_coverage.length)
    brief.push(`تغطية الانتقال: مغطى كلياً ${ts.covered}، مغطى جزئياً ${ts.partial}، غير مغطى ${ts.uncovered}، غير قابل للتحقق ${ts.unverifiable}، لا ينطبق ${ts.na}.`, ts.label);
  if (report.top_priorities.length) brief.push("أهم أولويات التصحيح:", ...report.top_priorities.slice(0, 3).map((t, i) => `${i + 1}. ${arabicSectionRefs(t)}`));
  push({ id: "decision_brief", title: titleOf("decision_brief"), lines: brief });
  push({ id: "executive", title: titleOf("executive"), lines: [report.executive_summary] });
  push({ id: "decision", title: titleOf("decision"), lines: [`قرار المراجعة: ${report.review_decision}`] });
  const alerts = checkReportConsistency(report);
  push({
    id: "consistency",
    title: titleOf("consistency"),
    lines: alerts.length ? ["تنبيهات آلية لا تغيّر القرار — القرار الأخير للمشرف."] : [],
    table: alerts.length ? { head: ["الموضع", "التنبيه"], rows: alerts.map((a) => [a.scope, a.message]) } : undefined,
  });
  push({
    id: "gates",
    title: titleOf("gates"),
    lines: report.critical_gates.length ? [] : ["لم تُرصد بوابات حرجة."],
    table: report.critical_gates.length
      ? { head: ["البوابة", "الوصف", "الدليل"], rows: report.critical_gates.map((g) => [g.gate, g.description, v(g.evidence_text)]) }
      : undefined,
  });
  push({
    id: "standards",
    title: titleOf("standards"),
    lines: [],
    table: {
      head: ["المعيار", "الحالة", "نوع الملاحظة", "الأهمية", "الدليل", "التحليل", "الإجراء المقترح", "مصدر الدليل", "حالة المراجع"],
      rows: report.criteria_results.map((f) => [
        `${f.criterion_id} ${criterionById(f.criterion_id)?.label ?? ""}`,
        f.status,
        f.status === "غير قابل للتحقق من الوثيقة المقدمة" || f.evidence_origin === "unavailable"
          ? "ملاحظة مقيدة بنقص البيانات"
          : f.evidence_origin === "external_reviewer_attestation"
            ? "متحقق بتأكيد المراجع"
            : "ملاحظة مؤكدة من المستند",
        f.severity,
        [v(f.evidence_text), f.page_or_section].filter(Boolean).join(" — "),
        f.reasoning_summary,
        v(f.recommended_action),
        f.evidence_origin === "document" ? `الوثيقة${f.source_document ? `: ${f.source_document}` : ""}` : f.evidence_origin === "external_reviewer_attestation" ? "تأكيد المراجع" : "غير متوفر",
        REVIEWER_STATUS_LABELS[f.reviewer_status],
      ]),
    },
  });
  push({ id: "plaafp", title: titleOf("plaafp"), lines: [report.plaafp_review] });
  if (ran.has("plaafp_assessment"))
    push({
      id: "plaafp_assessment",
      title: titleOf("plaafp_assessment"),
      lines: [
        `الحكم: ${pa.judgment}`,
        ...pa.constrained_judgments.map((c) => `قيد: ${c}`),
        pa.strengths_present.length ? "أ. ما هو موجود بصورة جيدة:" : "",
        ...pa.strengths_present.map((t) => `• ${t}`),
        pa.needs_improvement.length ? "ب. ما الذي يحتاج تحسيناً:" : "",
        ...pa.needs_improvement.map((t) => `• ${t}`),
        pa.improvement_opportunities.length ? "ج. أهم فرص التحسين التنفيذية:" : "",
        ...pa.improvement_opportunities.map((t, i) => `${i + 1}. ${t}`),
      ],
      table: {
        head: ["السؤال", "الإجابة"],
        rows: (
          [
            ["هل يصف ما يفعله المتعلم الآن؟", pa.describes_current_performance],
            ["هل تظهر الفجوة التعليمية؟", pa.gap_visible],
            ["هل توجد نقطة مقارنة/Baseline؟", pa.baseline_present],
            ["هل نقاط القوة والاحتياجات متميزة؟", pa.strengths_needs_distinct],
            ["هل المعلومات كافية لاختيار الخطوة التالية؟", pa.sufficient_for_next_step],
            ["مهارات قوة تعود أهدافاً دون خطوة تقدم؟", pa.mastered_retargeted],
          ] as string[][]
        ).filter((r) => r[1]!.trim()),
      },
    });
  push({ id: "smart", title: titleOf("smart"), lines: [report.smart_review] });
  push({
    id: "mapping",
    title: titleOf("mapping"),
    lines: [],
    table: {
      head: ["المجال", "الاحتياج", "الهدف المقابل", "حالة التغطية", "ملاحظة", "الهدف المقترح"],
      rows: report.needs_coverage.map((n) => [n.domain, n.need, v(n.matched_goal), n.coverage_status, v(n.note), v(n.suggested_goal)]),
    },
  });
  const wp = report.whole_plan;
  push({
    id: "whole_plan",
    title: titleOf("whole_plan"),
    lines: wp.within_domain_coherence || wp.cross_domain_integration
      ? [
          `الحكم النوعي: ${wp.judgment}`,
          `ترابط الأهداف داخل المجال: ${wp.within_domain_coherence}`,
          `التكامل بين المجالات: ${wp.cross_domain_integration}`,
          `التسلسل المنطقي: ${wp.sequential_logic}`,
          `الأهداف المشتتة: ${wp.scattered_goals}`,
          `السؤال الحاكم: ${wp.governing_question_answer}`,
        ]
      : [],
    table: wp.functional_clusters.length
      ? { head: ["الدور/المهمة الوظيفية", "الأهداف المترابطة"], rows: wp.functional_clusters.map((c) => [c.role, c.goals.join(" ← ")]) }
      : undefined,
  });
  push({
    id: "routines",
    title: titleOf("routines"),
    lines: [report.daily_routines.comment],
    table: report.daily_routines.opportunities.length
      ? { head: ["الموقف اليومي", "الفرصة الوظيفية", "الدليل"], rows: report.daily_routines.opportunities.map((o) => [o.routine, o.opportunity, v(o.evidence_text)]) }
      : undefined,
  });
  if (ran.has("functional_contexts")) {
    push({
      id: "invested_contexts",
      title: titleOf("invested_contexts"),
      lines: fc.invested.length ? [] : ["لم يُرصد في الوثيقة موقف وظيفي مستثمر بدليل صريح."],
      table: fc.invested.length
        ? { head: ["الموقف", "الأهداف المستخدمة", "كيف استُثمر", "جودة الاستثمار", "الدليل"], rows: fc.invested.map((i) => [i.context, i.goals.join("، "), i.how, i.quality, v(i.evidence_text)]) }
        : undefined,
    });
    push({
      id: "potential_contexts",
      title: titleOf("potential_contexts"),
      lines: fc.potential.length ? ["مرجع إشرافي من بنك الأنشطة — لا يعني أن النشاط موجود، ولا يولّد أهدافاً."] : [],
      table: fc.potential.length
        ? { head: ["النشاط/الموقف", "لماذا قد يكون مناسباً", "الأهداف القابلة للدمج", "الحالة"], rows: fc.potential.map((p) => [p.context, p.rationale, v(p.integrable_goals.join("، ")), POTENTIAL_CONTEXT_STATUS]) }
        : undefined,
    });
  }
  push({ id: "personal_social", title: titleOf("personal_social"), lines: [report.personal_social] });
  const tm = report.transition_minimum;
  push({
    id: "transition_min",
    title: titleOf("transition_min"),
    lines: tm.answer ? [`الحكم: ${tm.judgment}`, tm.answer, ...tm.integrated_pathways.map((p) => `مسار انتقالي متكامل: ${p}`)] : [],
  });
  push({
    id: "transition_goals",
    title: titleOf("transition_goals"),
    lines: [],
    table: { head: ["المجال", "الهدف", "مفهوم الانتقال", "ملاحظة"], rows: tm.goals.map((g) => [g.domain, g.goal, g.concept, v(g.note)]) },
  });
  if (report.transition_coverage.length) {
    push({
      id: "transition_matrix",
      title: titleOf("transition_matrix"),
      lines: [`مغطى بالكامل: ${ts.covered} — مغطى جزئياً: ${ts.partial} — غير مغطى: ${ts.uncovered} — غير قابل للتحقق: ${ts.unverifiable} — لا ينطبق: ${ts.na}`, ts.label],
      table: { head: ["مفهوم الانتقال", "الحالة", "الأهداف الداعمة", "ملاحظة", "فرصة تحسين"], rows: report.transition_coverage.map((t) => [t.concept, t.status, v(t.supporting_goals.join("، ")), v(t.note), v(t.improvement)]) },
    });
    const imp = report.transition_coverage.filter((t) => t.improvement.trim());
    push({
      id: "transition_improvements",
      title: titleOf("transition_improvements"),
      lines: imp.length ? ["فرص تطوير إشرافية للمسار — وليست أهدافاً نهائية جاهزة.", ...imp.map((t) => `• ${t.concept} (${t.status}): ${t.improvement}`)] : [],
    });
  }
  const va = report.vertical_alignment;
  push({
    id: "vertical",
    title: titleOf("vertical"),
    lines: va.available ? [va.comment] : [],
    table: va.available && va.items.length
      ? { head: ["الهدف السابق", "مستوى التقدم", "الهدف الحالي", "الخطوة الوظيفية الأكبر", "ملاحظة"], rows: va.items.map((i) => [i.previous_goal, v(i.progress), i.current_goal, i.next_step, v(i.note)]) }
      : undefined,
  });
  if (ran.has("goal_review"))
    push({
      id: "goal_review",
      title: titleOf("goal_review"),
      lines: [
        gc.statement,
        `الأهداف التي تمت مراجعتها: ${gc.reviewed} — السليمة صياغياً: ${gc.sound} — تحتاج تعديلاً: ${gc.needs} — تعذر الحكم عليها: ${gc.unclear}`,
        report.goal_review.recurring_patterns.length ? `أهم أنماط التعديل المتكررة: ${report.goal_review.recurring_patterns.join("؛ ")}` : "",
      ],
      table: gc.needs + gc.unclear
        ? {
            head: ["رقم الهدف", "المجال", "الهدف", "الحكم", "الملاحظة"],
            rows: report.goal_review.goals.filter((g) => g.verdict !== "سليم").map((g) => [v(g.goal_number), v(g.domain), g.goal_text, g.verdict, v(g.issue)]),
          }
        : undefined,
    });
  const revs = report.revisions.filter((r) => r.reviewer_status !== "rejected");
  push({
    id: "before_after",
    title: titleOf("before_after"),
    lines: [],
    table: {
      head: ["المجال", "رقم الهدف", "الهدف الأصلي", "نوع الخلل", "المعيار المتأثر", "سبب التعديل", "الهدف المقترح", "القاعدة الفنية", "التصنيف", "الأولوية", "ملاحظة"],
      rows: revs.map((r) => [r.domain, v(r.goal_number), r.original_goal, r.defect_type, r.criterion_affected, r.rationale, r.revised_goal, r.technical_rule, r.revision_category, r.priority, v(r.note)]),
    },
  });
  push({ id: "recommendations", title: titleOf("recommendations"), lines: report.recommendations.map((t, i) => `${i + 1}. ${t}`) });
  push({ id: "manual_notes", title: titleOf("manual_notes"), lines: report.manual_notes.map((t, i) => `${i + 1}. ${t}`) });
  return arrangeChapters(blocks, chapterBridges(report));
}

/** جمل الربط بين الفصول — محسوبة من نتائج التقرير لا من نص النموذج */
function chapterBridges(report: IepAuditReport): string[] {
  const gc = goalReviewCounts(report);
  const ts = transitionStats(report);
  const pa = report.plaafp_assessment.judgment;
  const needs = report.needs_coverage;
  const nc = (st: string) => needs.filter((n) => n.coverage_status === st).length;
  const inv = report.plan_inventory?.goals?.length ?? 0;
  return [
    `ما الذي رُوجع، ومن أي مصادر، وبأي معايير.`,
    `الحكم العام على الخطة: ${report.review_decision}${report.critical_gates.length ? `، مع ${report.critical_gates.length} بوابة حرجة` : ""}. الفصول التالية تعرض الأساس الذي بُني عليه هذا الحكم.`,
    `كل أهداف الخطة تُبنى على وصف الأداء الحالي، وحكمه في هذه المراجعة: ${pa}.`,
    needs.length
      ? `من ${needs.length} احتياجاً مصرحاً به: مغطى ${nc("مغطى")}، جزئياً ${nc("مغطى جزئياً")}، غير مغطى ${nc("غير مغطى")}.`
      : `مطابقة الاحتياجات المصرح بها في مستوى الأداء الحالي مع أهداف الخطة.`,
    gc.reviewed
      ? `${inv ? `حُصر في الخطة ${inv} هدفاً. ` : ""}من ${gc.reviewed} هدفاً مراجَعاً: ${gc.sound} سليمة، ${gc.needs} تحتاج تعديلاً، ${gc.unclear} تعذر الحكم عليها.`
      : `مراجعة صياغة الأهداف وجودتها.`,
    `بعد الأهداف منفردةً: هل تعمل الخطة كوحدة واحدة في يوم المتعلم وحياته؟ حكم الترابط: ${report.whole_plan.judgment}.`,
    report.transition_coverage.length
      ? `إلى أين تقود الخطة المتعلم: الحد الأدنى من مفاهيم الانتقال ${report.transition_minimum.judgment}؛ ${ts.label}.`
      : `إلى أين تقود الخطة المتعلم بعد المرحلة الحالية.`,
    `الأدلة التفصيلية للمعايير، ثم ما يجب فعله.`,
  ];
}

function arrangeChapters(blocks: ReportBlock[], bridges: string[]): ReportBlock[] {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const out: ReportBlock[] = [];
  REPORT_CHAPTERS.forEach((c, i) => {
    const present = c.ids.map((id) => byId.get(id)).filter((b): b is ReportBlock => !!b);
    present.forEach((b, j) => out.push(j === 0 ? { ...b, chapter: { n: i + 1, title: c.title, bridge: bridges[i] ?? "" } } : b));
  });
  // أي قسم غير مدرج في فصل يبقى في النهاية بدل أن يضيع
  for (const b of blocks) if (!out.includes(b) && !out.some((x) => x.id === b.id)) out.push(b);
  return out;
}

const fileBase = (r: IepAuditReport) => `iep-audit-${(r.student_info.student_name || "iep").replace(/\s+/g, "_")}`;

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** مفاتيح JSON لكل قسم — نفس عقد الأقسام */
const JSON_KEYS: Record<ReportSectionId, (keyof IepAuditReport)[]> = {
  summary: ["student_info"],
  scope: ["review_config"],
  criteria_config: ["review_config"],
  decision_brief: ["top_priorities"],
  executive: ["executive_summary"],
  decision: ["review_decision"],
  consistency: [],
  gates: ["critical_gates"],
  standards: ["criteria_results"],
  plaafp: ["plaafp_review"],
  plaafp_assessment: ["plaafp_assessment"],
  smart: ["smart_review"],
  mapping: ["needs_coverage"],
  whole_plan: ["whole_plan"],
  routines: ["daily_routines"],
  invested_contexts: ["functional_contexts"],
  potential_contexts: ["functional_contexts"],
  personal_social: ["personal_social"],
  transition_min: ["transition_minimum"],
  transition_goals: ["transition_minimum"],
  transition_matrix: ["transition_coverage"],
  transition_improvements: ["transition_coverage"],
  vertical: ["vertical_alignment"],
  goal_review: ["goal_review"],
  before_after: ["revisions"],
  recommendations: ["recommendations"],
  manual_notes: ["manual_notes"],
};

export function selectJson(report: IepAuditReport, sections: ReportSections) {
  const out: Record<string, unknown> = { schema_version: report.schema_version };
  for (const { id } of REPORT_SECTION_OPTIONS) {
    if (!sections[id]) continue;
    for (const k of JSON_KEYS[id]) out[k] = report[k];
  }
  const fcs = report.functional_contexts;
  if (sections.invested_contexts !== sections.potential_contexts && out["functional_contexts"])
    out["functional_contexts"] = sections.invested_contexts ? { invested: fcs.invested } : { potential: fcs.potential };
  if (sections.consistency ?? true) out["consistency_alerts"] = checkReportConsistency(report);
  if (sections.decision_brief) {
    out["decision_brief"] = { goals: goalReviewCounts(report), plaafp_judgment: report.plaafp_assessment.judgment, transition: transitionStats(report) };
  }
  return out;
}

export function exportJson(data: { report: IepAuditReport; parity?: unknown }, report: IepAuditReport, sections: ReportSections) {
  const body = { report: selectJson(report, sections), ...(data.parity ? { parity: data.parity } : {}) };
  download(new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }), `${fileBase(report)}.json`);
}

/** PDF via the browser print dialog — keeps Arabic RTL shaping intact. */
export function exportPdf() {
  window.print();
}

export async function exportDocx(report: IepAuditReport, sections: ReportSections) {
  const d = await import("docx");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType } = d;
  const p = (text: string, opts: { bold?: boolean; heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel] } = {}) =>
    new Paragraph({
      bidirectional: true,
      alignment: AlignmentType.RIGHT,
      ...(opts.heading ? { heading: opts.heading } : {}),
      children: [new TextRun({ text, bold: !!opts.bold, rightToLeft: true, font: "Arial" })],
    });
  const cell = (text: string, bold = false) => new TableCell({ children: [p(text, { bold })] });

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    p("تقرير المراجعة الإشرافية الأولية للخطة التربوية الفردية", { heading: HeadingLevel.TITLE }),
  ];
  for (const b of buildReportBlocks(report, sections)) {
    if (b.chapter) {
      children.push(p(`الفصل ${b.chapter.n}: ${b.chapter.title}`, { heading: HeadingLevel.HEADING_1 }));
      if (b.chapter.bridge) children.push(p(b.chapter.bridge, { bold: true }));
    }
    children.push(p(b.title, { heading: HeadingLevel.HEADING_2 }));
    for (const l of b.lines) if (l.trim()) children.push(p(l));
    if (b.table && b.table.rows.length) {
      children.push(
        new Table({
          visuallyRightToLeft: true,
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: b.table.head.map((h) => cell(h, true)) }),
            ...b.table.rows.map((r) => new TableRow({ children: r.map((t) => cell(t)) })),
          ],
        }),
      );
    }
  }
  const doc = new Document({ sections: [{ children }] });
  download(await Packer.toBlob(doc), `${fileBase(report)}.docx`);
}
