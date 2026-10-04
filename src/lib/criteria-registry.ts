/**
 * سجل معايير المراجعة (Criteria Registry) — المصدر الوحيد للمعايير ومحاورها.
 * يُستخدم في الواجهة (تهيئة النطاق) وفي موجه النظام وفي الفرض الكودي بعد التوليد.
 */

export type EvidenceSourceId =
  | "current_plan"
  | "previous_plan"
  | "formal_assessment"
  | "informal_assessment"
  | "family_input"
  | "learner_voice"
  | "progress_report"
  | "specialist_reports";

export type Criterion = {
  id: string;
  label: string;
  /** مصادر أدلة يُتحقق المعيار من خلالها عند توفرها خارج الوثيقة */
  sources?: EvidenceSourceId[];
};

export type Pillar = { id: string; label: string; criteria: Criterion[] };

export const CRITERIA_REGISTRY: Pillar[] = [
  {
    id: "P1",
    label: "مستوى الأداء الحالي",
    criteria: [
      { id: "P1-1", label: "نقاط القوة محددة ووظيفية" },
      { id: "P1-2", label: "بيانات التقييم الرسمية عند توفرها", sources: ["formal_assessment"] },
      { id: "P1-3", label: "الاحتياجات الفردية واضحة" },
      { id: "P1-4", label: "تنوع مصادر البيانات عند توفرها", sources: ["formal_assessment", "informal_assessment", "specialist_reports"] },
      { id: "P1-5", label: "وجود خط أساس (Baseline) عندما يمكن الحكم عليه" },
      { id: "P1-6", label: "تجنب الصياغات الفضفاضة" },
      { id: "P1-7", label: "مراعاة أولويات الأسرة عندما تكون متاحة", sources: ["family_input"] },
      { id: "P1-8", label: "الربط المنطقي بين الأداء الحالي والأهداف" },
    ],
  },
  {
    id: "P2",
    label: "الأهداف السنوية",
    criteria: [
      { id: "P2-1", label: "فعل إجرائي ملاحظ" },
      { id: "P2-2", label: "سلوك مستهدف واضح" },
      { id: "P2-3", label: "ظرف أداء واضح" },
      { id: "P2-4", label: "معيار إتقان قابل للقياس" },
      { id: "P2-5", label: "إطار زمني" },
      { id: "P2-6", label: "ملاءمة للعمر" },
      { id: "P2-7", label: "ارتباط بالمنهج/الإطار عندما ينطبق" },
      { id: "P2-8", label: "واقعية" },
      { id: "P2-9", label: "وضوح تشغيلي" },
      { id: "P2-10", label: "قيمة وظيفية" },
      { id: "P2-11", label: "قابلية جمع بيانات الأداء" },
      { id: "P2-12", label: "نوع قياس مناسب لطبيعة السلوك" },
    ],
  },
  {
    id: "P3",
    label: "الجودة الإدارية",
    criteria: [
      { id: "P3-1", label: "سلامة بيانات الطالب" },
      { id: "P3-2", label: "فريق العمل" },
      { id: "P3-3", label: "مشاركة ولي الأمر", sources: ["family_input"] },
      { id: "P3-4", label: "الاتساق بين الاسم/الجنس/الضمائر/التواريخ" },
      { id: "P3-5", label: "كشف أخطاء النسخ واللصق" },
    ],
  },
  {
    id: "P4",
    label: "الانتقال والمواءمة",
    criteria: [
      { id: "P4-1", label: "ملاءمة المرحلة العمرية" },
      { id: "P4-2", label: "الاستقلال والحياة اليومية" },
      { id: "P4-3", label: "التواصل الوظيفي" },
      { id: "P4-4", label: "المهارات الشخصية والاجتماعية" },
      { id: "P4-5", label: "تقرير المصير والاختيار والمبادرة" },
      { id: "P4-6", label: "السلوك والعمل المهني" },
      { id: "P4-7", label: "المشاركة المجتمعية" },
      { id: "P4-8", label: "إدارة الوقت والروتين" },
      { id: "P4-9", label: "الترفيه ووقت الفراغ" },
      { id: "P4-10", label: "الاستعداد لأدوار ما بعد التخرج" },
    ],
  },
];

export const ALL_CRITERIA: Criterion[] = CRITERIA_REGISTRY.flatMap((p) => p.criteria);
export const criterionById = (id: string) => ALL_CRITERIA.find((c) => c.id === id);

export const CRITERION_STATES = ["active", "frozen", "na"] as const;
export type CriterionState = (typeof CRITERION_STATES)[number];
export const CRITERION_STATE_LABELS: Record<CriterionState, string> = {
  active: "مفعّل",
  frozen: "مجمّد",
  na: "لا ينطبق",
};

