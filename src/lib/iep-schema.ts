import { z } from "zod";

/** المجالات الستة المعتمدة في الخطة التربوية الفردية */
export const IEP_DOMAINS = [
  "المهارات المهنية",
  "السلوكيات المهنية",
  "الأداء الوظيفي المستقل",
  "مهارات الترفيه",
  "التواصل الوظيفي",
  "السلوك البينشخصي",
] as const;

/** التصنيف الثلاثي الإلزامي للتعديلات */
export const REVISION_CATEGORIES = [
  "تحسين جودة الهدف",
  "تعديل صياغة غير ملائمة",
  "تحسين لغة واتساق",
] as const;

export const BANNED_IMPLIED_WORDS = [
  "باستقلالية",
  "بمفرده",
  "دون مساعدة",
  "بدون مساعدة",
] as const;

/** قرارات الاعتماد الرقمي */
export const ACCREDITATION_DECISIONS = [
  "معتمدة",
  "معتمدة بشرط التعديل",
  "غير معتمدة - تتطلب استكمال البنود",
] as const;

/** البنود المجمدة مؤقتاً (محيّدة من الاحتساب) */
export const FROZEN_ITEMS = [
  { id: "1-2", label: "ذكر وتحديد أداة التقييم الرسمي" },
  { id: "1-4", label: "تنوع أدوات التقييم" },
  { id: "1-6", label: "حصر أولويات الأسرة" },
  { id: "3-1", label: "حضور وتوقيعات الفريق" },
  { id: "3-2", label: "إقرار ولي الأمر وموافقته" },
] as const;

/** حدود درجات الركائز بعد تحييد البنود المجمدة (4 + 8 + 2 + 5 = 19) */
export const PILLAR_MAX_SCORES = {
  pillar_1_plaafp: 4,
  pillar_2_smart_goals: 8,
  pillar_3_admin: 2,
  pillar_4_transition: 5,
} as const;
export const TOTAL_MAX_SCORE = 19;

/** نطاق التنفيذ: كل مستوى قابل للتشغيل منفرداً */
export const AUDIT_SCOPES = ["both", "level1", "level2"] as const;
export type AuditScope = (typeof AUDIT_SCOPES)[number];

const pillarJsonSchema = (max: number): import("json-schema").JSONSchema7 => ({
  type: "object",
  additionalProperties: false,
  required: ["score", "max_score", "percent", "comment"],
  properties: {
    score: { type: "number", minimum: 0, maximum: max },
    max_score: { type: "number", const: max },
    percent: { type: "number", minimum: 0, maximum: 100 },
    comment: { type: "string" },
  },
});

