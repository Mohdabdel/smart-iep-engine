import { z } from "zod/v4";

import type { ReviewConfig, ReviewType } from "./criteria-registry";

/** المجالات الستة المعتمدة في الخطة التربوية الفردية */
export const IEP_DOMAINS = [
  "المهارات المهنية",
  "السلوكيات المهنية",
  "الأداء الوظيفي المستقل",
  "مهارات الترفيه",
  "التواصل الوظيفي",
  "السلوك البينشخصي",
] as const;

export const REVISION_CATEGORIES = [
  "تحسين جودة الهدف",
  "تعديل صياغة غير ملائمة",
  "تحسين لغة واتساق",
  "تعديل بنيوي / ترابطي",
] as const;

/** كلمات تُحذف عادة — إلا إذا كان مستوى الاستقلال/المساعدة متغيراً مقصوداً في القياس */
export const IMPLIED_WORDS = ["باستقلالية", "بمفرده", "دون مساعدة", "بدون مساعدة"] as const;

export const FINDING_STATUSES = [
  "مستوفى",
  "مستوفى جزئياً",
  "غير مستوفى",
  "غير قابل للتحقق من الوثيقة المقدمة",
  "لا ينطبق",
] as const;
export const SEVERITIES = ["حرج", "مهم", "تحسين جودة"] as const;
export const REVIEW_DECISIONS = [
  "جاهزة للاعتماد",
  "جاهزة بعد تعديلات محدودة",
  "تحتاج إعادة مراجعة بعد التصحيح",
  "لا يمكن استكمال الحكم لعدم كفاية المعلومات",
] as const;
export const EVIDENCE_ORIGINS = ["document", "external_reviewer_attestation", "unavailable"] as const;
export const REVIEWER_STATUSES = ["pending", "accepted", "rejected", "edited"] as const;
export const REVIEWER_STATUS_LABELS: Record<(typeof REVIEWER_STATUSES)[number], string> = {
  pending: "بانتظار المراجع",
  accepted: "مقبول",
  rejected: "مرفوض",
  edited: "معدّل",
};
export const COVERAGE_STATUSES = ["مغطى", "مغطى جزئياً", "غير مغطى"] as const;
export const PLAN_JUDGMENTS = ["قوي", "مقبول", "ضعيف", "غير قابل للتحقق"] as const;
export const TRANSITION_JUDGMENTS = ["كافية مبدئياً", "موجودة جزئياً", "محدودة", "غير قابلة للتحقق"] as const;
export const TRANSITION_CONCEPTS = [
  "الاستقلال والحياة اليومية",
  "الاستعداد للعمل والسلوك المهني",
  "التواصل الوظيفي",
  "المهارات الشخصية والاجتماعية",
  "تقرير المصير والاختيار والمبادرة",
  "إدارة الوقت والروتين",
  "التعامل مع المال والشراء",
  "المشاركة المجتمعية",
  "التنقل",
  "الترفيه ووقت الفراغ",
  "العلاقات والتفاعل الاجتماعي",
  "استخدام الخدمات والموارد المجتمعية",
  "الاستعداد لأدوار ما بعد التخرج",
] as const;
export const CRITICAL_GATES = [
  "بيانات طالب مختلطة أو اسم طالب آخر",
  "مستوى أداء غير كاف للحكم",
  "غياب Baseline ضروري للحكم على الواقعية",
  "احتياج رئيسي معلن بلا هدف",
  "هدف غير قابل للقياس",
  "معيار قياس غير صالح",
  "إعادة تدريب مهارة متقنة بلا تقدم جديد واضح",
  "عدم ملاءمة عمرية جوهرية",
  "انقطاع واضح في تقييم ← احتياج ← هدف",
] as const;
export const MEASUREMENT_TYPES = [
  "discrete task",
  "chained task",
  "duration",
  "communication",
  "initiation",
  "transition",
  "production",
] as const;

