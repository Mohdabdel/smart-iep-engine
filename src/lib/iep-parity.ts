import { activeCriteria, criterionById, type ReviewConfig } from "./criteria-registry";
import { IMPLIED_WORDS, TRANSITION_CONCEPTS, type IepAuditReport } from "./iep-schema";
import { POTENTIAL_CONTEXT_STATUS, contextById } from "./functional-context-registry";

export const NO_GOAL_REVISIONS_TEXT = "لم تُرصد أهداف تحتاج تعديلًا في الصياغة وفق المواصفة المعتمدة.";
export const SEPARATION_CONSTRAINT_TEXT = "تعذر فصل نقاط القوة عن الاحتياجات من الوثيقة: أحكام تغطية الاحتياج ← الهدف وخط الأساس مقيدة، وبقية المراجعة مستمرة.";

export const EXTERNAL_ATTESTATION_TEXT = "متحقق خارج الوثيقة الحالية بتأكيد المراجع";
export const DATA_REQUIRED_TEXT = "متطلب تصحيح / بيانات إضافية مطلوبة";
const SAFETY_RE = /سلامة|السلامة|الأمن والسلامة|خطر|مخاطر/;

export type ParityStats = {
  impliedWordsStripped: number;
  singleCriterionFixes: number;
  outOfScopeFindingsRemoved: number;
  externalAttestationsApplied: number;
  safetyItemsRemoved: number;
  decisionAdjusted: boolean;
};

export function stripImpliedWords(text: string) {
  let out = text;
  let n = 0;
  for (const w of IMPLIED_WORDS) {
    while (out.includes(w)) {
      out = out.replace(w, "");
      n += 1;
    }
  }
  return { text: out.replace(/\s{2,}/g, " ").trim(), count: n };
}

/** منع دمج نسبة مئوية مع عدد محاولات/جلسات في هدف واحد */
export function enforceSingleCriterion(text: string) {
  if (!/\d+\s*(?:٪|%)/.test(text)) return { text, fixed: false };
  const single = text.replace(
    /(\d+\s*(?:٪|%)[^،.؛]{0,40}?)\s*(?:و)?\s*(?:في|خلال)\s+\d+\s+(?:(?:محاولات?|جلسات?|فرص?)|من\s+(?:أصل)?\s*\d+\s*(?:محاولات?|جلسات?|فرص?))(?:\s+متتالية)?(?:\s+من\s+(?:أصل)?\s*\d+(?:\s+(?:محاولات?|جلسات?|فرص?))?)?/g,
    "$1",
  );
  return { text: single.replace(/\s{2,}/g, " ").trim(), fixed: single !== text };
}

/**
 * الفرض الكودي بعد التوليد — قرارات حتمية لا تُترك للنموذج.
 * لا يحذف «عندما يطلب منه ذلك» ولا أي ظرف أداء: لا مطابقة كلمات على ظروف الأداء.
 */