/** مخطط JSON الصارم المرسل إلى النموذج (Strict JSON Schema, Temperature 0) */
export const auditReportJsonSchema: import("json-schema").JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: [
    "student_info",
    "level1_quality_standards",
    "level2_supervisory_review",
    "revisions",
    "recommendations",
  ],
  properties: {
    student_info: {
      type: "object",
      additionalProperties: false,
      required: ["student_name", "age", "disability_type", "school_center"],
      properties: {
        student_name: { type: "string" },
        age: { type: ["number", "null"] },
        disability_type: { type: "string" },
        school_center: { type: "string" },
      },
    },
    level1_quality_standards: {
      type: "object",
      additionalProperties: false,
      required: [
        "total_score",
        "compliance_percent",
        "accreditation_decision",
        "pillar_1_plaafp",
        "pillar_2_smart_goals",
        "pillar_3_admin",
        "pillar_4_transition",
      ],
      properties: {
        total_score: { type: "number", minimum: 0, maximum: TOTAL_MAX_SCORE },
        compliance_percent: { type: "number", minimum: 0, maximum: 100 },
        accreditation_decision: { enum: [...ACCREDITATION_DECISIONS] },
        pillar_1_plaafp: pillarJsonSchema(4),
        pillar_2_smart_goals: pillarJsonSchema(8),
        pillar_3_admin: pillarJsonSchema(2),
        pillar_4_transition: pillarJsonSchema(5),
      },
    },
    level2_supervisory_review: {
      type: "object",
      additionalProperties: false,
      required: ["overall_vision", "needs_coverage"],
      properties: {
        overall_vision: {
          type: "object",
          additionalProperties: false,
          required: [
            "horizontal_bundling",
            "cross_domain_integration",
            "sequential_logic",
            "scattered_goals",
          ],
          properties: {
            horizontal_bundling: { type: "string" },
            cross_domain_integration: { type: "string" },
            sequential_logic: { type: "string" },
            scattered_goals: { type: "string" },
          },
        },
        needs_coverage: {
          type: "object",
          additionalProperties: false,
          required: ["all_covered", "uncovered_needs"],
          properties: {
            all_covered: { type: "boolean" },
            uncovered_needs: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["need", "domain", "suggested_goal"],
                properties: {
                  need: { type: "string" },
                  domain: { enum: [...IEP_DOMAINS] },
                  suggested_goal: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    revisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "domain",
          "original_goal",
          "revised_goal",
          "revision_category",
          "rationale",
          "standards_violated",
        ],
        properties: {
          domain: { enum: [...IEP_DOMAINS] },
          original_goal: { type: "string" },
          revised_goal: { type: "string" },
          revision_category: { enum: [...REVISION_CATEGORIES] },
          rationale: { type: "string" },
          standards_violated: { type: "array", items: { type: "string" } },
        },
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
  },
};

export type PillarScore = {
  score: number;
  max_score: number;
  percent: number;
  comment: string;
};

export type IepAuditReport = {
  audit_scope?: AuditScope;
  student_info: {
    student_name: string;
    age: number | null;
    disability_type: string;
    school_center: string;
  };
  level1_quality_standards: {
    total_score: number;
    compliance_percent: number;
    accreditation_decision: (typeof ACCREDITATION_DECISIONS)[number];
    pillar_1_plaafp: PillarScore;
    pillar_2_smart_goals: PillarScore;
    pillar_3_admin: PillarScore;
    pillar_4_transition: PillarScore;
  };
  level2_supervisory_review: {
    overall_vision: {
      horizontal_bundling: string;
      cross_domain_integration: string;
      sequential_logic: string;
      scattered_goals: string;
    };
    needs_coverage: {
      all_covered: boolean;
      uncovered_needs: {
        need: string;
        domain: (typeof IEP_DOMAINS)[number];
        suggested_goal: string;
      }[];
    };
  };
  revisions: {
    domain: (typeof IEP_DOMAINS)[number];
    original_goal: string;
    revised_goal: string;
    revision_category: (typeof REVISION_CATEGORIES)[number];
    rationale: string;
    standards_violated: string[];
  }[];
  recommendations: string[];
};

const pillarZod = (max: number) =>
  z.object({
    score: z.number().min(0).max(max),
    max_score: z.literal(max),
    percent: z.number().min(0).max(100),
    comment: z.string(),
  });

/** تحقق نهائي صارم من بنية التقرير بعد الاستلام */
export const auditReportZodSchema = z.object({
  audit_scope: z.enum(AUDIT_SCOPES).optional(),
  student_info: z.object({
    student_name: z.string(),
    age: z.number().nullable(),
    disability_type: z.string(),
    school_center: z.string(),
  }),
  level1_quality_standards: z.object({
    total_score: z.number().min(0).max(TOTAL_MAX_SCORE),
    compliance_percent: z.number().min(0).max(100),
    accreditation_decision: z.enum(ACCREDITATION_DECISIONS),
    pillar_1_plaafp: pillarZod(4),
    pillar_2_smart_goals: pillarZod(8),
    pillar_3_admin: pillarZod(2),
    pillar_4_transition: pillarZod(5),
  }),
  level2_supervisory_review: z.object({
    overall_vision: z.object({
      horizontal_bundling: z.string(),
      cross_domain_integration: z.string(),
      sequential_logic: z.string(),
      scattered_goals: z.string(),
    }),
    needs_coverage: z.object({
      all_covered: z.boolean(),
      uncovered_needs: z.array(
        z.object({
          need: z.string(),
          domain: z.enum(IEP_DOMAINS),
          suggested_goal: z.string(),
        }),
      ),
    }),
  }),
  revisions: z.array(
    z.object({
      domain: z.enum(IEP_DOMAINS),
      original_goal: z.string(),
      revised_goal: z.string(),
      revision_category: z.enum(REVISION_CATEGORIES),
      rationale: z.string(),
      standards_violated: z.array(z.string()),
    }),
  ),
  recommendations: z.array(z.string()),
});

/** مخطط مُقلَّص حسب النطاق — يُرسل للنموذج ما هو مطلوب فقط لتقليل زمن المراجعة */
export function buildScopedJsonSchema(scope: AuditScope): import("json-schema").JSONSchema7 {
  if (scope === "both") return auditReportJsonSchema;
  const props = auditReportJsonSchema.properties!;
  const keys =
    scope === "level1"
      ? ["student_info", "level1_quality_standards", "recommendations"]
      : ["student_info", "level2_supervisory_review", "revisions", "recommendations"];
  return {
    type: "object",
    additionalProperties: false,
    required: keys,
    properties: Object.fromEntries(keys.map((k) => [k, props[k]])),
  };
}

const emptyPillar = (max: number): PillarScore => ({ score: 0, max_score: max, percent: 0, comment: "لم يُنفَّذ هذا المستوى في هذه المراجعة." });

/** يكمل الأجزاء غير المنفذة بقيم فارغة ليبقى شكل التقرير موحداً */
export function fillScopedReport(partial: Partial<IepAuditReport>, scope: AuditScope): IepAuditReport {
  return {
    audit_scope: scope,
    student_info: partial.student_info ?? { student_name: "", age: null, disability_type: "", school_center: "" },
    level1_quality_standards: partial.level1_quality_standards ?? {
      total_score: 0,
      compliance_percent: 0,
      accreditation_decision: "غير معتمدة - تتطلب استكمال البنود",
      pillar_1_plaafp: emptyPillar(4),
      pillar_2_smart_goals: emptyPillar(8),
      pillar_3_admin: emptyPillar(2),
      pillar_4_transition: emptyPillar(5),
    },
    level2_supervisory_review: partial.level2_supervisory_review ?? {
      overall_vision: { horizontal_bundling: "", cross_domain_integration: "", sequential_logic: "", scattered_goals: "" },
      needs_coverage: { all_covered: true, uncovered_needs: [] },
    },
    revisions: partial.revisions ?? [],
    recommendations: partial.recommendations ?? [],
  };
}
