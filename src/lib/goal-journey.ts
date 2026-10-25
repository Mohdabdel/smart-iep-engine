/**
 * رحلة الأهداف من الخطة السابقة إلى الحالية، وقراءة همم عبر الخطط.
 * التصنيف داخلي (للعدّ والاتساق)، والصياغة في التقرير إيجابية موجّهة.
 * السند: IDEA 34 CFR 300.324(b)، Endrew F. (2017)، مقياس تكساس 1.B، التسلسل الهرمي للتعلم،
 * براون 1976/1979 (معيار الأداء النهائي)، أركنساس (المهارات المعزولة). الحد الرقمي للنمط تشغيلي.
 */
import type { IepAuditReport } from "./iep-schema";

export const JOURNEY_CATEGORIES = ["تكرار بلا معالجة", "استمرار مبرر", "امتداد سليم", "متروك بلا تفسير", "مُتقن", "غير قابل للتحقق"] as const;
export type JourneyCategory = (typeof JOURNEY_CATEGORIES)[number];

/** الصياغة الظاهرة للمعلم — لا تبدو حكماً */
export const JOURNEY_PHRASES: Record<JourneyCategory, string> = {
  "تكرار بلا معالجة": "فرصة لتحديث خط الأساس وتوضيح سبب استمرار الهدف أو رفع مرحلته",
  "استمرار مبرر": "استمرار موثق بخط أساس محدث",
  "امتداد سليم": "يبني على الهدف السابق وينقله إلى مرحلة أعلى",
  "متروك بلا تفسير": "يُستحسن توثيق مآل هذا الهدف: أُتقن أم أُعيد توجيهه",
  "مُتقن": "أُتقن، والفرصة رفعه إلى مرحلة أعلى أو دمجه في نشاط وظيفي",
  "غير قابل للتحقق": "يتعذر تتبعه من المصادر المرفقة",
};

/** حد «النمط» في قراءة همم — تشغيلي قابل للمعايرة، غير مستمد من مصدر */
export const HIMAM_PATTERN_THRESHOLD = 0.5;

const refsIn = (s: string) => (s.match(/هـ\s*\d+/g) ?? []).map((x) => x.replace(/\s+/g, ""));

export function himamReading(report: IepAuditReport) {
  const items = report.goal_journey?.items ?? [];
  const curGoals = report.goal_review?.goals ?? [];
  if (!items.length) return null;
  const incomplete = items.filter((i) => i.category === "تكرار بلا معالجة" || i.category === "متروك بلا تفسير").length;
  const isolated = items.filter((i) => i.isolated_mastery).length;
  const inCluster = new Set((report.whole_plan?.functional_clusters ?? []).flatMap((c) => c.goals.flatMap(refsIn)));
  const curRefs = curGoals.map((g) => (g.goal_number || "").replace(/\s+/g, "")).filter(Boolean);
  const scattered = curRefs.length && inCluster.size ? curRefs.filter((r) => !inCluster.has(r)).length : null;
  const incRatio = incomplete / items.length;
  const scatRatio = scattered !== null && curRefs.length ? scattered / curRefs.length : null;
  const pattern = incRatio >= HIMAM_PATTERN_THRESHOLD || (scatRatio !== null && scatRatio >= HIMAM_PATTERN_THRESHOLD);
  const lines = [
    `من ${items.length} أهداف في الخطة السابقة: ${incomplete} لم يظهر ما يدل على اكتمالها أو توثيق مآلها، و${isolated} أُتقنت منفردة دون أن تُجمع في نشاط وظيفي.`,
    scattered !== null ? `من ${curRefs.length} هدفاً في الخطة الحالية: ${scattered} لا تنتمي بعد إلى مسار وظيفي يجمعها.` : "",
    pattern
      ? "يتكرر عبر الخطتين اتجاه نحو مهارات منفردة لم تتحول بعد إلى أداء في حياة المتعلم؛ الفرصة ربطها في سلاسل وأنشطة وظيفية تُظهره في دور."
      : "تُظهر الرحلة بناءً متدرجاً بين الخطتين يمكن تعزيزه بربط المهارات في أنشطة وظيفية.",
    report.goal_journey?.previous_promise ? `ما وعدت به الخطة السابقة في حياة المتعلم: ${report.goal_journey.previous_promise}` : "",
    report.goal_journey?.promise_in_life ? `ما يظهر اليوم في حياته: ${report.goal_journey.promise_in_life}` : "",
  ].filter(Boolean);
  return { lines, pattern, incomplete, isolated, scattered, total: items.length };
}
