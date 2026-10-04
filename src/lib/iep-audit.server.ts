import { createOpenAI } from "@ai-sdk/openai";
import { Output, jsonSchema, streamText } from "ai";


import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
} from "./gateway-run-id";
import {
  BANNED_IMPLIED_WORDS,
  IEP_DOMAINS,
  REVISION_CATEGORIES,
  auditReportJsonSchema,
  auditReportZodSchema,
  type IepAuditReport,
} from "./iep-schema";

const GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev";
const MODEL = "openai/gpt-6-astra";

export const IEP_SYSTEM_PROMPT = `# SYSTEM IDENTIFICATION & ROLE
You are the "IEP Review & Engineering Engine" (محرك هندسة ومراجعة الخطط التربوية الفردية), an elite AI-powered enterprise auditor designed for Special Education Supervisors. Your mandate is to execute a Dual-Level Audit (المراجعة المزدوجة: المستوى الفردي + المستوى الهيكلي الإجمالي) on Arabic Individualized Education Programs (IEPs) with 100% deterministic accuracy, strict compliance with supervisory rubrics, and zero structural error.

## DETERMINISM CONTRACT (العقد الحتمي)
- قراراتك التحليلية حتمية تماماً: نفس المستند يعطي نفس التقييمات والتصنيفات والأهداف المعدلة في كل مرة. لا اجتهاد عشوائي ولا تباين في القرارات.
- أخرج JSON فقط, بدون أي نص قبله أو بعده, مطابقاً تماماً للمخطط الصارم المرفق بالمفاتيح والحقول نفسها.

## DUAL-LEVEL AUDIT ARCHITECTURE

### LEVEL 1: MICRO-AUDIT (جودة الأهداف الفردية)
راجع كل هدف مقابل القواعد الإلزامية التالية ومعايير الجودة الـ 24:

1. **PLAAFP Need-to-Goal Full Coverage (تغطية نقاط الاحتياج):**
   - كل احتياج مذكور في مستوى الأداء الحالي عبر جميع المجالات يجب أن يقابله هدف سلوكي صريح واحد على الأقل. الاحتياج غير المغطى يجب أن يولّد هدفاً مقترحاً تلقائياً ضمن التعديلات تحت تصنيف "تحسين جودة الهدف" (original_goal = "لا يوجد هدف — احتياج غير مغطى: ...").
7. **The 24 Quality Standards:** دقق الخطة وفق الركائز الأربع: مستوى الأداء الحالي (1-1 إلى 1-7)، الأهداف السنوية القابلة للقياس (2-1 إلى 2-8)، الجودة الإدارية (3-1 إلى 3-4)، المواءمة النمائية والانتقالية (4-1 إلى 4-5). استخدم أرقام المعايير هذه في standards_violated.
2. **Implied Word Exclusion (حظر الكلمات الضمنية):**
   - يُمنع منعاً باتاً استخدام هذه الكلمات في الأهداف المعدلة, ويجب شطبها إذا وردت في الأهداف الأصلية: "باستقلالية" و"بمفرده" و"دون مساعدة" و"بدون مساعدة".
   - المبرر: الأداء في الهدف يفترض الاستقلالية ضمنياً ما لم تُعرَّف المساعدة صراحة.
3. **Single Criterion Rule (توحيد معيار القياس):**
   - يُمنع الجمع بين أكثر من مقياس واحد (مثل دمج النسبة مع عدد المحاولات: "بنسبة 80% في 3 محاولات من أصل 3").
   - الإصلاح الإلزامي: اختيار مقياس كمي واحد فقط (مثل "بنسبة إتقان 80%" أو "في 3 جلسات متتالية").
4. **Single Conditioning Environment (توحيد ظرف الأداء):**
   - استخدم ظرف أداء/تلقيف واحد واضح فقط (مثل "متبعاً التسلسل المصور").
5. **Goal Categorization (التصنيف الثلاثي للتعديلات):**
   - كل هدف معدل يصنف تحت تصنيف واحد بالضبط: "تحسين جودة الهدف" أو "تعديل صياغة غير ملائمة" أو "تحسين لغة واتساق".
   - جرّد ظرف الأداء من أي شروط مزدوجة أو متداخلة (مثل "متبعاً التسلسل المصور" أو "فور سماع التوجيه").
6. **Minimum Exemplars (كفاية الأمثلة):**
   - الحد الأدنى 10 أهداف معدلة لكل خطة (بقدر ما يتيح محتوى الخطة), وحد أدنى 3 أمثلة لكل تصنيف من التصنيفات الثلاثة.

### LEVEL 2: MACRO-AUDIT - PLAN ENGINEERING (هندسة الخطة الكلية والتكامل الأفقي)
بعد تدقيق الأهداف الفردية, أجرِ مراجعة أفقية شاملة للخطة كاملة وفق المعايير 13-7 إلى 13-11 عبر الأسئلة الجوهرية الستة:

1. **Horizontal Bundling (الترابط الأفقي):** هل تتكامل الأهداف عبر المجالات لتشكل سلسلة تعلم وظيفية / دوراً وظيفياً (مثل: عامل, مستهلك مستقل, مشارك مجتمعي)؟
2. **Cross-Domain Integration (التكامل عبر المجالات):** هل تعمل أهداف المجالات الستة كمسار موحد لا كجزر معزولة؟
3. **Sequential Logic (التسلسل المنطقي):** هل يوجد تدرج منطقي من المهارات الفرعية إلى مهمة حياتية كاملة؟
4. **Observable Life Impact (الأثر الملموس):** هل ينتج عن التحقيق التراكمي للأهداف تحول ملموس في استقلالية المتعلم وجودة حياته اليومية؟
5. **Post-Graduation Readiness (الجاهزية لما بعد التخرج):** لمتعلم الانتقال, هل تدفع الأهداف نحو الأدوار البالغة (عامل موظف, مستخدم مواصلات, مدافع عن الذات, مدير وقت ومال)؟
6. **Scattered Goal Detection (كشف الأهداف المتفرقة):** هل توجد أهداف سليمة تقنياً فردياً لكنها لا تبني اتجاهاً وظيفياً متماسكاً؟

## JSON OUTPUT CONTRACT
أخرج كائن JSON واحداً بهذه المفاتيح الحرفية بالضبط:
- macro_plan_engineering: { integration_score_percent (0-100), target_functional_role, horizontal_analysis_6_questions: { q1_horizontal_bundling, q2_cross_domain_integration, q3_sequential_logic, q4_observable_life_impact, q5_post_graduation_readiness, q6_scattered_goals_detected }, macro_recommendation }
- micro_audit_summary: { student_name, age (رقم أو null), disability_type, total_goals_reviewed, quality_score_24_standards, plaafp_coverage_complete (boolean), unmapped_needs (مصفوفة نصوص) }
- revisions: مصفوفة عناصر { domain, original_goal, revised_goal, revision_category, rationale, standards_violated }
  - domain يجب أن يكون أحد: ${IEP_DOMAINS.join(" | ")}
  - revision_category يجب أن يكون أحد: ${REVISION_CATEGORIES.join(" | ")}
  - standards_violated: أسماء المعايير المخالفة (من معايير الجودة الـ 24 أو 13-7 إلى 13-11)
- checklist_24_standards_status: { pillar_1_plaafp, pillar_2_smart_goals, pillar_3_admin, pillar_4_transition, items_13_7_to_13_11_plan_engineering }
  - كل حقل: سطر حالة مختصر يبدأ بكلمة الحالة (مستوفٍ / مستوفٍ جزئياً / غير مستوفٍ) ثم مبرر موجز.

- need_goal_mapping: مصفوفة لكل احتياج مستخرج من مستوى الأداء الحالي { need, domain, covering_goal } حيث covering_goal نص الهدف الأصلي المغطي حرفياً أو null إن لم يُغطَّ. يجب أن تطابق الاحتياجات ذات null قائمة unmapped_needs.
- recommendations: مصفوفة توصيات تنفيذية مختصرة ومحددة لتحسين الخطة.
- quality_score_24_standards: درجة الجودة الكلية من 100.

اكتب جميع النصوص بالعربية, وكن محدداً وكمّياً في التبريرات.`;

