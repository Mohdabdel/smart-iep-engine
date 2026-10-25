import { describe, expect, it } from "vitest";
import { buildUserPrompt, docsForKeys } from "@/lib/iep-audit.server";
import { defaultReviewConfig } from "@/lib/criteria-registry";

const docs = [
  { source: "formal_assessment", name: "ttap.pdf", text: "TTAP" },
  { source: "previous_plan", name: "prev.pdf", text: "PREV" },
  { source: "current_plan", name: "plan.pdf", text: "CURRENT PLAN TEXT" },
];

describe("cost controls", () => {
  it("sends each part only the documents it needs, current plan first", () => {
    expect(docsForKeys(docs, ["goal_review"]).map((d) => d.source)).toEqual(["current_plan"]);
    expect(docsForKeys(docs, ["revisions"]).map((d) => d.source)).toEqual(["current_plan"]);
    expect(docsForKeys(docs, ["daily_routines", "personal_social", "vertical_alignment"]).map((d) => d.source)).toEqual(["current_plan", "previous_plan"]);
    expect(docsForKeys(docs, ["student_info", "plan_inventory", "ttap_profile"]).map((d) => d.source)).toEqual(["current_plan", "formal_assessment"]);
    expect(docsForKeys(docs, ["criteria_results"]).map((d) => d.source)).toEqual(["current_plan", "previous_plan", "formal_assessment"]);
  });
  it("puts documents first so the shared prefix is identical across parts", () => {
    const cfg = defaultReviewConfig();
    const a = buildUserPrompt(cfg, docs, ["goal_review"]);
    const b = buildUserPrompt(cfg, docs, ["revisions"]);
    expect(a.startsWith("===== بداية مستند")).toBe(true);
    const shared = a.slice(0, a.indexOf("أخرج فقط المفاتيح"));
    expect(b.startsWith(shared)).toBe(true);
  });
});