/** البنود المجمدة افتراضياً (قرار تجميد مؤقت سابق) */
export const DEFAULT_FROZEN: Record<string, string> = {
  "P1-2": "تجميد مؤقت: ذكر وتحديد أداة التقييم",
  "P1-4": "تجميد مؤقت: تنوع أدوات التقييم",
  "P1-7": "تجميد مؤقت: حصر أولويات الأسرة",
  "P3-2": "تجميد مؤقت: التوقيعات",
  "P3-3": "تجميد مؤقت: إقرار ولي الأمر",
};

export const EVIDENCE_SOURCES: { id: EvidenceSourceId; label: string }[] = [
  { id: "current_plan", label: "الخطة الحالية" },
  { id: "previous_plan", label: "الخطة السابقة" },
  { id: "formal_assessment", label: "تقييم رسمي" },
  { id: "informal_assessment", label: "تقييم غير رسمي" },
  { id: "family_input", label: "مدخلات الأسرة" },
  { id: "learner_voice", label: "صوت المتعلم" },
  { id: "progress_report", label: "تقرير تقدم" },
  { id: "specialist_reports", label: "تقارير تخصصية" },
];

export const SOURCE_STATES = ["attached", "external_verified", "unavailable"] as const;
export type SourceState = (typeof SOURCE_STATES)[number];
export const SOURCE_STATE_LABELS: Record<SourceState, string> = {
  attached: "مرفق داخل هذه المراجعة",
  external_verified: "موجود خارج النظام ومتحقق بواسطة المراجع",
  unavailable: "غير متوفر",
};

export const REVIEW_TYPES = [
  { id: "full", label: "مراجعة كاملة" },
  { id: "quality", label: "معايير الجودة فقط" },
  { id: "supervisory", label: "المراجعة الإشرافية النوعية فقط" },
  { id: "goals", label: "مراجعة الأهداف فقط" },
  { id: "plaafp", label: "مراجعة مستوى الأداء فقط" },
  { id: "post_correction", label: "مراجعة بعد التصحيح" },
  { id: "compare_previous", label: "مقارنة مع خطة سابقة" },
] as const;
export type ReviewType = (typeof REVIEW_TYPES)[number]["id"];

export type ReviewConfig = {
  review_type: ReviewType;
  sources: Record<EvidenceSourceId, SourceState>;
  criteria: Record<string, { state: CriterionState; reason?: string | undefined }>;
  /** انطباق كل مفهوم انتقال على هذه المراجعة (اختياري) — يحدد نوع نسبة التغطية */
  transition_applicability?: Record<string, TransitionApplicability> | undefined;
};

export const TRANSITION_APPLICABILITY = ["unset", "applies", "na"] as const;
export type TransitionApplicability = (typeof TRANSITION_APPLICABILITY)[number];
export const TRANSITION_APPLICABILITY_LABELS: Record<TransitionApplicability, string> = {
  unset: "غير محدد",
  applies: "ينطبق",
  na: "لا ينطبق",
};

export function defaultReviewConfig(): ReviewConfig {
  const sources = Object.fromEntries(
    EVIDENCE_SOURCES.map((s) => [s.id, s.id === "current_plan" ? "attached" : "unavailable"]),
  ) as Record<EvidenceSourceId, SourceState>;
  const criteria = Object.fromEntries(
    ALL_CRITERIA.map((c) => [
      c.id,
      DEFAULT_FROZEN[c.id] ? { state: "frozen" as const, reason: DEFAULT_FROZEN[c.id] } : { state: "active" as const },
    ]),
  );
  return { review_type: "full", sources, criteria, transition_applicability: {} };
}

/** المحاور التي يغطيها كل نوع مراجعة — يحدد ما يُطلب من المحرك فعلاً */
export function pillarsForReviewType(t: ReviewType): string[] {
  if (t === "goals") return ["P2"];
  if (t === "plaafp") return ["P1"];
  if (t === "supervisory") return [];
  return ["P1", "P2", "P3", "P4"];
}

/** المعايير الفعّالة فعلياً = مفعّلة + ضمن محاور نوع المراجعة */
export function activeCriteria(config: ReviewConfig): Criterion[] {
  const pillars = new Set(pillarsForReviewType(config.review_type));
  return CRITERIA_REGISTRY.filter((p) => pillars.has(p.id))
    .flatMap((p) => p.criteria)
    .filter((c) => (config.criteria[c.id]?.state ?? "active") === "active");
}