export function applyReviewerParity(report: IepAuditReport, config: ReviewConfig = report.review_config) {
  const stats: ParityStats = {
    impliedWordsStripped: 0,
    singleCriterionFixes: 0,
    outOfScopeFindingsRemoved: 0,
    externalAttestationsApplied: 0,
    safetyItemsRemoved: 0,
    decisionAdjusted: false,
  };
  const active = new Set(activeCriteria(config).map((c) => c.id));

  // 1) المعايير المجمدة/غير المنطبقة/خارج النطاق لا تؤثر في الحكم
  const inScope = report.criteria_results.filter((f) => active.has(f.criterion_id));
  stats.outOfScopeFindingsRemoved = report.criteria_results.length - inScope.length;

  // 2) الأدلة المتحقق منها خارج الوثيقة بتأكيد المراجع
  const criteria_results = inScope.map((f) => {
    const sources = criterionById(f.criterion_id)?.sources ?? [];
    if (!sources.length) return f;
    const states = sources.map((s) => config.sources[s]);
    if (states.includes("external_verified") && f.status !== "مستوفى" && f.status !== "لا ينطبق") {
      stats.externalAttestationsApplied += 1;
      return { ...f, status: "مستوفى" as const, evidence_origin: "external_reviewer_attestation" as const, evidence_text: EXTERNAL_ATTESTATION_TEXT, source_document: "تأكيد المراجع", recommended_action: "" };
    }
    if (f.evidence_origin === "external_reviewer_attestation" && !states.includes("external_verified")) {
      return { ...f, evidence_origin: "unavailable" as const };
    }
    if (states.every((s) => s === "unavailable") && f.status === "غير مستوفى") {
      return { ...f, status: "غير قابل للتحقق من الوثيقة المقدمة" as const, evidence_origin: "unavailable" as const };
    }
    return f;
  });

  // 3) صياغة الأهداف المعدلة
  const fixGoal = (text: string, keepAssistance: boolean) => {
    let out = text;
    if (!keepAssistance) {
      const s = stripImpliedWords(out);
      out = s.text;
      stats.impliedWordsStripped += s.count;
    }
    const c = enforceSingleCriterion(out);
    if (c.fixed) stats.singleCriterionFixes += 1;
    return c.text;
  };
  const revisions = report.revisions.map((r) => ({ ...r, revised_goal: fixGoal(r.revised_goal, r.keep_assistance_wording) }));

  // 4) الاحتياجات غير المغطاة: لا اختراع لهدف عند نقص البيانات
  const needs_coverage = report.needs_coverage.map((n) => ({
    ...n,
    suggested_goal:
      n.coverage_status === "مغطى" ? "" : n.suggested_goal.trim() ? fixGoal(n.suggested_goal, false) : DATA_REQUIRED_TEXT,
  }));

  // 5) استبعاد السلامة من المنطق الآلي — يقررها المشرف يدوياً
  const recommendations = report.recommendations.filter((t) => !SAFETY_RE.test(t));
  const critical_gates = report.critical_gates.filter((g) => !SAFETY_RE.test(g.description));
  stats.safetyItemsRemoved = report.recommendations.length - recommendations.length + (report.critical_gates.length - critical_gates.length);

  // 6) الخطة السابقة غير مرفقة → لا مواءمة رأسية ولا نقص
  const vertical_alignment =
    config.sources.previous_plan === "attached" ? report.vertical_alignment : { available: false, comment: "", items: [] };

  // 6ب) مراجعة صياغة الأهداف: كل هدف له تعديل مقترح يُحسب «يحتاج تعديل»
  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  const goals = report.goal_review.goals.map((g) => ({ ...g }));
  for (const r of revisions) {
    const hit = goals.find(
      (g) => (r.goal_number.trim() && norm(g.goal_number) === norm(r.goal_number)) || (r.original_goal.trim() && norm(g.goal_text) === norm(r.original_goal)),
    );
    if (hit) hit.verdict = "يحتاج تعديل";
    else if (r.original_goal.trim()) goals.push({ goal_number: r.goal_number, domain: r.domain, goal_text: r.original_goal, verdict: "يحتاج تعديل", issue: r.defect_type });
  }
  const goal_review = { ...report.goal_review, goals };

  // 6ج) فشل فصل القوة/الاحتياج يقيّد أحكاماً محددة فقط ولا يُسكت بقية المراجعة
  const pa = report.plaafp_assessment;
  const plaafp_assessment =
    !pa.separation_extracted && !pa.constrained_judgments.includes(SEPARATION_CONSTRAINT_TEXT)
      ? { ...pa, constrained_judgments: [SEPARATION_CONSTRAINT_TEXT, ...pa.constrained_judgments] }
      : pa;

  // 6د) المواقف المستثمرة تحتاج دليلاً من الوثيقة، وإلا تصبح فرصة محتملة؛ الفرص من البنك فقط
  const fc = report.functional_contexts;
  const demoted = fc.invested.filter((i) => !i.evidence_text.trim());
  const functional_contexts = {
    invested: fc.invested.filter((i) => i.evidence_text.trim()),
    potential: [
      ...fc.potential.filter((p) => !!contextById(p.bank_id)),
      ...demoted.map((i) => ({ bank_id: "", context: i.context, rationale: `لم يظهر دليل في الوثيقة على استثمار هذا الموقف. ${POTENTIAL_CONTEXT_STATUS}.`, integrable_goals: i.goals })),
    ],
  };

  // 6هـ) مصفوفة الانتقال: كل المفاهيم المرجعية، انطباق المستخدم، لا «مغطى» بلا أهداف داعمة
  const appl = config.transition_applicability ?? {};
  const tcRun = report.transition_coverage.length > 0;
  const transition_coverage = tcRun
    ? TRANSITION_CONCEPTS.map((concept) => {
        const row = report.transition_coverage.find((t) => t.concept === concept) ?? {
          concept,
          status: "غير قابل للتحقق" as const,
          supporting_goals: [],
          note: "",
          improvement: "",
        };
        let status = row.status;
        if (appl[concept] === "na") status = "لا ينطبق";
        else if (status === "لا ينطبق" && appl[concept] === "applies") status = row.supporting_goals.length ? "مغطى جزئياً" : "غير مغطى";
        if ((status === "مغطى" || status === "مغطى جزئياً") && !row.supporting_goals.length) status = "غير قابل للتحقق";
        const improvement = status === "مغطى جزئياً" || status === "غير مغطى" ? (SAFETY_RE.test(row.improvement) ? "" : row.improvement) : "";
        return { ...row, status, improvement };
      })
    : [];

  // 7) لا اعتماد مباشر مع بوابة حرجة مفعلة
  let review_decision = report.review_decision;
  if (critical_gates.length > 0 && review_decision === "جاهزة للاعتماد") {
    review_decision = "تحتاج إعادة مراجعة بعد التصحيح";
    stats.decisionAdjusted = true;
  }

  return {
    report: {
      ...report,
      criteria_results,
      revisions,
      needs_coverage,
      recommendations,
      critical_gates,
      vertical_alignment,
      review_decision,
      goal_review,
      plaafp_assessment,
      functional_contexts,
      transition_coverage,
      top_priorities: report.top_priorities.filter((t) => !SAFETY_RE.test(t)).slice(0, 5),
    },
    stats,
  };
}

