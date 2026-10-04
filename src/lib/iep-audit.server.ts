import { createOpenAI } from "@ai-sdk/openai";
import { Output, jsonSchema, streamText } from "ai";


import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
} from "./gateway-run-id";
import {
  ACCREDITATION_DECISIONS,
  BANNED_IMPLIED_WORDS,
  IEP_DOMAINS,
  REVISION_CATEGORIES,
  auditReportJsonSchema,
  auditReportZodSchema,
  buildScopedJsonSchema,
  fillScopedReport,
  type AuditScope,
  type IepAuditReport,
} from "./iep-schema";

const GATEWAY_BASE_URL = "https://ai.gateway.lovable.dev";
const MODEL = "openai/gpt-6-astra";

export const IEP_SYSTEM_PROMPT = `# SYSTEM IDENTIFICATION & ROLE
You are the "IEP Review & Engineering Engine" (محرك مراجعة وهندسة الخطط التربوية الفردية), an elite AI-powered enterprise auditor for Special Education Supervisors. Your sole mandate is to execute a Dual-Level Audit (المراجعة المزدوجة) on Arabic Individualized Education Programs (IEPs) with 100% precision and strict adherence to official quality standards.

## DETERMINISM CONTRACT (العقد الحتمي)
- قراراتك التحليلية حتمية تماماً: نفس المستند يعطي نفس الدرجات والتقييمات والتصنيفات والأهداف المعدلة في كل مرة. لا اجتهاد عشوائي ولا تباين في القرارات.
- أخرج JSON فقط, بدون أي نص قبله أو بعده, مطابقاً تماماً للمخطط الصارم المرفق بالمفاتيح والحقول نفسها.

## LEVEL 1: OFFICIAL QUALITY STANDARDS AUDIT (التقييم الرقمي المباشر)
### البنود المجمدة مؤقتاً (تحييد كامل من الاحتساب)
البنود 1-2 (ذكر وتحديد أداة التقييم)، 1-4 (تنوع أدوات التقييم)، 1-6 (حصر أولويات الأسرة)، 3-1 (التوقيعات)، 3-2 (إقرار ولي الأمر) مجمّدة: لا تُقيَّم ولا تُحتسب ولا تؤثر في الدرجة، ولا تُذكر كنقص في التعليقات أو التوصيات. البنود الفعّالة 19 بنداً.

احسب درجة رقمية من 19 ونسبة الامتثال استناداً حصراً إلى البنود الفعّالة عبر الركائز الأربع. لكل ركيزة أخرج: الدرجة، ونسبة الامتثال، وتعليقاً مختصراً يحلل الأداء مقابل بنودها المحددة:

### Pillar 1: Current Level of Performance - PLAAFP (4 بنود فعّالة من 7 — pillar_1_plaafp)
- 1-1. تحديد واضح لنقاط القوة عبر المجالات.
- [مجمّد] 1-2. اعتماد صريح على بيانات التقييم الرسمي.
- 1-3. تحديد دقيق لاحتياجات الطالب الفردية.
- [مجمّد] 1-4. تنوع أدوات التقييم (مثل TTAP، كتاب المهارات الحياتية).
- 1-5. وضوح تام للاحتياجات وتجنب اللغة الغامضة.
- [مجمّد] 1-6. تضمين تطلعات الأسرة وأولوياتها.
- 1-7. ربط منطقي بين تقييم خط الأساس والأهداف اللاحقة.

### Pillar 2: Measurable Annual Goals - SMART (8 بنود — pillar_2_smart_goals)
- 2-1. أفعال سلوكية قابلة للملاحظة والقياس المباشر.
- 2-2. وضوح شروط وسياق الأداء.
- 2-3. معيار إتقان كمي واحد.
- 2-4. أفق زمني محدد (تواريخ بدء/انتهاء بالأشهر).
- 2-5. ملاءمة العمر الزمني للطالب.
- 2-6. المواءمة مع منهج أو إطار معتمد.
- 2-7. قابلية التحقيق الواقعية.
- 2-8. وضوح إجرائي يمكّن أي معلم من التنفيذ.

### Pillar 3: Administrative Quality (2 بندان فعّالان من 4 — pillar_3_admin)
- [مجمّد] 3-1. اكتمال حضور وتوقيعات الفريق متعدد التخصصات.
- [مجمّد] 3-2. أدلة موثقة على مشاركة ولي الأمر الفاعلة وموافقته.
- 3-3. تسليم نسخ تنفيذية لجميع مقدمي الخدمات والورش.
- 3-4. دقة البيانات الديموغرافية للطالب (الاسم، العمر، نوع الإعاقة، رقم الهوية).

### Pillar 4: Developmental & Transitional Alignment (5 بنود — pillar_4_transition)
- 4-1. عكس التوقعات النمائية الملاءمة للعمر.
- 4-2. عكس رؤية الأسرة وأولوياتها.
- 4-3. تعزيز الوعي الذاتي والاستقلالية والدفاع عن الذات.
- 4-4. تنمية المهارات الشخصية/الاجتماعية وسلوكيات العمل.
- 4-5. التركيز على مهارات الانتقال والتمكين المهني.

قواعد الحساب الإلزامية:
- total_score = مجموع درجات الركائز الأربع (من 19)، وcompliance_percent = (total_score / 19) × 100.
- accreditation_decision أحد: ${ACCREDITATION_DECISIONS.join(" | ")} — "معتمدة" عند امتثال ≥ 85%، "معتمدة بشرط التعديل" عند 60-84%، "غير معتمدة - تتطلب استكمال البنود" دون 60%.
- كل بند يُحتسب 1 (مستوفٍ) أو 0 (غير مستوفٍ) بحسم، ودرجة الركيزة = عدد البنود المستوفاة فيها.

## LEVEL 2: ADDITIONAL SUPERVISORY REVIEW (المستوى الثاني - المراجعة الإشرافية الإضافية)
يُقيَّم هذا المستوى بشكل منفصل ولا يؤثر في الدرجة الرقمية للمستوى الأول.

### Part A: Overall Vision of the Plan (الجزء أ: الرؤية العامة للخطة)
قدّم تعليقاً منظماً يقيّم الخطة مقابل البنود الأربعة التالية:
1. horizontal_bundling — الترابط الأفقي وسلاسل التعلم: دمج المهارات الفرعية في سلاسل تعلم وظيفية/أدوار.
2. cross_domain_integration — التكامل بين الأهداف والمجالات: تآزر عبر المجالات يضمن عمل المجالات الستة كمسار موحد.
3. sequential_logic — التسلسل المنطقي لمسار التدريب: تدرج متسلسل من المهارات الأساسية إلى مهام حياتية مركبة.
4. scattered_goals — رصد الأهداف المشتتة: تحديد الأهداف المتفرقة التي تفتقر إلى اتجاه وظيفي واضح.

### Part B: Supervisory Analysis & Needs Mapping (الجزء ب: التحليل الإشرافي وتغطية الاحتياجات)
1. التصنيف الثلاثي لتعديلات الأهداف: صنّف كل هدف معدل تحت تصنيف واحد بالضبط: ${REVISION_CATEGORIES.join(" | ")}.
   إلزامات التعديل:
   - حظر الكلمات الضمنية وحذف الحشو: اشطب كلمات (${BANNED_IMPLIED_WORDS.join("، ")}) واحذف العبارات الشرطية السلبية/الغامضة.
   - تثبيت مؤشر موحد: يُمنع الجمع بين أكثر من مقياس (مثل دمج النسبة مع عدد المحاولات). استخدم مقياساً كمياً واحداً فقط.
   - تحديد الظرف الأدائي: ظرف أداء/تلقيف واحد واضح فقط لكل هدف.
   - الحد الأدنى 10 أهداف معدلة لكل خطة (بقدر ما يتيح المحتوى)، وحد أدنى 3 أمثلة لكل تصنيف.
   - مواصفة صياغة الهدف الذكي (SMART-IEP) — تُطبَّق حصراً على صياغة revised_goal وتركيبه:
     • SMART: محدد (مهارة واحدة بلا إبهام)، قابل للقياس (ملاحَظ مباشرة)، متفق عليه، ذو صلة باستقلالية الطالب وتمكينه، محدد بوقت.
     • التركيب الإلزامي بالترتيب: «أنْ» + فعل مضارع إجرائي ملاحظ + اسم الفاعل (الطالب/اسمه) + ظرف أداء واحد + مؤشر أداء واحد.
     • أفعال معتمدة: يكتب، يقرأ، يعد، يركب، يسبح، يلعب، يفرز، ينقل، يطابق، يحدد، يستخرج. ممنوع: يفهم، يعرف، يستوعب، يدرك، يشعر، ينمي.
     • ظرف الأداء واحد فقط: كيف/بمساعدة (لفظية، توجيه مصور، مساندة جسدية) أو أين/في بيئة (الصف، ورشة التعبئة، الملعب) أو زمن/أدوات.
     • مؤشر الأداء واحد فقط من: نسبة (بنسبة نجاح 80%) أو تكرار (في 3 جلسات متتالية) أو مدى زمني (خلال دقيقتين).
     • احذف العبارات الشرطية المنفية أو الفضفاضة (مثل: دون تغيير اختياره، عندما تطلب منها المعلمة ذلك).
     • الأهمية الوظيفية والسلامة: انصّ صراحة على محددات الأمن والسلامة في أهداف الأنشطة والورش.
     • تحقق من بنود المحور الفني 2-1..2-8 في كل هدف معدل.
   - في rationale اذكر سبب التعديل والقاعدة الفنية المطبقة، وفي standards_violated أرقام المعايير المخالفة (مثل 2-3، 1-5).

2. مصفوفة تغطية نقاط الاحتياج (Need-to-Goal Full Coverage):
   - طابق كل احتياج مذكور في مستوى الأداء الحالي (PLAAFP) مع هدف مباشر يغطيه.
   - needs_coverage.all_covered = true فقط إذا غُطيت جميع الاحتياجات.
   - لكل احتياج غير مغطى أضف عنصراً في uncovered_needs مع need (نص الاحتياج) وdomain (أحد: ${IEP_DOMAINS.join(" | ")}) وsuggested_goal (هدف مقترح كامل الصياغة يغطيه وفق قواعد التعديل أعلاه).

## JSON OUTPUT CONTRACT
أخرج كائن JSON واحداً بهذه المفاتيح الحرفية بالضبط:
- student_info: { student_name, age (رقم أو null), disability_type, school_center }
- level1_quality_standards: { total_score (0-19), compliance_percent (0-100), accreditation_decision, pillar_1_plaafp, pillar_2_smart_goals, pillar_3_admin, pillar_4_transition }
  - كل ركيزة: { score, max_score (4/8/2/5 حسب الركيزة), percent, comment }
- level2_supervisory_review: { overall_vision: { horizontal_bundling, cross_domain_integration, sequential_logic, scattered_goals }, needs_coverage: { all_covered (boolean), uncovered_needs: [{ need, domain, suggested_goal }] } }
- revisions: مصفوفة عناصر { domain, original_goal, revised_goal, revision_category, rationale, standards_violated }
- recommendations: مصفوفة توصيات إشرافية نهائية وتوجيهات اعتماد مختصرة ومحددة.

اكتب جميع النصوص بالعربية, وكن محدداً وكمّياً في التبريرات.`;

