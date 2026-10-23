import { describe, expect, it } from "vitest";
import { defaultReviewConfig } from "@/lib/criteria-registry";
import { partStage, partsForReviewType, type ModelKey } from "@/lib/iep-schema";
import { initialParts, runParts, type PartContext } from "@/lib/review-orchestrator";
import { contextBlock } from "@/lib/iep-audit.server";

const inv = { goals: [{ ref: "هـ1", goal_number: "1", domain: "التواصل", text: "أن يطلب المساعدة" }], needs: [{ ref: "ح1", need: "طلب المساعدة" }] };

describe("M-6/M-7 staged review", () => {
  it("runs inventory first, analytic parts with the inventory, and synthesis last with the digest", async () => {
    const order: number[] = [];
    const seen: Record<string, PartContext> = {};
    await runParts({
      parts: initialParts(partsForReviewType("supervisory")),
      onUpdate: () => {},
      run: async (keys: ModelKey[], ctx) => {
        order.push(partStage(keys));
        seen[keys.join("+")] = ctx;
        if (keys.includes("plan_inventory")) return { plan_inventory: inv };
        if (keys.includes("goal_review")) return { goal_review: { goals: [{ goal_number: "هـ1", domain: "", goal_text: "x", verdict: "سليم" as const, issue: "" }], recurring_patterns: [] } };
        return {};
      },
    });
    expect(order[0]).toBe(0);
    expect(order[order.length - 1]).toBe(2);
    expect([...order].sort()).toEqual(order);
    const goalCtx = Object.entries(seen).find(([k]) => k.includes("goal_review"))![1];
    expect(goalCtx.plan_inventory?.goals[0]?.ref).toBe("هـ1");
    const synth = Object.entries(seen).find(([k]) => k.includes("review_decision"))![1];
    expect(JSON.stringify(synth.digest)).toContain("سليم");
  });

  it("prompt carries the inventory to analytic parts and the digest only to the decision part", () => {
    const ctx: PartContext = { plan_inventory: inv, digest: { goal_review: { goals: [] } } };
    expect(contextBlock(["goal_review"], ctx)).toContain("هـ1");
    expect(contextBlock(["goal_review"], ctx)).not.toContain("خلاصة نتائج");
    expect(contextBlock(["review_decision", "top_priorities"], ctx)).toContain("(المرجع:");
    expect(contextBlock(["plan_inventory"], ctx)).toBe("");
    void defaultReviewConfig;
  });
});

import { checkReportConsistency } from "@/lib/consistency-check";
import { emptyModelOutput, toReport } from "@/lib/iep-schema";

describe("M-6/M-7 consistency alerts", () => {
  it("flags goals missing from the review and priorities without references", () => {
    const r = toReport(
      {
        ...emptyModelOutput(),
        plan_inventory: { goals: [inv.goals[0]!, { ref: "هـ2", goal_number: "2", domain: "", text: "y" }], needs: [] },
        goal_review: { goals: [{ goal_number: "هـ1", domain: "", goal_text: "أن يطلب المساعدة في 4 من 5 فرص", verdict: "سليم", issue: "" }], recurring_patterns: [] },
        top_priorities: ["توضيح مستوى الأداء (المرجع: مراجعة مستوى الأداء الحالي)", "تحسين الأهداف"],
      },
      defaultReviewConfig(),
    );
    const a = checkReportConsistency(r);
    expect(a.find((x) => x.code === "C-INV")!.message).toContain("هـ2");
    expect(a.find((x) => x.code === "C-REF")!.message).toContain("1 أولويات");
  });
});
