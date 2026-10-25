import { describe, expect, it } from "vitest";
import { computeTtapPatterns } from "@/lib/ttap-profile";
import { defaultReviewConfig } from "@/lib/criteria-registry";
import { emptyModelOutput, toReport } from "@/lib/iep-schema";
import { buildReportBlocks, decisionNotIssued } from "@/lib/export-report";
import { buildPartContext } from "@/lib/review-orchestrator";
import { contextBlock } from "@/lib/iep-audit.server";

const a = (area: string, dp: number, hp: number, sp: number, de = 0, he = 0, se = 0) => ({ area, do_pass: dp, do_emerge: de, home_pass: hp, home_emerge: he, school_pass: sp, school_emerge: se });
// أرقام نموذج حقيقي مجهول الهوية
const profile = { detected: true, areas: [a("VS", 5, 1, 4, 5, 6, 6), a("VB", 8, 1, 2, 4, 7, 5), a("IF", 2, 2, 3, 1, 7, 2), a("LS", 4, 2, 0, 2, 5, 11), a("FC", 1, 2, 3, 6, 4, 4)] };

describe("TTAP profile reading", () => {
  it("derives patterns deterministically from the numbers", () => {
    const p = computeTtapPatterns(profile);
    expect(p.map((x) => x.ref)).toEqual(["ت1", "ت2", "ت3", "ت4", "ت5"]);
    expect(p.find((x) => x.area === "VB")!.pattern).toBe("الأداء المباشر أعلى من المنزل والمدرسة");
    expect(p.find((x) => x.area === "VS")!.pattern).toBe("المنزل أدنى من الأداء المباشر أو المدرسة");
    expect(p.find((x) => x.area === "IF")!.pattern).toBe("منخفض في المقاييس الثلاثة");
    expect(p.find((x) => x.area === "LS")!.interpretation).toContain("المدرسة (11)");
    expect(computeTtapPatterns({ detected: false, areas: [] })).toEqual([]);
  });
  it("flows patterns to analytic prompts and renders the report section", () => {
    const ctx = buildPartContext({ ttap_profile: profile });
    expect(contextBlock(["needs_coverage", "assessment_alignment"], ctx)).toContain("ت2");
    const r = toReport({ ...emptyModelOutput(), ttap_profile: profile, assessment_alignment: [{ ref: "ت1", plaafp_reflection: "x", goal_refs: ["هـ2"], status: "معالج جزئياً", note: "", suggested_chain: "" }] }, defaultReviewConfig());
    const b = buildReportBlocks(r).find((x) => x.id === "assessment_profile")!;
    expect(b.table!.rows[0]![6]).toBe("هـ2");
  });
  it("marks a missing final stage as decision not issued", () => {
    const r = toReport(emptyModelOutput(), defaultReviewConfig());
    expect(decisionNotIssued(r)).toBe(true);
    expect(buildReportBlocks(r).find((x) => x.id === "decision")!.lines[0]).toContain("لم يصدر القرار");
  });
});

import { activeCriteria } from "@/lib/criteria-registry";
import { assessmentAdequacy } from "@/lib/assessment-adequacy";
describe("assessment criteria and adequacy", () => {
  it("assessment criteria activate only when an assessment is attached", () => {
    const cfg = defaultReviewConfig();
    expect(activeCriteria(cfg).some((c) => c.id === "P1-9")).toBe(false);
    cfg.sources.formal_assessment = "attached";
    const ids = activeCriteria(cfg).map((c) => c.id);
    for (const id of ["P1-2", "P1-9", "P1-10", "P1-11", "P2-13", "P4-11"]) expect(ids).toContain(id);
  });
  it("judges TTAP as age-appropriate but recommends interests and self-determination tools", () => {
    const cfg = defaultReviewConfig();
    cfg.sources.formal_assessment = "attached";
    const a = assessmentAdequacy(cfg, profile);
    expect(a.rows[0]!.status).toBe("مغطى");
    expect(a.rows.find((r) => r.aspect.includes("التفضيلات"))!.status).toBe("غير مغطى");
    expect(a.recommendations.join(" ")).toContain("ميول");
    expect(a.rows.find((r) => r.aspect.includes("الأسرة"))!.covered_by).toContain("TTAP");
  });
  it("old saved configs without new sources still work", () => {
    const cfg = defaultReviewConfig();
    delete (cfg.sources as Record<string, unknown>)["interest_inventory"];
    expect(() => assessmentAdequacy(cfg, null)).not.toThrow();
  });
});
