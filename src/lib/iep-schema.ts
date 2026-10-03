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

/** مخطط JSON الصارم المرسل إلى النموذج (Strict JSON Schema, Temperature 0) */
export const auditReportJsonSchema: import("json-schema").JSONSchema7 = {
  type: "object",
  additionalProperties: false,
  required: [
    "macro_plan_engineering",
    "micro_audit_summary",
    "revisions",
    "checklist_24_standards_status",
    "need_goal_mapping",
    "recommendations",
  ],
  properties: {
    need_goal_mapping: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["need", "domain", "covering_goal"],
        properties: {
          need: { type: "string" },
          domain: { enum: [...IEP_DOMAINS] },
          covering_goal: { type: ["string", "null"] },
        },
      },
    },
    recommendations: { type: "array", items: { type: "string" } },
    macro_plan_engineering: {
      type: "object",
      additionalProperties: false,
      required: [
        "integration_score_percent",
        "target_functional_role",
        "horizontal_analysis_6_questions",
        "macro_recommendation",
      ],
      properties: {
        integration_score_percent: { type: "number" },
        target_functional_role: { type: "string" },
        horizontal_analysis_6_questions: {
          type: "object",
          additionalProperties: false,
          required: [
            "q1_horizontal_bundling",
            "q2_cross_domain_integration",
            "q3_sequential_logic",
            "q4_observable_life_impact",
            "q5_post_graduation_readiness",
            "q6_scattered_goals_detected",
          ],
          properties: {
            q1_horizontal_bundling: { type: "string" },
            q2_cross_domain_integration: { type: "string" },
            q3_sequential_logic: { type: "string" },
            q4_observable_life_impact: { type: "string" },
            q5_post_graduation_readiness: { type: "string" },
            q6_scattered_goals_detected: { type: "string" },
          },
        },
        macro_recommendation: { type: "string" },
      },
    },
    micro_audit_summary: {
      type: "object",
      additionalProperties: false,
      required: [
        "student_name",
        "age",
        "disability_type",
        "total_goals_reviewed",
        "quality_score_24_standards",
        "plaafp_coverage_complete",
        "unmapped_needs",
      ],
      properties: {
        student_name: { type: "string" },
        age: { type: ["number", "null"] },
        disability_type: { type: "string" },
        total_goals_reviewed: { type: "number" },
        quality_score_24_standards: { type: "number" },
        plaafp_coverage_complete: { type: "boolean" },
        unmapped_needs: { type: "array", items: { type: "string" } },
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
    checklist_24_standards_status: {
      type: "object",
      additionalProperties: false,
      required: [
        "pillar_1_plaafp",
        "pillar_2_smart_goals",
        "pillar_3_admin",
        "pillar_4_transition",
        "items_13_7_to_13_11_plan_engineering",
      ],
      properties: {
        pillar_1_plaafp: { type: "string" },
        pillar_2_smart_goals: { type: "string" },
        pillar_3_admin: { type: "string" },
        pillar_4_transition: { type: "string" },
        items_13_7_to_13_11_plan_engineering: { type: "string" },
      },
    },
  },
};


export type IepAuditReport = {
  macro_plan_engineering: {
    integration_score_percent: number;
    target_functional_role: string;
    horizontal_analysis_6_questions: {
      q1_horizontal_bundling: string;
      q2_cross_domain_integration: string;
      q3_sequential_logic: string;
      q4_observable_life_impact: string;
      q5_post_graduation_readiness: string;
      q6_scattered_goals_detected: string;
    };
    macro_recommendation: string;
  };
  micro_audit_summary: {
    student_name: string;
    age: number | null;
    disability_type: string;
    total_goals_reviewed: number;
    quality_score_24_standards: number;
    plaafp_coverage_complete: boolean;
    unmapped_needs: string[];
  };
  revisions: {
    domain: (typeof IEP_DOMAINS)[number];
    original_goal: string;
    revised_goal: string;
    revision_category: (typeof REVISION_CATEGORIES)[number];
    rationale: string;
    standards_violated: string[];
  }[];
  checklist_24_standards_status: {
    pillar_1_plaafp: string;
    pillar_2_smart_goals: string;
    pillar_3_admin: string;
    pillar_4_transition: string;
    items_13_7_to_13_11_plan_engineering: string;
  };
  need_goal_mapping: { need: string; domain: (typeof IEP_DOMAINS)[number]; covering_goal: string | null }[];
  recommendations: string[];
};

/** تحقق نهائي صارم من بنية التقرير بعد الاستلام */
export const auditReportZodSchema = z.object({
  macro_plan_engineering: z.object({
    integration_score_percent: z.number().min(0).max(100),
    target_functional_role: z.string(),
    horizontal_analysis_6_questions: z.object({
      q1_horizontal_bundling: z.string(),
      q2_cross_domain_integration: z.string(),
      q3_sequential_logic: z.string(),
      q4_observable_life_impact: z.string(),
      q5_post_graduation_readiness: z.string(),
      q6_scattered_goals_detected: z.string(),
    }),
    macro_recommendation: z.string(),
  }),
  micro_audit_summary: z.object({
    student_name: z.string(),
    age: z.number().nullable(),
    disability_type: z.string(),
    total_goals_reviewed: z.number(),
    quality_score_24_standards: z.number(),
    plaafp_coverage_complete: z.boolean(),
    unmapped_needs: z.array(z.string()),
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
  checklist_24_standards_status: z.object({
    pillar_1_plaafp: z.string(),
    pillar_2_smart_goals: z.string(),
    pillar_3_admin: z.string(),
    pillar_4_transition: z.string(),
    items_13_7_to_13_11_plan_engineering: z.string(),
  }),
  need_goal_mapping: z.array(
    z.object({ need: z.string(), domain: z.enum(IEP_DOMAINS), covering_goal: z.string().nullable() }),
  ),
  recommendations: z.array(z.string()),
});
