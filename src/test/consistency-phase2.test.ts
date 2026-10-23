import { describe, expect, it } from "vitest";
import { defaultReviewConfig } from "@/lib/criteria-registry";
import { emptyModelOutput, toReport, type ModelOutput } from "@/lib/iep-schema";
import { applyReviewerParity } from "@/lib/iep-parity";
import { checkGoalWording, checkReportConsistency } from "@/lib/consistency-check";
import { buildReportBlocks, DEFAULT_REPORT_SECTIONS, selectJson } from "@/lib/export-report";

const build = (p: Partial<ModelOutput>) => {
  const cfg = defaultReviewConfig();
  return applyReviewerParity(toReport({ ...emptyModelOutput(), ...p }, cfg), cfg).report;
};
const goal = (n: string, verdict: "سليم" | "يحتاج تعديل" | "تعذر الحكم", goal_text: string) => ({ goal_number: n, domain: "", goal_text, verdict, issue: "" });

describe("M-4 wording checker", () => {
  it("flags repeated word, stacked criteria, missing denominator, vague verb", () => {
    expect(checkGoalWording("أن يكمل المهمة بنجاح ناجحة ناجحة بنسبة 80%").join()).toContain("تكرار");
    expect(checkGoalWording("أن يرتب أدواته بنسبة 80% ويغسل يديه بنسبة 90%").join()).toContain("أكثر من معيار");
    expect(checkGoalWording("أن يطلب المساعدة في 4 محاولات").join()).toContain("بلا مقام");
    expect(checkGoalWording("أن يتعرف على الألوان").join()).toContain("يتعرف على");
  });
  it("accepts a well-formed goal", () => {
    expect(checkGoalWording("أن يطلب الطالب المساعدة لفظياً في 4 من 5 فرص خلال الفصل الأول")).toEqual([]);
  });
});

describe("M-5 consistency checker", () => {
  it("alerts on ready decision with substantial PLAAFP gap but never changes the decision", () => {
    const r = build({
      review_decision: "جاهزة بعد تعديلات محدودة",
      plaafp_assessment: { ...emptyModelOutput().plaafp_assessment, judgment: "يحتاج تحسيناً جوهرياً" },
    } as Partial<ModelOutput>);
    const a = checkReportConsistency(r);
    expect(a.map((x) => x.code)).toContain("C-PLAAFP");
    expect(r.review_decision).toBe("جاهزة بعد تعديلات محدودة");
    const block = buildReportBlocks(r, DEFAULT_REPORT_SECTIONS).find((b) => b.id === "consistency");
    expect(block?.table?.rows.length).toBeGreaterThan(0);
    expect(selectJson(r, DEFAULT_REPORT_SECTIONS)).toHaveProperty("consistency_alerts");
  });
  it("flags sound goals with wording issues and duplicate goal numbers", () => {
    const r = build({ goal_review: { goals: [goal("1", "سليم", "أن يتعرف على الألوان"), goal("1", "يحتاج تعديل", "x 1")], recurring_patterns: [] } } as Partial<ModelOutput>);
    const codes = checkReportConsistency(r).map((x) => x.code);
    expect(codes).toContain("W-SOUND");
    expect(codes).toContain("C-DUP");
  });
});

describe("M-4 number words", () => {
  it("accepts criteria written in words or Arabic-Indic digits", () => {
    expect(checkGoalWording("أن يعيد الأدوات لمكانها من خلال أربع محاولات صحيحة من أصل خمس محاولات")).toEqual([]);
    expect(checkGoalWording("أن يطلب المساعدة بنسبة ٨٠٪ خلال الفصل")).toEqual([]);
  });
});

describe("M-4 spelling variants", () => {
  it("accepts «اصل» without hamza and percentage criteria", () => {
    expect(checkGoalWording("أن يرمي الكرة في اربع محاولات صحيحة من اصل خمس محاولات")).toEqual([]);
    expect(checkGoalWording("أن يسلم باليد بنسبة نجاح 80% من عدد المرات")).toEqual([]);
  });
});