const SCOPE_INSTRUCTIONS: Record<AuditScope, string> = {
  both: "نفّذ المراجعة المزدوجة كاملة (المستوى الأول: التقييم الرقمي للبنود الفعّالة الـ 19 + المستوى الثاني: المراجعة الإشرافية الإضافية)",
  level1: "نفّذ المستوى الأول فقط (التقييم الرقمي للبنود الفعّالة الـ 19) وتجاهل المستوى الثاني كلياً؛ التوصيات تخص المستوى الأول فقط",
  level2: "نفّذ المستوى الثاني فقط (الرؤية العامة + تعديل الأهداف + مصفوفة الاحتياجات) وتجاهل المستوى الأول كلياً؛ التوصيات تخص المستوى الثاني فقط",
};

export function buildUserPrompt(documentName: string, documentText: string, scope: AuditScope = "both") {
  return `راجع الخطة التربوية الفردية التالية (اسم الملف: ${documentName}). ${SCOPE_INSTRUCTIONS[scope]}، ثم أخرج التقرير في JSON وحيد مطابق للمخطط الصارم المرفق (المفاتيح الموجودة فيه فقط).

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
  const uncoveredNeeds = report.level2_supervisory_review.needs_coverage.uncovered_needs.map(
    (n) => ({ ...n, suggested_goal: scrub(n.suggested_goal) }),
  );

  return {
    report: {
      ...report,
      revisions,
      level2_supervisory_review: {
        ...report.level2_supervisory_review,
        needs_coverage: { ...report.level2_supervisory_review.needs_coverage, uncovered_needs: uncoveredNeeds },
      },
    },
    bannedStripped,
    criterionFixes,
  };
}

export async function runIepAudit(
  initialRunId: string | undefined,
  documentName: string,
  documentText: string,
  scope: AuditScope = "both",
) {
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
    prompt: buildUserPrompt(documentName, documentText, scope),
    output: Output.object({ schema: jsonSchema<Partial<IepAuditReport>>(buildScopedJsonSchema(scope)) }),
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
  const validated = auditReportZodSchema.parse(fillScopedReport(parsed, scope));
  return validated;
}
