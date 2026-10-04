import { describe, expect, it } from "vitest";

import { activeCriteria, defaultReviewConfig } from "@/lib/criteria-registry";
import { buildScopedJsonSchema, emptyModelOutput, toReport, type ModelOutput } from "@/lib/iep-schema";
import { DATA_REQUIRED_TEXT, EXTERNAL_ATTESTATION_TEXT, applyReviewerParity } from "@/lib/iep-parity";
import { DEFAULT_REPORT_SECTIONS, buildReportBlocks, selectJson } from "@/lib/export-report";
import { IEP_SYSTEM_PROMPT } from "@/lib/iep-audit.server";

const finding = (id: string, status: ModelOutput["criteria_results"][number]["status"] = "غير مستوفى") => ({
  criterion_id: id,
  status,
  severity: "مهم" as const,
  evidence_text: "",
  source_document: "",
  page_or_section: "",
  reasoning_summary: "",
  recommended_action: "إضافة",
  evidence_origin: "unavailable" as const,
});
const revision = (revised_goal: string, keep = false) => ({
  domain: "التواصل الوظيفي" as const,
  goal_number: "1",
  original_goal: "x",
  defect_type: "",
  criterion_affected: "",
  rationale: "",
  revised_goal,
  technical_rule: "",
  priority: "مهم" as const,
  note: "",
  revision_category: "تحسين جودة الهدف" as const,
  measurement_type: "discrete task" as const,
  keep_assistance_wording: keep,
});

function build(partial: Partial<ModelOutput>, cfg = defaultReviewConfig()) {
  return applyReviewerParity(toReport({ ...emptyModelOutput(), ...partial }, cfg), cfg);
}

describe("reviewer engine parity", () => {
  it("TEST-01: keeps «عندما يطلب منه ذلك» as a valid performance condition", () => {
    const g = "أن يرتب الطالب أدواته عندما يطلب منه ذلك بنسبة 80% خلال الفصل الأول";
    expect(build({ revisions: [revision(g)] }).report.revisions[0]!.revised_goal).toContain("عندما يطلب منه ذلك");
    expect(IEP_SYSTEM_PROMPT).toContain("لا تعتبر \"عندما يطلب منه ذلك\" خللاً");
  });

  it("TEST-02/04: prompt evaluates functional conflict and forbids reverse need rule", () => {
    expect(IEP_SYSTEM_PROMPT).toContain("مبادرة تلقائية");
    expect(IEP_SYSTEM_PROMPT).toContain("لا يظهر مصدر هذا الهدف في المستند الحالي");
  });

  it("TEST-03: uncovered need without data gets a correction requirement, not an invented goal", () => {
    const r = build({ needs_coverage: [{ domain: "التواصل الوظيفي", need: "طلب المساعدة", matched_goal: "", coverage_status: "غير مغطى", note: "", suggested_goal: "" }] });
    expect(r.report.needs_coverage[0]!.suggested_goal).toBe(DATA_REQUIRED_TEXT);
  });

  it("TEST-05/06: externally attested evidence is not penalised nor claimed from the document", () => {
    const cfg = defaultReviewConfig();
    cfg.criteria["P1-2"] = { state: "active" };
    cfg.criteria["P1-7"] = { state: "active" };
    cfg.sources.formal_assessment = "external_verified";
    cfg.sources.family_input = "external_verified";
    const r = build({ criteria_results: [finding("P1-2"), finding("P1-7")] }, cfg);
    for (const f of r.report.criteria_results) {
      expect(f.status).toBe("مستوفى");
      expect(f.evidence_origin).toBe("external_reviewer_attestation");
      expect(f.evidence_text).toBe(EXTERNAL_ATTESTATION_TEXT);
    }
  });

  it("TEST-07: frozen criteria are excluded from findings and listed in the config section", () => {
    const cfg = defaultReviewConfig();
    expect(activeCriteria(cfg).some((c) => c.id === "P1-2")).toBe(false);
    const r = build({ criteria_results: [finding("P1-2"), finding("P2-1")] }, cfg);
    expect(r.report.criteria_results.map((f) => f.criterion_id)).toEqual(["P2-1"]);
    const block = buildReportBlocks(r.report).find((b) => b.id === "criteria_config")!;
    expect(block.table!.rows.find((row) => row[0] === "P1-2")![2]).toBe("مجمّد");
  });

  it("TEST-10/11: missing previous plan is not a gap; attached previous plan keeps vertical alignment", () => {
    const va = { available: true, comment: "امتداد", items: [{ previous_goal: "a", progress: "", current_goal: "b", next_step: "c", note: "" }] };
    expect(build({ vertical_alignment: va }).report.vertical_alignment.available).toBe(false);
    const cfg = defaultReviewConfig();
    cfg.sources.previous_plan = "attached";
    expect(build({ vertical_alignment: va }, cfg).report.vertical_alignment.items).toHaveLength(1);
  });

  it("TEST-12: no automatic safety recommendations or gates", () => {
    const r = build({ recommendations: ["مراعاة السلامة عند استخدام الفرن", "توحيد معيار القياس"] });
    expect(r.report.recommendations).toEqual(["توحيد معيار القياس"]);
    expect(IEP_SYSTEM_PROMPT).not.toMatch(/Safety Gate/);
  });

  it("implied words removed unless assistance level is the measured variable", () => {
    const r = build({ revisions: [revision("أن يلبس الطالب الحذاء بمفرده بنسبة 80%"), revision("أن يلبس الطالب الحذاء دون مساعدة في 3 جلسات", true)] });
    expect(r.report.revisions[0]!.revised_goal).not.toContain("بمفرده");
    expect(r.report.revisions[1]!.revised_goal).toContain("دون مساعدة");
  });

  it("critical gate prevents direct approval", () => {
    const r = build({ review_decision: "جاهزة للاعتماد", critical_gates: [{ gate: "هدف غير قابل للقياس", description: "الهدف 3", evidence_text: "" }] });
    expect(r.report.review_decision).toBe("تحتاج إعادة مراجعة بعد التصحيح");
  });
});

describe("report sections & scope", () => {
  it("TEST-14: JSON export contains only selected sections", () => {
    const report = build({ recommendations: ["أ"], executive_summary: "موجز" }).report;
    const out = selectJson(report, { ...DEFAULT_REPORT_SECTIONS, recommendations: false });
    expect(out["recommendations"]).toBeUndefined();
    expect(out["executive_summary"]).toBe("موجز");
    expect(buildReportBlocks(report, { ...DEFAULT_REPORT_SECTIONS, executive: false }).some((b) => b.id === "executive")).toBe(false);
  });

  it("scoped schema only requests keys for the chosen review type", () => {
    const props = Object.keys(buildScopedJsonSchema("quality").properties!);
    expect(props).toContain("criteria_results");
    expect(props).not.toContain("whole_plan");
  });
});
