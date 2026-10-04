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

/** حدود درجات الركائز الأربع (7 + 8 + 4 + 5 = 24) */
export const PILLAR_MAX_SCORES = {
  pillar_1_plaafp: 7,
  pillar_2_smart_goals: 8,
  pillar_3_admin: 4,
  pillar_4_transition: 5,
} as const;

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
        total_score: { type: "number", minimum: 0, maximum: 24 },
        compliance_percent: { type: "number", minimum: 0, maximum: 100 },
        accreditation_decision: { enum: [...ACCREDITATION_DECISIONS] },
        pillar_1_plaafp: pillarJsonSchema(7),
        pillar_2_smart_goals: pillarJsonSchema(8),
        pillar_3_admin: pillarJsonSchema(4),
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
  student_info: z.object({
    student_name: z.string(),
    age: z.number().nullable(),
    disability_type: z.string(),
    school_center: z.string(),
  }),
  level1_quality_standards: z.object({
    total_score: z.number().min(0).max(24),
    compliance_percent: z.number().min(0).max(100),
    accreditation_decision: z.enum(ACCREDITATION_DECISIONS),
    pillar_1_plaafp: pillarZod(7),
    pillar_2_smart_goals: pillarZod(8),
    pillar_3_admin: pillarZod(4),
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
