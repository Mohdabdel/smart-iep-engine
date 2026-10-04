import { activeCriteria, criterionById, type ReviewConfig } from "./criteria-registry";
import { IMPLIED_WORDS, type IepAuditReport } from "./iep-schema";

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

  // 7) لا اعتماد مباشر مع بوابة حرجة مفعلة
  let review_decision = report.review_decision;
  if (critical_gates.length > 0 && review_decision === "جاهزة للاعتماد") {
    review_decision = "تحتاج إعادة مراجعة بعد التصحيح";
    stats.decisionAdjusted = true;
  }

  return {
    report: { ...report, criteria_results, revisions, needs_coverage, recommendations, critical_gates, vertical_alignment, review_decision },
    stats,
  };
}

/** ملخص عددي للعرض فقط — ليس صاحب قرار المراجعة */
export function statusCounts(report: IepAuditReport) {
  const counts: Record<string, number> = {};
  for (const f of report.criteria_results) counts[f.status] = (counts[f.status] ?? 0) + 1;
  return counts;
}