const str = z.string();

export const findingZ = z.object({
  criterion_id: str,
  status: z.enum(FINDING_STATUSES),
  severity: z.enum(SEVERITIES),
  evidence_text: str,
  source_document: str,
  page_or_section: str,
  reasoning_summary: str,
  recommended_action: str,
  evidence_origin: z.enum(EVIDENCE_ORIGINS),
});

const gateZ = z.object({ gate: z.enum(CRITICAL_GATES), description: str, evidence_text: str });

const needZ = z.object({
  domain: z.enum(IEP_DOMAINS),
  need: str,
  matched_goal: str,
  coverage_status: z.enum(COVERAGE_STATUSES),
  note: str,
  /** هدف مقترح فقط عند كفاية البيانات، وإلا «متطلب تصحيح / بيانات إضافية مطلوبة» */
  suggested_goal: str,
});

const wholePlanZ = z.object({
  within_domain_coherence: str,
  cross_domain_integration: str,
  sequential_logic: str,
  scattered_goals: str,
  functional_clusters: z.array(z.object({ role: str, goals: z.array(str) })),
  governing_question_answer: str,
  judgment: z.enum(PLAN_JUDGMENTS),
});

const routinesZ = z.object({
  comment: str,
  opportunities: z.array(z.object({ routine: str, opportunity: str, evidence_text: str })),
});

const transitionZ = z.object({
  answer: str,
  judgment: z.enum(TRANSITION_JUDGMENTS),
  integrated_pathways: z.array(str),
  goals: z.array(z.object({ domain: z.enum(IEP_DOMAINS), goal: str, concept: z.enum(TRANSITION_CONCEPTS), note: str })),
});

const verticalZ = z.object({
  available: z.boolean(),
  comment: str,
  items: z.array(z.object({ previous_goal: str, progress: str, current_goal: str, next_step: str, note: str })),
});

export const revisionZ = z.object({
  domain: z.enum(IEP_DOMAINS),
  goal_number: str,
  original_goal: str,
  defect_type: str,
  criterion_affected: str,
  rationale: str,
  revised_goal: str,
  technical_rule: str,
  priority: z.enum(SEVERITIES),
  note: str,
  revision_category: z.enum(REVISION_CATEGORIES),
  measurement_type: z.enum(MEASUREMENT_TYPES),
  /** true عندما يكون مستوى الاستقلال/المساعدة متغيراً مقصوداً في القياس فلا تُحذف ألفاظه */
  keep_assistance_wording: z.boolean(),
});

/** مخرجات النموذج — كل المفاتيح (يُقلَّص حسب نوع المراجعة) */
export const modelOutputZ = z.object({
  student_info: z.object({
    student_name: str,
    age: z.number().nullable(),
    disability_type: str,
    school_center: str,
  }),
  executive_summary: str,
  review_decision: z.enum(REVIEW_DECISIONS),
  critical_gates: z.array(gateZ),
  criteria_results: z.array(findingZ),
  plaafp_review: str,
  smart_review: str,
  needs_coverage: z.array(needZ),
  whole_plan: wholePlanZ,
  daily_routines: routinesZ,
  personal_social: str,
  transition_minimum: transitionZ,
  vertical_alignment: verticalZ,
  revisions: z.array(revisionZ),
  recommendations: z.array(str),
});
export type ModelOutput = z.infer<typeof modelOutputZ>;
export type ModelKey = keyof ModelOutput;

type WithReviewer<T> = T & { reviewer_status: (typeof REVIEWER_STATUSES)[number] };
export type Finding = WithReviewer<z.infer<typeof findingZ>>;
export type Revision = WithReviewer<z.infer<typeof revisionZ>>;

/** التقرير الكامل كما يُعرض ويُحرر ويُصدّر */
export type IepAuditReport = Omit<ModelOutput, "criteria_results" | "revisions"> & {
  schema_version: 4;
  review_config: ReviewConfig;
  criteria_results: Finding[];
  revisions: Revision[];
  manual_notes: string[];
};

