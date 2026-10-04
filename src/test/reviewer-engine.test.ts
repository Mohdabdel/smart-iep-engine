import { describe, expect, it } from "vitest";

import { activeCriteria, defaultReviewConfig } from "@/lib/criteria-registry";
import { TRANSITION_CONCEPTS, buildScopedJsonSchema, emptyModelOutput, toReport, type ModelOutput } from "@/lib/iep-schema";
import { POTENTIAL_CONTEXT_STATUS } from "@/lib/functional-context-registry";
import { DATA_REQUIRED_TEXT, EXTERNAL_ATTESTATION_TEXT, NO_GOAL_REVISIONS_TEXT, SEPARATION_CONSTRAINT_TEXT, applyReviewerParity, goalReviewCounts, transitionStats } from "@/lib/iep-parity";
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

describe("supervisory review upgrade", () => {
  const sup = () => {
    const c = defaultReviewConfig();
    c.review_type = "supervisory";
    return c;
  };
  const goal = (n: string, verdict: "سليم" | "يحتاج تعديل" | "تعذر الحكم", text = "أن يرتب الطالب أدواته") => ({ goal_number: n, domain: "التواصل الوظيفي", goal_text: text, verdict, issue: "" });
  const blocks = (r: ReturnType<typeof build>["report"]) => buildReportBlocks(r);
  const block = (r: ReturnType<typeof build>["report"], id: string) => blocks(r).find((b) => b.id === id);

  it("supervisory type always requests the four mandatory layers", () => {
    const props = Object.keys(buildScopedJsonSchema("supervisory").properties!);
    for (const k of ["goal_review", "needs_coverage", "whole_plan", "transition_coverage", "plaafp_assessment", "functional_contexts", "revisions"]) expect(props).toContain(k);
  });

  it("TEST-A: sound goals give an explicit no-revision statement and counts", () => {
    const r = build({ goal_review: { goals: [goal("1", "سليم"), goal("2", "سليم")], recurring_patterns: [] } }, sup()).report;
    const b = block(r, "goal_review")!;
    expect(b.lines[0]).toBe(NO_GOAL_REVISIONS_TEXT);
    expect(b.lines.join(" ")).toContain("السليمة صياغياً: 2");
  });

  it("TEST-B: non-operational verb goal needs revision with Before & After", () => {
    const r = build(
      { goal_review: { goals: [goal("1", "سليم"), goal("3", "سليم", "أن يفهم الطالب التعليمات")], recurring_patterns: [] }, revisions: [{ ...revision("أن ينفذ الطالب التعليمات المصورة"), goal_number: "3", original_goal: "أن يفهم الطالب التعليمات" }] },
      sup(),
    ).report;
    expect(goalReviewCounts(r).needs).toBe(1);
    expect(block(r, "goal_review")!.lines[0]).toBe("رُصدت 1 أهداف تحتاج تعديلًا في الصياغة.");
    expect(block(r, "before_after")!.table!.rows[0]![2]).toBe("أن يفهم الطالب التعليمات");
  });

  it("TEST-C: failed strength/need separation constrains only dependent judgments", () => {
    const pa = { ...emptyModelOutput().plaafp_assessment, separation_extracted: false, judgment: "غير قابل للتحقق" as const };
    const r = build({ plaafp_assessment: pa, goal_review: { goals: [goal("1", "سليم")], recurring_patterns: [] }, transition_coverage: [{ concept: "التواصل الوظيفي", status: "مغطى", supporting_goals: ["1"], note: "", improvement: "" }] }, sup()).report;
    expect(r.plaafp_assessment.constrained_judgments[0]).toBe(SEPARATION_CONSTRAINT_TEXT);
    expect(block(r, "goal_review")).toBeDefined();
    expect(block(r, "transition_matrix")).toBeDefined();
  });

  it("TEST-D/E: undocumented invested context becomes a potential opportunity; documented one stays invested", () => {
    const r = build(
      {
        functional_contexts: {
          invested: [
            { context: "نشاط السباحة", goals: ["4"], how: "تغيير الملابس", quality: "مقبول", evidence_text: "بعد العودة من السباحة" },
            { context: "التسوق", goals: ["5"], how: "", quality: "محدود", evidence_text: "" },
          ],
          potential: [{ bank_id: "FC-11", context: "المقصف المدرسي", rationale: "أهداف اختيار وشراء", integrable_goals: ["5"] }, { bank_id: "X", context: "مخترع", rationale: "", integrable_goals: [] }],
        },
      },
      sup(),
    ).report;
    expect(r.functional_contexts.invested.map((i) => i.context)).toEqual(["نشاط السباحة"]);
    expect(r.functional_contexts.potential.map((p) => p.context)).toEqual(["المقصف المدرسي", "التسوق"]);
    expect(block(r, "potential_contexts")!.table!.rows[0]![3]).toBe(POTENTIAL_CONTEXT_STATUS);
  });

  it("TEST-F: transition matrix fills all concepts, applies NA, gives percentage and improvements", () => {
    const cfg = sup();
    cfg.transition_applicability = { "التنقل": "na" };
    const r = build(
      {
        transition_coverage: [
          { concept: "التواصل الوظيفي", status: "مغطى", supporting_goals: ["1"], note: "", improvement: "x" },
          { concept: "إدارة الوقت والروتين", status: "مغطى جزئياً", supporting_goals: ["2"], note: "", improvement: "ربط المنبه بسلسلة إنهاء المهمة" },
          { concept: "المشاركة المجتمعية", status: "غير مغطى", supporting_goals: [], note: "", improvement: "استثمار الأنشطة خارج المركز" },
        ],
      },
      cfg,
    ).report;
    expect(r.transition_coverage).toHaveLength(TRANSITION_CONCEPTS.length);
    expect(r.transition_coverage.find((t) => t.concept === "التنقل")!.status).toBe("لا ينطبق");
    expect(r.transition_coverage.find((t) => t.concept === "التواصل الوظيفي")!.improvement).toBe("");
    const ts = transitionStats(r);
    expect(ts.mode).toBe("actual");
    expect(ts.covered + ts.partial).toBe(2);
    expect(block(r, "transition_improvements")!.lines.join(" ")).toContain("ربط المنبه");
    const desc = transitionStats(build({ transition_coverage: r.transition_coverage.filter((t) => t.concept !== "التنقل") }, sup()).report);
    expect(desc.mode).toBe("descriptive");
    expect(desc.label).toContain("نسبة تغطية وصفية وليست قرار اعتماد");
  });

  it("TEST-G: decision brief shows goal counts, PLAAFP judgment, clusters and transition ratio", () => {
    const r = build(
      {
        goal_review: { goals: [goal("1", "سليم"), goal("2", "تعذر الحكم")], recurring_patterns: [] },
        plaafp_assessment: { ...emptyModelOutput().plaafp_assessment, judgment: "يحتاج تحسيناً جوهرياً" },
        whole_plan: { ...emptyModelOutput().whole_plan, functional_clusters: [{ role: "دور العامل", goals: ["1"] }] },
        transition_coverage: [{ concept: "التواصل الوظيفي", status: "مغطى", supporting_goals: ["1"], note: "", improvement: "" }],
      },
      sup(),
    ).report;
    const text = block(r, "decision_brief")!.lines.join("\n");
    expect(text).toContain("تمت مراجعة 2 هدفاً: 1 سليمة، 0 تحتاج تعديلاً، 1 تعذر الحكم عليها.");
    expect(text).toContain("يحتاج تحسيناً جوهرياً");
    expect(text).toContain("المسارات الوظيفية المكتشفة: 1");
    expect(text).toContain("نسبة تغطية وصفية");
    expect(selectJson(r, { ...DEFAULT_REPORT_SECTIONS, goal_review: false })["goal_review"]).toBeUndefined();
  });
});
