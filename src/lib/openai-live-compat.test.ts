// LIVE compatibility check for a direct OpenAI model (IEP_AI_PROVIDER=openai).
// Skipped unless OPENAI_LIVE_CHECK=1. Runs the real review code path
// (runIepAudit -> provider.responses(model) + strict JSON schema + reasoning
// options) on a SYNTHETIC plan. Prompts, criteria and schema are untouched.
// The API key comes from the environment only and is never printed.
import { describe, expect, it } from "vitest";

import { defaultReviewConfig } from "./criteria-registry";
import { runIepAudit, type SupportingDoc } from "./iep-audit.server";
import { modelOutputZ, partsForReviewType, type ModelKey } from "./iep-schema";

const LIVE = process.env["OPENAI_LIVE_CHECK"] === "1";
const MODEL = process.env["IEP_OPENAI_MODEL"] ?? "";

// Entirely fictional plan. No real learner, school or person.
const SYNTHETIC_PLAN: SupportingDoc = {
  source: "current_plan",
  name: "synthetic-iep-plan.txt",
  text: [
    "خطة تربوية فردية — نموذج اصطناعي للاختبار فقط",
    "اسم المتعلم: متعلم اصطناعي (س)",
    "العمر: 15 سنة",
    "نوع الإعاقة: إعاقة ذهنية بسيطة",
    "المركز: مركز اختباري افتراضي",
    "مستوى الأداء الحالي: يتعرف على 10 كلمات وظيفية مكتوبة من بيئة المطبخ بدقة 60% في 3 جلسات متتالية. يعدّ النقود حتى 20 درهماً بمساعدة لفظية.",
    "نقاط القوة: يتبع تعليمات من خطوتين، يحب العمل اليدوي.",
    "الاحتياجات: قراءة كلمات السلامة، استخدام النقود في الشراء.",
    "الهدف السنوي 1: سيقرأ المتعلم 20 كلمة وظيفية من بيئة المطبخ بدقة 90% في 4 من 5 جلسات بنهاية العام الدراسي.",
    "الهدف قصير المدى 1-1: سيقرأ 15 كلمة وظيفية بدقة 80% في 3 من 4 جلسات خلال الفصل الأول.",
    "الهدف السنوي 2: سيدفع المتعلم ثمن مشتريات بقيمة حتى 50 درهماً في متجر المدرسة باستقلالية في 4 من 5 محاولات.",
    "الانتقال: يرغب المتعلم في العمل في مطبخ تجاري؛ تدريب أسبوعي في مقصف المدرسة.",
    "طريقة القياس: سجل ملاحظة مباشرة أسبوعي.",
  ].join("\n"),
};

describe.skipIf(!LIVE)(`OpenAI direct model compatibility: ${MODEL || "(IEP_OPENAI_MODEL unset)"}`, () => {
  it("has the direct-provider configuration", () => {
    expect(process.env["IEP_AI_PROVIDER"]).toBe("openai");
    expect(process.env["OPENAI_API_KEY"], "OPENAI_API_KEY must be provided via CI secret").toBeTruthy();
    expect(MODEL).not.toBe("");
  });

  const config = defaultReviewConfig(); // full review, default criteria — unchanged
  const parts = partsForReviewType(config.review_type);

  for (const keys of parts) {
    it(
      `part [${keys.join(", ")}]: Responses API + strict JSON schema + low reasoning, store:false`,
      async () => {
        const started = Date.now();
        const out = await runIepAudit(config, [SYNTHETIC_PLAN], keys as ModelKey[]);
        const seconds = (Date.now() - started) / 1000;
        for (const k of keys) expect(out, `missing key ${k}`).toHaveProperty(k);
        const pick = Object.fromEntries(keys.map((k) => [k, true])) as Partial<Record<ModelKey, true>>;
        const parsed = modelOutputZ.pick(pick as never).safeParse(out);
        expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);
        // Parts must stay well under the ~3-minute request ceiling used in production.
        expect(seconds, `part took ${seconds}s`).toBeLessThan(170);
        console.log(`[compat] ${MODEL} part ${keys.join("+")} ok in ${seconds.toFixed(1)}s`);
      },
      200_000,
    );
  }
});