const ALWAYS: ModelKey[] = ["student_info", "executive_summary", "review_decision", "critical_gates", "recommendations"];
const SUPERVISORY: ModelKey[] = ["needs_coverage", "whole_plan", "daily_routines", "personal_social", "transition_minimum", "revisions"];

/** المفاتيح المطلوبة من المحرك حسب نوع المراجعة — تقليص المخرجات يقلل زمن المراجعة */
export function keysForReviewType(t: ReviewType): ModelKey[] {
  switch (t) {
    case "quality":
      return [...ALWAYS, "criteria_results", "plaafp_review", "smart_review"];
    case "supervisory":
      return [...ALWAYS, ...SUPERVISORY];
    case "goals":
      return [...ALWAYS, "criteria_results", "smart_review", "needs_coverage", "revisions"];
    case "plaafp":
      return [...ALWAYS, "criteria_results", "plaafp_review", "needs_coverage"];
    case "compare_previous":
      return [...ALWAYS, "criteria_results", "plaafp_review", "smart_review", ...SUPERVISORY, "vertical_alignment"];
    default:
      return [...ALWAYS, "criteria_results", "plaafp_review", "smart_review", ...SUPERVISORY, "vertical_alignment"];
  }
}

/** تحويل إلى JSON Schema صارم: كل الحقول مطلوبة وadditionalProperties=false */
function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!node || typeof node !== "object") return node;
  const o = { ...(node as Record<string, unknown>) };
  delete o["$schema"];
  for (const k of Object.keys(o)) o[k] = strictify(o[k]);
  if (o["type"] === "object" && o["properties"]) {
    o["additionalProperties"] = false;
    o["required"] = Object.keys(o["properties"] as object);
  }
  return o;
}

export function buildScopedJsonSchema(t: ReviewType): import("json-schema").JSONSchema7 {
  const keys = new Set(keysForReviewType(t));
  const shape = Object.fromEntries(Object.entries(modelOutputZ.shape).filter(([k]) => keys.has(k as ModelKey)));
  return strictify(z.toJSONSchema(z.object(shape), { target: "draft-7" })) as import("json-schema").JSONSchema7;
}

export function emptyModelOutput(): ModelOutput {
  return {
    student_info: { student_name: "", age: null, disability_type: "", school_center: "" },
    executive_summary: "",
    review_decision: "لا يمكن استكمال الحكم لعدم كفاية المعلومات",
    critical_gates: [],
    criteria_results: [],
    plaafp_review: "",
    smart_review: "",
    needs_coverage: [],
    whole_plan: {
      within_domain_coherence: "",
      cross_domain_integration: "",
      sequential_logic: "",
      scattered_goals: "",
      functional_clusters: [],
      governing_question_answer: "",
      judgment: "غير قابل للتحقق",
    },
    daily_routines: { comment: "", opportunities: [] },
    personal_social: "",
    transition_minimum: { answer: "", judgment: "غير قابلة للتحقق", integrated_pathways: [], goals: [] },
    vertical_alignment: { available: false, comment: "", items: [] },
    revisions: [],
    recommendations: [],
  };
}

/** يكمل الأجزاء غير المطلوبة بقيم فارغة ليبقى شكل التقرير موحداً */
export function toReport(partial: Partial<ModelOutput>, config: ReviewConfig): IepAuditReport {
  const full = { ...emptyModelOutput(), ...partial };
  const parsed = modelOutputZ.parse(full);
  return {
    ...parsed,
    schema_version: 4,
    review_config: config,
    criteria_results: parsed.criteria_results.map((f) => ({ ...f, reviewer_status: "pending" as const })),
    revisions: parsed.revisions.map((r) => ({ ...r, reviewer_status: "pending" as const })),
    manual_notes: [],
  };
}