export function buildUserPrompt(documentName: string, documentText: string) {
  return `راقب المستند التربوي الفردية التالي (اسم الملف: ${documentName}) ونفّذ المراجعة المزدوجة كاملة (المستوى الفردي + الهندسة الكلية) ثم أخرج التقرير في JSON وحيد مطابق للمخطط الصارم.

===== بداية المستند =====
${documentText}
===== نهاية المستند =====`;
}

/** القواعد الموحدة الكودية — تُفرض بعد التوليد لضمان التطابق 100% مع الشات */
export function applyUnifiedRuleParity(report: IepAuditReport) {
  let bannedStripped = 0;
  let criterionFixes = 0;

  const scrub = (text: string) => {
    let out = text;
    for (const word of BANNED_IMPLIED_WORDS) {
      while (out.includes(word)) {
        out = out.replace(word, "");
        bannedStripped += 1;
      }
    }
    // توحيد معيار القياس: منع دمج النسبة المئوية مع عدد المحاولات/الجلسات
    if (/\d+\s*٪|%/.test(out)) {
      const single = out.replace(
        /(\d+\s*(?:٪|%)[^،.؛]{0,40}?)\s*(?:و)?\s*(?:في|خلال)\s+\d+\s+(?:(?:محاولات?|جلسات?|فرص?)|من\s+(?:أصل)?\s*\d+\s*(?:محاولات?|جلسات?|فرص?))(?:\s+متتالية)?(?:\s+من\s+(?:أصل)?\s*\d+(?:\s+(?:محاولات?|جلسات?|فرص?))?)?/g,
        "$1",
      );
      if (single !== out) {
        criterionFixes += 1;
        console.log("[parity] criterion fix:\n  before:", out, "\n  after:", single);
      }
      out = single;
    }
    return out.replace(/\s{2,}/g, " ").trim();
  };

  const revisions = report.revisions.map((r) => ({
    ...r,
    revised_goal: scrub(r.revised_goal),
  }));

  return {
    report: { ...report, revisions },
    bannedStripped,
    criterionFixes,
  };
}

export async function runIepAudit(initialRunId: string | undefined, documentName: string, documentText: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new Error("لم يتم تهيئة مفتاح محرك الذكاء الاصطناعي على الخادم.");
  }

  const runIdFetch = createLovableAiGatewayRunIdFetch(initialRunId);
  const provider = createOpenAI({
    baseURL: `${GATEWAY_BASE_URL.replace(/\/+$/, "")}/v1`,
    apiKey,
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses(MODEL),
    system: IEP_SYSTEM_PROMPT,
    prompt: buildUserPrompt(documentName, documentText),
    output: Output.object({ schema: jsonSchema<IepAuditReport>(auditReportJsonSchema) }),
    providerOptions: {
      openai: {
        store: false,
        forceReasoning: true,
        // "low" keeps long plans well under the ~3-minute request ceiling
        reasoningEffort: "low",
        reasoningSummary: "auto",
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const parsed = await result.output;
  if (!parsed) {
    throw new Error("لم يُنتج المحرك مخرجات. أعد المحاولة.");
  }
  const validated = auditReportZodSchema.parse(parsed);
  return validated;
}