/** ملخص عددي للعرض فقط — ليس صاحب قرار المراجعة */
export function statusCounts(report: IepAuditReport) {
  const counts: Record<string, number> = {};
  for (const f of report.criteria_results) counts[f.status] = (counts[f.status] ?? 0) + 1;
  return counts;
}

/** عدّ نتائج مراجعة صياغة الأهداف — حتمي من الكود */
export function goalReviewCounts(report: IepAuditReport) {
  const g = report.goal_review.goals;
  const needs = g.filter((x) => x.verdict === "يحتاج تعديل").length;
  const sound = g.filter((x) => x.verdict === "سليم").length;
  const unclear = g.filter((x) => x.verdict === "تعذر الحكم").length;
  const statement = !g.length
    ? "لم تُستخرج أهداف قابلة للمراجعة من الوثيقة — تعذر الحكم على الصياغة."
    : needs === 0
      ? NO_GOAL_REVISIONS_TEXT
      : `رُصدت ${needs} أهداف تحتاج تعديلًا في الصياغة.`;
  return { reviewed: g.length, sound, needs, unclear, statement };
}

/** نسبة تغطية مفاهيم الانتقال — وصفية لا قرار اعتماد */
export function transitionStats(report: IepAuditReport) {
  const rows = report.transition_coverage;
  const appl = report.review_config.transition_applicability ?? {};
  const userSet = Object.values(appl).some((v) => v === "applies" || v === "na");
  const c = (s: string) => rows.filter((r) => r.status === s).length;
  const covered = c("مغطى");
  const partial = c("مغطى جزئياً");
  const uncovered = c("غير مغطى");
  const na = c("لا ينطبق");
  const unverifiable = c("غير قابل للتحقق");
  const denominator = userSet ? rows.length - na - unverifiable : TRANSITION_CONCEPTS.length;
  const percent = denominator > 0 ? Math.round(((covered + partial) / denominator) * 100) : 0;
  return {
    covered,
    partial,
    uncovered,
    na,
    unverifiable,
    denominator,
    percent,
    mode: userSet ? ("actual" as const) : ("descriptive" as const),
    label: userSet
      ? `نسبة التغطية على المفاهيم المنطبقة: ${covered + partial} من ${denominator} (${percent}%) — ليست قرار اعتماد`
      : `نسبة تغطية وصفية وليست قرار اعتماد: ${covered + partial} من ${denominator} مفهوماً مرجعياً (${percent}%)`,
  };
}
